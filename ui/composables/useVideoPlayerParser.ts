// @ts-expect-error library ships without useful ESM typings
import untar from "js-untar";
import { gunzipSync } from "fflate";

export type VideoPlayerItemType = "mp4" | "cast" | "gua" | "part";

export interface VideoPlayerMeta {
  id?: string
  account?: string
  user?: string
  asset?: string
  protocol?: string
  command_amount?: number
  date_end?: string
  date_start?: string
  duration?: string
  files?: VideoPlayerFileMeta[]
}

export interface VideoPlayerFileMeta {
  name?: string
  start?: number
  end?: number
  duration?: number
}

interface EffectiveItemMeta extends VideoPlayerMeta {
  fileStart?: number
  fileEnd?: number
  fileDuration?: number
}

export interface VideoPlayerItem {
  id: string
  name: string
  source: string
  type: VideoPlayerItemType
  meta: VideoPlayerMeta
  recordingId: string
  recordingLabel: string
  partIndex?: number
  partTotal?: number
  tempPath?: string
  castData?: string
}

interface ParseResult {
  items: VideoPlayerItem[]
}

interface UntarEntry {
  name: string
  buffer: ArrayBuffer
}

const REGEXP = /\.(json|replay|cast|part)(\.mp4|\.json|\.gz)?$/;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function basename(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

function stripArchiveExtension(fileName: string) {
  return basename(fileName)
    .replace(/\.tar$/i, "")
    .replace(/\.cast\.gz$/i, "")
    .replace(/\.cast$/i, "")
    .replace(/\.replay\.gz$/i, "")
    .replace(/\.part\.gz$/i, "")
    .replace(/\.mp4$/i, "");
}

function isGzipBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function decodeCastBuffer(buffer: ArrayBuffer) {
  try {
    const bytes = new Uint8Array(buffer);
    const output = isGzipBuffer(buffer) ? gunzipSync(bytes) : bytes;
    return new TextDecoder("utf-8").decode(output);
  } catch {
    return null;
  }
}

function isCastMediaEntry(fileName: string) {
  const baseName = basename(fileName).toLowerCase();

  if (baseName.includes(".part.")) return false;

  return baseName.endsWith(".cast.gz") || baseName.endsWith(".cast");
}

function isMetadataEntry(fileName: string) {
  const match = basename(fileName).match(REGEXP);

  if (!match) return false;

  return match[0] === ".replay.json" || match[1] === "json";
}

function metadataKey(fileName: string, meta: VideoPlayerMeta) {
  if (meta.id) return meta.id;

  return basename(fileName).replace(/\.replay\.json$/i, "").replace(/\.json$/i, "");
}

function safeParseJson(buffer: ArrayBuffer): VideoPlayerMeta | null {
  try {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    return JSON.parse(text) as VideoPlayerMeta;
  } catch {
    return null;
  }
}

function formatMillisDuration(millis?: number) {
  if (!millis || millis < 0) return undefined;

  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
}

function formatTimestamp(millis?: number) {
  if (!millis || millis < 0) return undefined;

  const date = new Date(millis);

  if (Number.isNaN(date.getTime())) return undefined;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function resolveItemMeta(meta: VideoPlayerMeta | null, entryName: string): EffectiveItemMeta {
  if (!meta) return {};

  const entryBaseName = basename(entryName);
  const fileMeta = meta.files?.find((file) => {
    const fileBaseName = file.name ? basename(file.name) : "";

    return fileBaseName === entryBaseName || file.name === entryName;
  });

  return {
    ...meta,
    date_start: formatTimestamp(fileMeta?.start) || meta.date_start,
    date_end: formatTimestamp(fileMeta?.end) || meta.date_end,
    duration: formatMillisDuration(fileMeta?.duration) || meta.duration,
    fileStart: fileMeta?.start,
    fileEnd: fileMeta?.end,
    fileDuration: fileMeta?.duration
  };
}

function toMp4Url(buffer: ArrayBuffer) {
  const blob = new Blob([new Uint8Array(buffer)], { type: "video/mp4" });
  return URL.createObjectURL(blob);
}

function toGzipUrl(buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: "application/gzip" });
  return URL.createObjectURL(blob);
}

function withMeta(item: Omit<VideoPlayerItem, "id" | "meta">, meta: VideoPlayerMeta | null): VideoPlayerItem {
  return {
    id: createId(item.name),
    meta: meta || {},
    ...item
  };
}

