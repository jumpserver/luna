import { openOfflineMediaStream } from "./offlineMedia";

export interface ArchivedRecordingEntry {
  archiveId: string;
  entryId: number;
  name: string;
  size: number;
}

const BLOCK_SIZE = 2 * 1024 * 1024;
const METADATA_LIMIT = 1024 * 1024;
const ENTRY_LIMIT = 10_000;
const NAME_LIMIT = 4096;
const DATABASE_PREFIX = "jms-guacamole-archive-v1-";
const decoder = new TextDecoder();
interface Archive {
  database: IDBDatabase;
  lifetime: AbortController;
  entries: Map<number, ArchivedRecordingEntry>;
}
const archives = new Map<string, Archive>();
let swept = false;
const cancelled = () => new DOMException("Recording archive operation cancelled", "AbortError");
const checkSignal = (signal?: AbortSignal) => {
  if (signal?.aborted) throw cancelled();
};

function discardDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      // A foreign inspector may hold a connection; the queued deletion completes when it closes.
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function sweepAbandonedArchives() {
  if (swept || typeof indexedDB.databases !== "function") return;
  swept = true;
  void indexedDB
    .databases()
    .then((databases) => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const { name } of databases) {
        if (
          name?.startsWith(DATABASE_PREFIX) &&
          !archives.has(name) &&
          Number(name.slice(DATABASE_PREFIX.length).split("-")[0]) < cutoff
        ) {
          // Active connections in other tabs block deletion until their owners release them.
          void discardDatabase(name);
        }
      }
    })
    .catch(() => {});
}

async function openArchive(archiveId: string, signal?: AbortSignal): Promise<Archive> {
  checkSignal(signal);
  if (typeof indexedDB === "undefined") throw new Error("Browser storage is required to import recording archives.");
  sweepAbandonedArchives();
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(archiveId, 1);
    const abort = () => reject(cancelled());
    signal?.addEventListener("abort", abort, { once: true });
    request.onupgradeneeded = () => request.result.createObjectStore("chunks");
    request.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(request.error || new Error("Recording archive storage is unavailable."));
    };
    request.onsuccess = () => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        request.result.close();
        void discardDatabase(archiveId);
        reject(cancelled());
      } else resolve(request.result);
    };
  });
  const archive: Archive = { database, lifetime: new AbortController(), entries: new Map() };
  archives.set(archiveId, archive);
  return archive;
}

