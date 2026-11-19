import { gunzipSync } from "fflate";

export type OfflineMediaType = "mp4" | "cast" | "gua";

export interface ClassifiedName {
  kind: "metadata" | OfflineMediaType | null;
  partIndex?: number;
}

export interface PlayableMedia {
  type: OfflineMediaType;
  buffer: ArrayBuffer;
  partIndex?: number;
}

export function basename(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

export function isGzipBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export interface OfflineMediaStream {
  stream(): ReadableStream<Uint8Array<ArrayBuffer>>;
}

/** Decode at most two historical gzip layers, preserving upstream backpressure. */
export async function openOfflineMediaStream(
  input: OfflineMediaStream
): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
  let reader = input.stream().getReader();
  try {
    for (let layer = 0; layer <= 2; layer++) {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const prefix: number[] = [];
      while (prefix.length < 2) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.length) {
          chunks.push(chunk.value);
          for (const byte of chunk.value) {
            prefix.push(byte);
            if (prefix.length === 2) break;
          }
        }
      }
      const gzip = prefix[0] === 0x1f && prefix[1] === 0x8b;
      if (gzip && layer === 2) throw new Error("Too many gzip layers in recording.");
      if (gzip && typeof DecompressionStream !== "function") {
        throw new Error("This browser does not support streaming gzip recordings.");
      }
      const upstream = reader;
      let ended = false;
      const joined = new ReadableStream<Uint8Array<ArrayBuffer>>({
        async pull(controller) {
          if (ended) return;
          if (chunks.length) controller.enqueue(chunks.shift()!);
          else {
            try {
              const chunk = await upstream.read();
              if (ended) return;
              if (chunk.done) {
                ended = true;
                controller.close();
                upstream.releaseLock();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              if (ended) return;
              ended = true;
              upstream.releaseLock();
              throw error;
            }
          }
        },
        async cancel(reason) {
          ended = true;
          chunks.length = 0;
          try {
            await upstream.cancel(reason);
          } finally {
            upstream.releaseLock();
          }
        }
      });
      if (!gzip) return joined;
      reader = joined.pipeThrough(new DecompressionStream("gzip")).getReader();
    }
    throw new Error("Too many gzip layers in recording.");
  } catch (error) {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    throw error;
  }
}