export function useVideoPlayerParser() {
  function buildCastItem(
    fileName: string,
    buffer: ArrayBuffer,
    meta: VideoPlayerMeta | null
  ): VideoPlayerItem | null {
    const castData = decodeCastBuffer(buffer);

    if (!castData) return null;

    return withMeta(
      {
        name: basename(fileName),
        source: "",
        castData,
        type: "cast"
      },
      resolveItemMeta(meta, fileName)
    );
  }

  async function buildItemFromEntry(
    entry: UntarEntry,
    meta: VideoPlayerMeta | null
  ): Promise<VideoPlayerItem | null> {
    const entryName = basename(entry.name);
    const match = entryName.match(REGEXP);
    const kind = match?.[1];
    const effectiveMeta = resolveItemMeta(meta, entry.name);

    if (isCastMediaEntry(entry.name)) {
      return buildCastItem(entry.name, entry.buffer, meta);
    }

    switch (kind) {
      case "replay": {
        const isGua = entry.name.split(".")[2] === "gz";

        if (isGua) {
          return withMeta(
            {
              name: basename(entry.name),
              source: toGzipUrl(entry.buffer),
              type: "gua"
            },
            effectiveMeta
          );
        }

        return withMeta(
          {
            name: basename(entry.name),
            source: toMp4Url(entry.buffer),
            type: "mp4"
          },
          effectiveMeta
        );
      }
      case "part": {
        return withMeta(
          {
            name: basename(entry.name),
            source: toGzipUrl(entry.buffer),
            type: "part"
          },
          effectiveMeta
        );
      }
      default:
        return null;
    }
  }

  async function parseTarFile(file: File): Promise<ParseResult> {
    const recordingId = createId(file.name);
    const recordingLabel = stripArchiveExtension(file.name);
    const extractedFiles = await untar(await file.arrayBuffer()).progress(() => {});
    let meta: VideoPlayerMeta | null = null;
    const items: VideoPlayerItem[] = [];

    for (const entry of extractedFiles as UntarEntry[]) {
      if (!isMetadataEntry(entry.name)) continue;

      meta = safeParseJson(entry.buffer) || meta;
    }

    for (const entry of extractedFiles as UntarEntry[]) {
      const match = basename(entry.name).match(REGEXP);

      if (!match || isMetadataEntry(entry.name)) continue;

      const item = await buildItemFromEntry(entry, meta);

      if (item) {
        items.push({
          ...item,
          recordingId,
          recordingLabel
        });
      }
    }

    const partFileTotal = meta?.files?.filter((file) => file.name?.includes(".part.gz")).length || 0;
    const hasExplicitParts = partFileTotal > 1;

    if (hasExplicitParts) {
      items.forEach((item) => {
        if (item.type !== "part") return;

        const partMatch = item.name.match(/\.(\d+)\.part\.gz$/i);
        item.partIndex = partMatch ? Number(partMatch[1]) + 1 : undefined;
        item.partTotal = partFileTotal;
      });
    }

    return { items };
  }

  async function parseSingleFile(file: File, meta: VideoPlayerMeta | null = null): Promise<ParseResult> {
    const fileName = basename(file.name);
    const recordingId = createId(fileName);
    const recordingLabel = stripArchiveExtension(fileName);
    const effectiveMeta = resolveItemMeta(meta, fileName);
    const items: VideoPlayerItem[] = [];

    if (fileName.endsWith(".mp4")) {
      items.push(withMeta({
        name: fileName,
        source: toMp4Url(await file.arrayBuffer()),
        type: "mp4",
        recordingId,
        recordingLabel
      }, effectiveMeta));
      return { items };
    }

    if (isCastMediaEntry(fileName)) {
      const castItem = buildCastItem(fileName, await file.arrayBuffer(), meta);

      if (castItem) {
        items.push({
          ...castItem,
          recordingId,
          recordingLabel
        });
      }

      return { items };
    }

    if (fileName.endsWith(".replay.gz")) {
      items.push(withMeta({
        name: fileName,
        source: URL.createObjectURL(file),
        type: "gua",
        recordingId,
        recordingLabel
      }, effectiveMeta));
      return { items };
    }

    if (fileName.endsWith(".part.gz")) {
      items.push(withMeta({
        name: fileName,
        source: URL.createObjectURL(file),
        type: "part",
        recordingId,
        recordingLabel
      }, effectiveMeta));
      return { items };
    }

    return { items };
  }

  async function parseFiles(files: File[]) {
    const items: VideoPlayerItem[] = [];
    const metaByKey = new Map<string, VideoPlayerMeta>();
    const tarFiles: File[] = [];
    const mediaFiles: File[] = [];

    for (const file of files) {
      const fileName = basename(file.name);

      if (fileName.includes(".tar")) {
        tarFiles.push(file);
        continue;
      }

      if (isMetadataEntry(fileName)) {
        const parsedMeta = safeParseJson(await file.arrayBuffer());

        if (parsedMeta) {
          metaByKey.set(metadataKey(fileName, parsedMeta), parsedMeta);
        }

        continue;
      }

      mediaFiles.push(file);
    }

    for (const file of tarFiles) {
      items.push(...(await parseTarFile(file)).items);
    }

    for (const file of mediaFiles) {
      const fileName = basename(file.name);
      const meta = metaByKey.get(stripArchiveExtension(fileName)) || null;
      items.push(...(await parseSingleFile(file, meta)).items);
    }

    return items;
  }

  return {
    parseFiles
  };
}