async function writeBlock(
  archive: Archive,
  entryId: number,
  index: number,
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal
) {
  checkSignal(signal);
  await new Promise<void>((resolve, reject) => {
    const tx = archive.database.transaction("chunks", "readwrite");
    const abort = () => {
      try {
        tx.abort();
      } catch {}
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    tx.oncomplete = () => {
      cleanup();
      resolve();
    };
    tx.onabort = () => {
      cleanup();
      reject(signal.aborted ? cancelled() : tx.error || new Error("Unable to cache recording archive."));
    };
    try {
      tx.objectStore("chunks").put(bytes.buffer, [entryId, index]);
    } catch (error) {
      cleanup();
      abort();
      reject(error);
    }
  });
  checkSignal(signal);
}

function textField(bytes: Uint8Array, start = 0, length = bytes.length) {
  let end = start;
  while (end < start + length && bytes[end] !== 0) end++;
  return decoder.decode(bytes.subarray(start, end));
}

function tarNumber(bytes: Uint8Array) {
  if (bytes[0]! & 0x80) {
    // GNU base-256 positive integers; negative file lengths are invalid.
    if (bytes[0]! & 0x40) throw new Error("Invalid negative tar entry size.");
    let value = BigInt(bytes[0]! & 0x7f);
    for (const byte of bytes.subarray(1)) value = value * 256n + BigInt(byte);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Tar entry size exceeds the supported range.");
    return Number(value);
  }
  const text = decoder.decode(bytes).replace(/^[\0 ]+|[\0 ]+$/g, "");
  if (!/^[0-7]*$/.test(text)) throw new Error("Invalid tar numeric field.");
  const value = text ? Number.parseInt(text, 8) : 0;
  if (!Number.isSafeInteger(value)) throw new Error("Tar entry size exceeds the supported range.");
  return value;
}

function parseHeader(header: Uint8Array) {
  const checksum = tarNumber(header.subarray(148, 156));
  let unsigned = 0;
  let signed = 0;
  for (let index = 0; index < header.length; index++) {
    const byte = index >= 148 && index < 156 ? 32 : header[index]!;
    unsigned += byte;
    signed += byte > 127 ? byte - 256 : byte;
  }
  if (checksum !== unsigned && checksum !== signed) throw new Error("Invalid tar header checksum.");
  let name = textField(header, 0, 100);
  // Old GNU headers reuse this area for other fields; only POSIX USTAR has a prefix.
  if (textField(header, 257, 6) === "ustar") {
    const prefix = textField(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
  }
  return { name, size: tarNumber(header.subarray(124, 136)), type: String.fromCharCode(header[156]!) };
}

type Pax = { path?: string; size?: string; sparse?: string };
function parsePax(bytes: Uint8Array): Pax {
  const fields: Pax = {};
  for (let offset = 0; offset < bytes.length;) {
    let space = offset;
    while (space < bytes.length && bytes[space] !== 32) space++;
    const count = decoder.decode(bytes.subarray(offset, space));
    if (!/^\d{1,16}$/.test(count)) throw new Error("Invalid PAX record length.");
    const length = Number(count);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > bytes.length || end <= space + 2 || bytes[end - 1] !== 10) {
      throw new Error("Truncated or invalid PAX record.");
    }
    let equals = space + 1;
    while (equals < end - 1 && bytes[equals] !== 61) equals++;
    if (equals === space + 1 || equals === end - 1) throw new Error("Invalid PAX attribute.");
    const key = decoder.decode(bytes.subarray(space + 1, equals));
    if (key === "path" || key === "size") fields[key] = decoder.decode(bytes.subarray(equals + 1, end - 1));
    else if (key.startsWith("GNU.sparse.") || key === "SCHILY.realsize") fields.sparse = "1";
    offset = end;
  }
  return fields;
}

function paxSize(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid PAX entry size.");
  return Number(value);
}

/**
 * Import ordinary tar entries to temporary browser storage without expanding the archive in memory.
 * The index is limited to 10,000 files and 4096 characters per filename; metadata is limited to 1 MiB.
 */
export async function importRecordingArchive(
  file: Blob,
  signal?: AbortSignal
): Promise<{ archiveId: string; entries: ArchivedRecordingEntry[] }> {
  const archiveId = `${DATABASE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  try {
    checkSignal(signal);
    const archive = await openArchive(archiveId, controller.signal);
    const stream = file.stream().pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>(), {
      signal: controller.signal
    });
    reader = (await openOfflineMediaStream({ stream: () => stream })).getReader();
    let chunk: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    let position = 0;
    async function readExact(length: number): Promise<Uint8Array<ArrayBuffer>> {
      const bytes = new Uint8Array(length);
      for (let offset = 0; offset < length;) {
        checkSignal(controller.signal);
        if (position === chunk.length) {
          const next = await reader!.read();
          if (next.done) throw new Error("Truncated tar recording archive.");
          chunk = next.value;
          position = 0;
          if (!chunk.length) continue;
        }
        const count = Math.min(length - offset, chunk.length - position);
        bytes.set(chunk.subarray(position, position + count), offset);
        position += count;
        offset += count;
      }
      return bytes;
    }
    async function discard(length: number) {
      while (length > 0) {
        const count = Math.min(length, BLOCK_SIZE);
        await readExact(count);
        length -= count;
      }
    }
    const entries: ArchivedRecordingEntry[] = [];
    let globalPax: Pax = {};
    let localPax: Pax = {};
    let longName: string | undefined;
    for (;;) {
      const header = await readExact(512);
      if (header.every((byte) => byte === 0)) {
        if (!(await readExact(512)).every((byte) => byte === 0)) throw new Error("Invalid tar end marker.");
        // Drain padding, including gzip trailers, to catch truncated/corrupt compressed archives.
        if (chunk.subarray(position).some((byte) => byte !== 0))
          throw new Error("Unexpected data after tar end marker.");
        for (;;) {
          checkSignal(controller.signal);
          const tail = await reader.read();
          if (tail.done) break;
          if (tail.value.some((byte) => byte !== 0)) throw new Error("Unexpected data after tar end marker.");
        }
        break;
      }
      const parsed = parseHeader(header);
      if (parsed.type === "S") throw new Error("Old GNU sparse tar entries are not supported.");
      if (["x", "g", "L", "K"].includes(parsed.type)) {
        if (parsed.size > METADATA_LIMIT) throw new Error("Tar metadata exceeds the 1 MiB limit.");
        const metadata = await readExact(parsed.size);
        if (parsed.type === "x") localPax = { ...localPax, ...parsePax(metadata) };
        else if (parsed.type === "g") globalPax = { ...globalPax, ...parsePax(metadata) };
        else if (parsed.type === "L") longName = textField(metadata);
        await discard((512 - (parsed.size % 512)) % 512);
        continue;
      }
      const pax = { ...globalPax, ...localPax };
      const name = pax.path || longName || parsed.name;
      const size = paxSize(pax.size, parsed.size);
      const regular = (parsed.type === "0" || parsed.type === "\0") && !pax.sparse && !name.endsWith("/");
      localPax = {};
      longName = undefined;
      if (!name || name.includes("\0")) throw new Error("Invalid tar entry name.");
      if (name.length > NAME_LIMIT) throw new Error("Tar entry name exceeds the 4096 character limit.");
      if (regular) {
        if (entries.length >= ENTRY_LIMIT) throw new Error("Recording archive exceeds the 10,000 file limit.");
        const entry: ArchivedRecordingEntry = { archiveId, entryId: entries.length, name, size };
        for (let offset = 0, index = 0; offset < size; index++) {
          const bytes = await readExact(Math.min(BLOCK_SIZE, size - offset));
          await writeBlock(archive, entry.entryId, index, bytes, controller.signal);
          offset += bytes.length;
        }
        entries.push(entry);
        archive.entries.set(entry.entryId, entry);
      } else await discard(size);
      await discard((512 - (size % 512)) % 512);
    }
    checkSignal(controller.signal);
    return { archiveId, entries };
  } catch (error) {
    await removeRecordingArchive(archiveId);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("Not enough browser storage to import this recording archive.");
    }
    throw error;
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    signal?.removeEventListener("abort", abort);
  }
}

/** Read one stored entry in order; cancellation leaves the playlist's archive intact. */
export function streamArchiveEntry(
  entry: ArchivedRecordingEntry,
  signal?: AbortSignal
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const archive = archives.get(entry.archiveId);
  const stored = archive?.entries.get(entry.entryId);
  let offset = 0;
  let finished = false;
  let transaction: IDBTransaction | undefined;
  let target: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  const stop = (error?: Error) => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener("abort", abort);
    archive?.lifetime.signal.removeEventListener("abort", abort);
    try {
      transaction?.abort();
    } catch {}
    if (error) target.error(error);
  };
  function abort() {
    stop(cancelled());
  }
  return new ReadableStream(
    {
      start(controller) {
        target = controller;
        if (!archive || !stored || stored.size !== entry.size || stored.name !== entry.name) {
          stop(new Error("Recording archive is no longer available. Please import it again."));
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        archive.lifetime.signal.addEventListener("abort", abort, { once: true });
        if (signal?.aborted || archive.lifetime.signal.aborted) abort();
      },
      async pull(controller) {
        if (finished) return;
        if (offset === entry.size) {
          stop();
          controller.close();
          return;
        }
        try {
          const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
            transaction = archive!.database.transaction("chunks", "readonly");
            const request = transaction.objectStore("chunks").get([entry.entryId, offset / BLOCK_SIZE]);
            transaction.oncomplete = () => resolve(request.result);
            transaction.onabort = () => reject(transaction?.error || cancelled());
          });
          transaction = undefined;
          if (finished) return;
          const expected = Math.min(BLOCK_SIZE, entry.size - offset);
          if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== expected)
            throw new Error("Recording archive cache is incomplete.");
          offset += bytes.byteLength;
          controller.enqueue(new Uint8Array(bytes));
          if (offset === entry.size) {
            stop();
            controller.close();
          }
        } catch (error) {
          stop(error instanceof Error ? error : new Error("Unable to read recording archive."));
        }
      },
      cancel() {
        stop();
      }
    },
    { highWaterMark: 0 }
  );
}

export async function removeRecordingArchive(archiveId: string): Promise<void> {
  if (!archiveId.startsWith(DATABASE_PREFIX)) return;
  const archive = archives.get(archiveId);
  archives.delete(archiveId);
  archive?.lifetime.abort();
  archive?.database.close();
  await discardDatabase(archiveId);
}
