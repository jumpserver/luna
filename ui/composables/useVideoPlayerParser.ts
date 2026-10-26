import type { OfflineMediaType } from "~/utils/offlineMedia";
import type { ArchivedRecordingEntry } from "~/utils/browserRecordingArchive";
import { gunzipSync } from "fflate";
import { importRecordingArchive, removeRecordingArchive, streamArchiveEntry } from "~/utils/browserRecordingArchive";
import {
  assignPartTotals,
  basename,
  classifyOfflineName,
  isGzipBuffer,
  isTarBuffer,
  isTarPackageName,
  openOfflineMediaStream,
  readOfflineMediaHeader,
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
  recordingBlob?: Blob;
  recordingEntry?: ArchivedRecordingEntry;
}

interface ParseResult {
  items: VideoPlayerItem[];
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason || new DOMException("Recording import cancelled.", "AbortError");
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

export async function releaseBrowserVideoPlayerItems(removed: VideoPlayerItem[], retained: VideoPlayerItem[] = []) {
  const retainedArchives = new Set(retained.map((item) => item.recordingEntry?.archiveId));
  const retainedSources = new Set(retained.map((item) => item.source));
  const archives = new Set<string>();
  for (const item of removed) {
    if (item.source.startsWith("blob:") && !retainedSources.has(item.source)) URL.revokeObjectURL(item.source);
    const archiveId = item.recordingEntry?.archiveId;
    if (archiveId && !retainedArchives.has(archiveId)) archives.add(archiveId);
  }
  await Promise.allSettled([...archives].map((id) => removeRecordingArchive(id)));
}

async function readArchivedMeta(entry: ArchivedRecordingEntry, remainingBytes: number, signal?: AbortSignal) {
  const stream = await openOfflineMediaStream({ stream: () => streamArchiveEntry(entry, signal) });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const text: string[] = [];
  let length = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 1024 * 1024) throw new Error("Recording metadata exceeds the 1 MiB limit.");
      if (length > remainingBytes) throw new Error("Recording archive metadata exceeds the 16 MiB limit.");
      text.push(decoder.decode(result.value, { stream: true }));
    }
    text.push(decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return { meta: JSON.parse(text.join("")) as VideoPlayerMeta, byteLength: length };
  } catch {
    return { meta: null, byteLength: length };
  }
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

  async function buildItemFromBlob(
    fileName: string,
    blob: Blob,
    meta: VideoPlayerMeta | null,
    recordingId: string,
    recordingLabel: string,
    header?: ArrayBuffer
  ): Promise<VideoPlayerItem | null> {
    const resolved = resolvePlayableMedia(fileName, header || (await readOfflineMediaHeader(blob)));
    const effectiveMeta = resolveItemMeta(meta, fileName);

    if (!resolved) return null;

    if (resolved.type === "cast") {
      return buildCastItem(fileName, await blob.arrayBuffer(), meta, recordingId, recordingLabel, resolved.partIndex);
    }

    if (resolved.type === "mp4") {
      const compressed = isGzipBuffer(await blob.slice(0, 2).arrayBuffer());
      return withPartIndex(
        withMeta(
          {
            name: basename(fileName),
            source: compressed ? toMp4Url(unwrapGzip(await blob.arrayBuffer())) : URL.createObjectURL(blob),
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
          source: "",
          recordingBlob: blob,
          type: "gua",
          recordingId,
          recordingLabel
        },
        effectiveMeta
      ),
      resolved.partIndex
    );
  }

  async function parseArchiveFile(file: File, signal?: AbortSignal): Promise<ParseResult> {
    const archive = await importRecordingArchive(file, signal);
    try {
      const entries = archive.entries.filter(
        (entry) => !entry.name.split("/").some((segment) => segment === "__MACOSX" || segment.startsWith("._"))
      );
      const metas: VideoPlayerMeta[] = [];
      const metaByKey = new Map<string, VideoPlayerMeta>();
      let metadataBytes = 0;
      for (const entry of entries) {
        throwIfAborted(signal);
        if (!isMetadataEntry(entry.name)) continue;
        const { meta, byteLength } = await readArchivedMeta(entry, 16 * 1024 * 1024 - metadataBytes, signal);
        metadataBytes += byteLength;
        if (meta) {
          metas.push(meta);
          indexReplayMeta(metaByKey, entry.name, meta);
        }
      }

      const items: VideoPlayerItem[] = [];
      for (const entry of entries) {
        throwIfAborted(signal);
        if (isMetadataEntry(entry.name)) continue;
        const header = await readOfflineMediaHeader({ stream: () => streamArchiveEntry(entry, signal) });
        const resolved = resolvePlayableMedia(entry.name, header);
        if (!resolved) continue;
        const meta = lookupReplayMeta(metaByKey, entry.name) || (metas.length === 1 ? metas[0]! : null);
        items.push(
          withPartIndex(
            {
              id: `${archive.archiveId}:${entry.entryId}`,
              name: basename(entry.name),
              source: "",
              recordingEntry: entry,
              type: resolved.type,
              meta: resolveItemMeta(meta, entry.name),
              recordingId: archive.archiveId,
              recordingLabel: stripOfflineExtension(file.name)
            },
            resolved.partIndex
          )
        );
      }

      throwIfAborted(signal);
      assignPartTotals(
        items,
        metas.flatMap((meta) => meta.files || [])
      );
      if (!items.length) await removeRecordingArchive(archive.archiveId);
      return { items };
    } catch (error) {
      await removeRecordingArchive(archive.archiveId);
      throw error;
    }
  }

  async function parseSingleBlob(
    fileName: string,
    blob: Blob,
    meta: VideoPlayerMeta | null = null,
    header?: ArrayBuffer
  ): Promise<ParseResult> {
    const recordingId = createId(fileName);
    const recordingLabel = stripOfflineExtension(fileName);
    const item = await buildItemFromBlob(fileName, blob, meta, recordingId, recordingLabel, header);

    return { items: item ? [item] : [] };
  }

  async function parseFiles(files: File[], signal?: AbortSignal) {
    const items: VideoPlayerItem[] = [];
    const metaByKey = new Map<string, VideoPlayerMeta>();
    const archives: File[] = [];
    const mediaFiles: Array<{ file: File; header: ArrayBuffer }> = [];
    const looseItems: VideoPlayerItem[] = [];

    try {
      for (const file of files) {
        throwIfAborted(signal);
        const fileName = basename(file.name);
        const header = await readOfflineMediaHeader(file);

        if (isTarBuffer(header) || isTarPackageName(fileName)) {
          archives.push(file);
          continue;
        }

        if (isMetadataEntry(fileName)) {
          const parsedMeta = safeParseJson(unwrapGzip(await file.arrayBuffer()));

          if (parsedMeta) indexReplayMeta(metaByKey, fileName, parsedMeta);

          continue;
        }

        mediaFiles.push({ file, header });
      }

      for (const archive of archives) {
        throwIfAborted(signal);
        items.push(...(await parseArchiveFile(archive, signal)).items);
      }

      for (const { file, header } of mediaFiles) {
        throwIfAborted(signal);
        const meta = lookupReplayMeta(metaByKey, file.name);
        looseItems.push(...(await parseSingleBlob(file.name, file, meta, header)).items);
      }

      assignPartTotals(looseItems);
      items.push(...looseItems);
      throwIfAborted(signal);
      return items;
    } catch (error) {
      await releaseBrowserVideoPlayerItems([...items, ...looseItems]);
      throw error;
    }
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