/** Inspect a bounded decoded prefix; archive entries never need a complete Blob. */
export async function readOfflineMediaHeader(input: Blob | OfflineMediaStream) {
  if (input instanceof Blob) {
    const header = await input.slice(0, 512).arrayBuffer();
    if (!isGzipBuffer(header)) return header;
  }
  const reader = (await openOfflineMediaStream(input)).getReader();
  const bytes = new Uint8Array(512);
  let length = 0;
  try {
    while (length < bytes.length) {
      const result = await reader.read();
      if (result.done) break;
      const remaining = Math.min(result.value.length, bytes.length - length);
      bytes.set(result.value.subarray(0, remaining), length);
      length += remaining;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return bytes.buffer.slice(0, length);
}

export function isTarBuffer(buffer: ArrayBuffer) {
  if (buffer.byteLength < 262) return false;

  const bytes = new Uint8Array(buffer);
  return (
    bytes[257] === 0x75 && bytes[258] === 0x73 && bytes[259] === 0x74 && bytes[260] === 0x61 && bytes[261] === 0x72
  );
}

export function isTarPackageName(fileName: string) {
  const lower = basename(fileName).toLowerCase();
  return lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz");
}

export function parsePartIndex(fileName: string) {
  const lower = basename(fileName).toLowerCase();
  const part = lower.match(/\.(\d+)\.part(?:\.cast\.gz|\.cast|\.mp4|\.gz)?$/);
  if (part) return Number(part[1]);
  const cast = lower.match(/\.(\d+)\.cast(?:\.gz)?$/);
  if (cast) return Number(cast[1]);
  return undefined;
}

export function classifyOfflineName(fileName: string): ClassifiedName {
  const lower = basename(fileName).toLowerCase();
  const partIndex = parsePartIndex(fileName);

  if (lower.endsWith(".json")) return { kind: "metadata" };
  if (lower.endsWith(".part.gz")) return { kind: "gua", partIndex };
  if (lower.endsWith(".part.mp4")) return { kind: "mp4", partIndex };
  if (lower.endsWith(".part.cast.gz") || lower.endsWith(".part.cast")) return { kind: "cast", partIndex };
  if (lower.endsWith(".replay.gz") || lower.endsWith(".replay")) return { kind: "gua", partIndex };
  if (lower.endsWith(".cast.gz") || lower.endsWith(".cast")) return { kind: "cast", partIndex };
  if (lower.endsWith(".mp4")) return { kind: "mp4", partIndex };
  return { kind: null, partIndex };
}

export function stripReplayJsonExtension(fileName: string) {
  return basename(fileName)
    .replace(/\.replay\.json$/i, "")
    .replace(/\.json$/i, "");
}

export function stripOfflineExtension(fileName: string) {
  return basename(fileName)
    .replace(/\.tar\.gz$/i, "")
    .replace(/\.tgz$/i, "")
    .replace(/\.replay\.tar$/i, "")
    .replace(/\.tar$/i, "")
    .replace(/\.\d+\.part(?:\.cast\.gz|\.cast|\.mp4|\.gz)?$/i, "")
    .replace(/\.\d+\.cast(?:\.gz)?$/i, "")
    .replace(/\.cast\.gz$/i, "")
    .replace(/\.cast$/i, "")
    .replace(/\.replay\.gz$/i, "")
    .replace(/\.replay$/i, "")
    .replace(/\.part\.mp4$/i, "")
    .replace(/\.mp4$/i, "")
    .replace(/\.gz$/i, "");
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function unwrapGzip(buffer: ArrayBuffer, maxLayers = 2) {
  let current = buffer;

  for (let i = 0; i < maxLayers && isGzipBuffer(current); i += 1) {
    try {
      current = toArrayBuffer(gunzipSync(new Uint8Array(current)));
    } catch {
      break;
    }
  }

  return current;
}

function isMp4Buffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function skipSpace(bytes: Uint8Array) {
  let index = 0;

  while (
    index < bytes.length &&
    (bytes[index] === 0x20 || bytes[index] === 0x09 || bytes[index] === 0x0a || bytes[index] === 0x0d)
  ) {
    index += 1;
  }

  return index;
}

function headText(buffer: ArrayBuffer, maxBytes: number) {
  const bytes = new Uint8Array(buffer);
  const start = skipSpace(bytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(start, Math.min(start + maxBytes, bytes.length))
  );
}

function isCastBuffer(buffer: ArrayBuffer) {
  const head = headText(buffer, 256);
  return head.startsWith("{") && /"version"\s*:/.test(head);
}

function isGuaBuffer(buffer: ArrayBuffer) {
  return /^\d+\.[A-Z]/i.test(headText(buffer, 64));
}

export function resolvePlayableMedia(fileName: string, buffer: ArrayBuffer): PlayableMedia | null {
  const named = classifyOfflineName(fileName);

  if (named.kind === "metadata") return null;

  const unwrapped = unwrapGzip(buffer);

  if (isTarBuffer(buffer) || isTarBuffer(unwrapped)) return null;

  if (named.kind === "mp4") {
    return { type: "mp4", buffer: isGzipBuffer(buffer) ? unwrapped : buffer, partIndex: named.partIndex };
  }

  if (named.kind === "cast" || named.kind === "gua") {
    return { type: named.kind, buffer, partIndex: named.partIndex };
  }

  if (isMp4Buffer(unwrapped)) return { type: "mp4", buffer: unwrapped, partIndex: named.partIndex };
  if (isCastBuffer(unwrapped)) return { type: "cast", buffer, partIndex: named.partIndex };
  if (isGuaBuffer(unwrapped)) return { type: "gua", buffer, partIndex: named.partIndex };
  return null;
}

function partSessionKey(item: { type: string; name: string; meta?: { id?: string } }) {
  return `${item.type}:${item.meta?.id || stripOfflineExtension(item.name)}`;
}

export function assignPartTotals<
  T extends { type: string; name: string; partIndex?: number; partTotal?: number; meta?: { id?: string } }
>(items: T[], metaFiles?: Array<{ name?: string }>) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    if (item.partIndex == null) continue;
    const key = partSessionKey(item);
    const parts = groups.get(key);
    if (parts) parts.push(item);
    else groups.set(key, [item]);
  }

  for (const [key, parts] of groups) {
    const type = key.slice(0, key.indexOf(":"));
    const stems = new Set(parts.map((part) => stripOfflineExtension(part.name)));
    const metaCount =
      metaFiles?.filter((file) => {
        if (!file.name) return false;
        const classified = classifyOfflineName(file.name);
        return classified.kind === type && classified.partIndex != null && stems.has(stripOfflineExtension(file.name));
      }).length || 0;
    const total = Math.max(parts.length, metaCount);

    if (total <= 1) continue;

    for (const part of parts) part.partTotal = total;
  }

  return items;
}
