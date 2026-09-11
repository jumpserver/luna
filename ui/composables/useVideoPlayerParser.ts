import type { OfflineMediaType } from "~/utils/offlineMedia";
import { gunzipSync } from "fflate";
import untar from "js-untar";
import {
  assignPartTotals,
  basename,
  classifyOfflineName,
  isGzipBuffer,
  isTarBuffer,
  isTarPackageName,
  resolvePlayableMedia,
  stripOfflineExtension,
  stripReplayJsonExtension,
  unwrapGzip
} from "~/utils/offlineMedia";
import { resolveReplayWallClock } from "~/utils/replayWallClock";

export type VideoPlayerItemType = OfflineMediaType;

export interface VideoPlayerMeta {
  id?: string;
  account?: string;
  user?: string;
  asset?: string;
  protocol?: string;
  login_from?: string;
  remote_addr?: string;
  command_amount?: number;
  date_end?: string;
  date_start?: string;
  duration?: string;
  files?: VideoPlayerFileMeta[];
}

export interface VideoPlayerFileMeta {
  name?: string;
  start?: number;
  end?: number;
  duration?: number;
}

interface EffectiveItemMeta extends VideoPlayerMeta {
  fileStart?: number;
  fileEnd?: number;
  fileDuration?: number;
}

export interface VideoPlayerItem {
  id: string;
  name: string;
  source: string;
  type: VideoPlayerItemType;
  meta: VideoPlayerMeta;
  recordingId: string;
  recordingLabel: string;
  partIndex?: number;
  partTotal?: number;
  castData?: string;
}

interface ParseResult {
  items: VideoPlayerItem[];
}

interface UntarEntry {
  name: string;
  buffer: ArrayBuffer;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function classifyVideoPlayerEntry(fileName: string): "metadata" | VideoPlayerItemType | null {
  return classifyOfflineName(fileName).kind;
}

function isMetadataEntry(fileName: string) {
  return classifyOfflineName(fileName).kind === "metadata";
}

function indexReplayMeta(map: Map<string, VideoPlayerMeta>, fileName: string, meta: VideoPlayerMeta) {
  const stem = stripReplayJsonExtension(fileName);
  if (meta.id) map.set(meta.id, meta);
  if (stem) map.set(stem, meta);
}

function lookupReplayMeta(map: Map<string, VideoPlayerMeta>, mediaName: string) {
  return map.get(stripOfflineExtension(mediaName)) || null;
}

function mergeSidecarMeta(items: VideoPlayerItem[], sidecars: Array<{ stem: string; meta: VideoPlayerMeta }>) {
  if (sidecars.length === 0) return items;

  for (const item of items) {
    const stem = stripOfflineExtension(item.name);
    const sidecar = sidecars.find((entry) => (entry.meta.id && entry.meta.id === item.meta.id) || entry.stem === stem);
    if (!sidecar) continue;
    item.meta = { ...sidecar.meta, ...item.meta };
  }

  return items;
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

function resolveItemMeta(meta: VideoPlayerMeta | null, entryName: string): EffectiveItemMeta {
  if (!meta) return {};

  const entryBaseName = basename(entryName);
  const fileMeta = meta.files?.find((file) => {
    const fileBaseName = file.name ? basename(file.name) : "";

    return fileBaseName === entryBaseName || file.name === entryName;
  });

  // files[].start/end are Guacamole recording-clock milliseconds, not Unix epoch.
  const wall = resolveReplayWallClock(meta.date_start, fileMeta, meta.files);

  return {
    ...meta,
    date_start: wall.date_start || meta.date_start,
    date_end: wall.date_end || meta.date_end,
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
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/gzip" });
  return URL.createObjectURL(blob);
}

function withMeta(item: Omit<VideoPlayerItem, "id" | "meta">, meta: VideoPlayerMeta | null): VideoPlayerItem {
  return {
    id: createId(item.name),
    meta: meta || {},
    ...item
  };
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

function withPartIndex(item: VideoPlayerItem, partIndex?: number): VideoPlayerItem {
  if (partIndex == null) return item;

  item.partIndex = partIndex + 1;
  return item;
}

export function useVideoPlayerParser() {
  const { getEntryUrl, importRecording, removeRecording } = useOfflineRecording();

  function buildCastItem(
    fileName: string,
    buffer: ArrayBuffer,
    meta: VideoPlayerMeta | null,
    recordingId: string,
    recordingLabel: string,
    partIndex?: number
  ): VideoPlayerItem | null {
    const castData = decodeCastBuffer(buffer);

    if (!castData) return null;

    return withPartIndex(
      withMeta(
        {
          name: basename(fileName),
          source: "",
          castData,
          type: "cast",
          recordingId,
          recordingLabel
        },
        resolveItemMeta(meta, fileName)
      ),
      partIndex
    );
  }

  function buildItemFromResolved(
    fileName: string,
    buffer: ArrayBuffer,
    meta: VideoPlayerMeta | null,
    recordingId: string,
    recordingLabel: string
  ): VideoPlayerItem | null {
    const resolved = resolvePlayableMedia(fileName, buffer);
    const effectiveMeta = resolveItemMeta(meta, fileName);

    if (!resolved) return null;

    if (resolved.type === "cast") {
      return buildCastItem(fileName, resolved.buffer, meta, recordingId, recordingLabel, resolved.partIndex);
    }

    if (resolved.type === "mp4") {
      return withPartIndex(
        withMeta(
          {
            name: basename(fileName),
            source: toMp4Url(resolved.buffer),
            type: "mp4",
            recordingId,
            recordingLabel
          },
          effectiveMeta
        ),
        resolved.partIndex
      );
    }

    return withPartIndex(
      withMeta(
        {
          name: basename(fileName),
          source: toGzipUrl(resolved.buffer),
          type: "gua",
          recordingId,
          recordingLabel
        },
        effectiveMeta
      ),
      resolved.partIndex
    );
  }

  async function parseTarBuffer(fileName: string, tarBuffer: ArrayBuffer): Promise<ParseResult> {
    const recordingId = createId(fileName);
    const recordingLabel = stripOfflineExtension(fileName);
    let extractedFiles: UntarEntry[] = [];

    try {
      extractedFiles = (await untar(tarBuffer).progress(() => {})) as UntarEntry[];
    } catch {
      return { items: [] };
    }

    let meta: VideoPlayerMeta | null = null;
    const items: VideoPlayerItem[] = [];

    for (const entry of extractedFiles) {
      if (!isMetadataEntry(entry.name)) continue;

      meta = safeParseJson(entry.buffer) || meta;
    }

    for (const entry of extractedFiles) {
      if (isMetadataEntry(entry.name)) continue;

      const item = buildItemFromResolved(entry.name, entry.buffer, meta, recordingId, recordingLabel);

      if (item) {
        items.push({
          ...item,
          recordingId,
          recordingLabel
        });
      }
    }

    assignPartTotals(items, meta?.files);
    return { items };
  }

  async function parseSingleBuffer(
    fileName: string,
    buffer: ArrayBuffer,
    meta: VideoPlayerMeta | null = null
  ): Promise<ParseResult> {
    const recordingId = createId(fileName);
    const recordingLabel = stripOfflineExtension(fileName);
    const item = buildItemFromResolved(fileName, buffer, meta, recordingId, recordingLabel);

    return { items: item ? [item] : [] };
  }

  async function parseFiles(files: File[]) {
    const items: VideoPlayerItem[] = [];
    const metaByKey = new Map<string, VideoPlayerMeta>();
    const archives: Array<{ fileName: string; tarBuffer: ArrayBuffer }> = [];
    const mediaFiles: Array<{ fileName: string; buffer: ArrayBuffer }> = [];

    for (const file of files) {
      const fileName = basename(file.name);
      const buffer = await file.arrayBuffer();
      const unwrapped = unwrapGzip(buffer);
      let tarBuffer: ArrayBuffer | null = null;
      if (isTarBuffer(unwrapped)) tarBuffer = unwrapped;
      else if (isTarBuffer(buffer)) tarBuffer = buffer;

      if (tarBuffer || isTarPackageName(fileName)) {
        archives.push({ fileName, tarBuffer: tarBuffer || unwrapped });
        continue;
      }

      if (isMetadataEntry(fileName)) {
        const parsedMeta = safeParseJson(isGzipBuffer(buffer) ? unwrapped : buffer);

        if (parsedMeta) indexReplayMeta(metaByKey, fileName, parsedMeta);

        continue;
      }

      mediaFiles.push({ fileName, buffer });
    }

    for (const archive of archives) {
      items.push(...(await parseTarBuffer(archive.fileName, archive.tarBuffer)).items);
    }

    const looseItems: VideoPlayerItem[] = [];
    for (const file of mediaFiles) {
      const meta = lookupReplayMeta(metaByKey, file.fileName);
      looseItems.push(...(await parseSingleBuffer(file.fileName, file.buffer, meta)).items);
    }

    assignPartTotals(looseItems);
    items.push(...looseItems);
    return items;
  }

  async function parsePaths(filePaths: string[]) {
    const items: VideoPlayerItem[] = [];
    const importedRecordingIds: string[] = [];
    const sidecars: Array<{ stem: string; meta: VideoPlayerMeta }> = [];

    try {
      for (const filePath of filePaths) {
        if (/\.json$/i.test(filePath)) {
          const manifest = await importRecording(filePath);
          if (manifest.metadata && Object.keys(manifest.metadata).length > 0) {
            sidecars.push({ stem: stripReplayJsonExtension(filePath), meta: manifest.metadata });
          }
          continue;
        }

        const manifest = await importRecording(filePath);
        importedRecordingIds.push(manifest.recording_id);
        const clocks = manifest.entries.map((item) => ({
          start: item.start_ms,
          end: item.end_ms,
          duration: item.duration_ms
        }));

        const importedItems = await Promise.all(
          manifest.entries.map(async (entry): Promise<VideoPlayerItem> => {
            const source = await getEntryUrl(manifest.recording_id, entry.entry_id);
            const wall = resolveReplayWallClock(
              manifest.metadata.date_start,
              { start: entry.start_ms, end: entry.end_ms, duration: entry.duration_ms },
              clocks
            );
            const entryMeta: VideoPlayerMeta = {
              ...manifest.metadata,
              date_start: wall.date_start || manifest.metadata.date_start,
              date_end: wall.date_end || manifest.metadata.date_end,
              duration: formatMillisDuration(entry.duration_ms) || manifest.metadata.duration
            };
            const mediaType: VideoPlayerItemType =
              entry.media_type === "mp4" || entry.media_type === "cast" || entry.media_type === "gua"
                ? entry.media_type
                : "gua";

            return {
              id: `${manifest.recording_id}:${entry.entry_id}`,
              name: entry.source_name,
              source,
              type: mediaType,
              meta: entryMeta,
              recordingId: manifest.recording_id,
              recordingLabel: manifest.label,
              partIndex: entry.part_index == null ? undefined : entry.part_index + 1,
              partTotal: entry.part_total
            };
          })
        );

        items.push(...importedItems);
      }

      return mergeSidecarMeta(items, sidecars);
    } catch (error) {
      // 多文件导入应当表现为一次事务。后面的文件失败时，
      // 清理本次已经成功提交的录像，避免留下用户看不到的缓存。
      await Promise.allSettled(importedRecordingIds.map((recordingId) => removeRecording(recordingId)));
      throw error;
    }
  }

  return {
    parseFiles,
    parsePaths
  };
}
