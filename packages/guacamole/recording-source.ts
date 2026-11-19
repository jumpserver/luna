import type Guacamole from "./index.js";

const BLOCK_SIZE = 2 * 1024 * 1024;
const CACHE_BLOCKS = 8;
const DATABASE_PREFIX = "jms-guacamole-replay-v1-";
let sweptDatabases = false;

const cancelled = () => new DOMException("Recording closed", "AbortError");

function discardDatabase(name: string) {
  try {
    indexedDB.deleteDatabase(name);
  } catch {
    // Storage may have been disabled. Cleanup must still release the player.
  }
}

// Each playback owns a database. Open connections protect active recordings
// from stale-cache deletion, including recordings paused in another tab.
function sweepAbandonedDatabases() {
  if (sweptDatabases || typeof indexedDB.databases !== "function") return;
  sweptDatabases = true;
  void indexedDB
    .databases()
    .then((databases) => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const { name } of databases) {
        if (name?.startsWith(DATABASE_PREFIX) && Number(name.slice(DATABASE_PREFIX.length).split("-")[0]) < cutoff) {
          discardDatabase(name);
        }
      }
    })
    .catch(() => {});
}

function storageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new Error("Not enough browser storage to cache this recording.");
  }
  return error instanceof Error ? error : new Error("Browser recording storage is unavailable.");
}

/** Opens stored protocol bytes without materializing the complete input as a Blob. */
export interface RecordingStreamInput {
  stream(): ReadableStream<Uint8Array<ArrayBuffer>>;
}

/**
 * A temporary, bounded reader for recorded Guacamole protocol bytes.
 * Browser downloads/gzip files are committed to IndexedDB before being indexed.
 * Uncompressed local Files and Electron's already-extracted files are read directly.
 */
export function createRecordingSource(
  input: string | Blob | RecordingStreamInput,
  options: { disk?: boolean } = {}
): Guacamole.SessionRecording.Source {
  if (options.disk && (typeof input !== "string" || !input.startsWith("jms-asset://"))) {
    throw new Error("Disk recording sources must use jms-asset URLs.");
  }

  const lifetime = new AbortController();
  const cache = new Map<number, ArrayBuffer>();
  const databaseName = `${DATABASE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let database: IDBDatabase | undefined;
  let opening: Promise<IDBDatabase> | undefined;
  let directFile: Blob | undefined;
  let diskSize = 0;
  let available = 0;
  let started = false;
  let closed = false;

  function assertOpen() {
    if (closed) throw cancelled();
  }

  async function openDatabase(): Promise<IDBDatabase> {
    assertOpen();
    if (opening) return opening;
    if (typeof indexedDB === "undefined") throw new Error("Browser storage is required to play this recording.");
    sweepAbandonedDatabases();
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("chunks");
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        if (closed) {
          request.result.close();
          discardDatabase(databaseName);
          reject(cancelled());
          return;
        }
        database = request.result;
        resolve(database);
      };
    });
    return opening;
  }

  async function writeBlock(index: number, bytes: Uint8Array<ArrayBuffer>) {
    const db = await openDatabase();
    assertOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("chunks", "readwrite");
      tx.objectStore("chunks").put(bytes.buffer, index);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(storageError(tx.error));
    });
    assertOpen();
  }

  async function readBlock(index: number): Promise<ArrayBuffer> {
    assertOpen();
    const cached = cache.get(index);
    if (cached) {
      cache.delete(index);
      cache.set(index, cached);
      return cached;
    }
    let bytes: ArrayBuffer;
    if (options.disk) {
      const start = index * BLOCK_SIZE;
      const end = Math.min(start + BLOCK_SIZE, diskSize) - 1;
      const response = await fetch(input as string, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: lifetime.signal
      });
      const expectedRange = `bytes ${start}-${end}/${diskSize}`;
      if (response.status !== 206 || response.headers.get("Content-Range") !== expectedRange) {
        await response.body?.cancel();
        throw new Error("The recording file does not support byte-range reads.");
      }
      bytes = await response.arrayBuffer();
      if (bytes.byteLength !== end - start + 1) throw new Error("Incomplete recording file read.");
    } else {
      const db = await openDatabase();
      bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const tx = db.transaction("chunks", "readonly");
        const request = tx.objectStore("chunks").get(index);
        tx.oncomplete = () =>
          request.result instanceof ArrayBuffer
            ? resolve(request.result)
            : reject(new Error("Recording cache is incomplete. Please reopen the recording."));
        tx.onabort = tx.onerror = () => reject(storageError(tx.error));
      });
    }
    assertOpen();
    cache.set(index, bytes);
    while (cache.size > CACHE_BLOCKS) cache.delete(cache.keys().next().value!);
    return bytes;
  }

  async function* stream(signal?: AbortSignal): AsyncGenerator<Uint8Array> {
    assertOpen();
    if (started) throw new Error("Recording indexing has already started.");
    started = true;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    const abort = () => {
      controller.abort();
      void reader?.cancel().catch(() => {});
    };
    lifetime.signal.addEventListener("abort", abort, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted || lifetime.signal.aborted) throw cancelled();
      let body: ReadableStream<Uint8Array<ArrayBuffer>>;
      if (input instanceof Blob) {
        const prefix = new Uint8Array(await input.slice(0, 2).arrayBuffer());
        if (prefix[0] !== 0x1f || prefix[1] !== 0x8b) directFile = input;
        body = input.stream();
      } else if (typeof input !== "string") {
        body = input.stream();
      } else {
        const response = await fetch(input, { signal: controller.signal });
        if (!response.ok) throw new Error(`Unable to load recording: HTTP ${response.status}`);
        if (!response.body) throw new Error("Recording response has no content.");
        if (options.disk) {
          diskSize = Number(response.headers.get("Content-Length"));
          if (!Number.isSafeInteger(diskSize) || diskSize < 1) {
            await response.body.cancel();
            throw new Error("Recording file size is unavailable.");
          }
        }
        body = response.body;
      }

      reader = body.getReader();
      // Preserve the historical local importer's support for two gzip layers.
      for (let layer = 0; layer <= 2; layer++) {
        const firstChunks: Uint8Array<ArrayBuffer>[] = [];
        const prefix: number[] = [];
        while (prefix.length < 2) {
          const first = await reader!.read();
          if (controller.signal.aborted) throw cancelled();
          if (first.done) break;
          if (first.value.length) {
            firstChunks.push(first.value);
            for (const byte of first.value) {
              prefix.push(byte);
              if (prefix.length === 2) break;
            }
          }
        }
        const gzip = prefix[0] === 0x1f && prefix[1] === 0x8b;
        if (gzip && layer === 2) throw new Error("Too many gzip layers in recording.");
        if (gzip && options.disk) throw new Error("Disk recording must be decompressed before playback.");
        const upstream: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> = reader!;
        const joined: ReadableStream<Uint8Array<ArrayBuffer>> = new ReadableStream({
          async pull(target) {
            if (firstChunks.length) target.enqueue(firstChunks.shift()!);
            else {
              const chunk = await upstream.read();
              if (chunk.done) target.close();
              else target.enqueue(chunk.value);
            }
          },
          cancel: (reason) => upstream.cancel(reason)
        });
        if (gzip && typeof DecompressionStream !== "function") {
          throw new Error("This browser does not support streaming gzip recording playback.");
        }
        reader = (gzip ? joined.pipeThrough(new DecompressionStream("gzip")) : joined).getReader();

        if (!gzip) break;
      }

      let block = new Uint8Array(directFile || options.disk ? 0 : BLOCK_SIZE);
      let used = 0;
      let index = 0;
      while (!controller.signal.aborted) {
        const next = await reader!.read();
        if (controller.signal.aborted) throw cancelled();
        if (next.done) break;
        if (directFile || options.disk) {
          available += next.value.byteLength;
          yield next.value;
          continue;
        }
        let offset = 0;
        while (offset < next.value.length) {
          const count = Math.min(BLOCK_SIZE - used, next.value.length - offset);
          block.set(next.value.subarray(offset, offset + count), used);
          offset += count;
          used += count;
          if (used === BLOCK_SIZE) {
            await writeBlock(index++, block);
            available += used;
            yield block;
            block = new Uint8Array(BLOCK_SIZE);
            used = 0;
            if (controller.signal.aborted) throw cancelled();
          }
        }
      }
      if (controller.signal.aborted) throw cancelled();
      if (used) {
        const tail = block.slice(0, used);
        await writeBlock(index, tail);
        available += used;
        yield tail;
      }
      if (options.disk && available !== diskSize) throw new Error("Recording file was truncated while loading.");
    } finally {
      controller.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      lifetime.signal.removeEventListener("abort", abort);
      signal?.removeEventListener("abort", abort);
    }
  }

  return {
    stream,
    async read(start, end) {
      assertOpen();
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > available) {
        throw new Error("Recording byte range is not available.");
      }
      if (directFile) return directFile.slice(start, end);
      const parts: BlobPart[] = [];
      for (let offset = start; offset < end;) {
        const index = Math.floor(offset / BLOCK_SIZE);
        const block = await readBlock(index);
        const localStart = offset % BLOCK_SIZE;
        const count = Math.min(block.byteLength - localStart, end - offset);
        if (count <= 0) throw new Error("Recording cache is incomplete.");
        parts.push(new Uint8Array(block, localStart, count));
        offset += count;
      }
      assertOpen();
      // Only the current frame is assembled. Source blocks stay in the bounded LRU.
      return new Blob(parts);
    },
    close() {
      if (closed) return;
      closed = true;
      lifetime.abort();
      cache.clear();
      directFile = undefined;
      database?.close();
      if (opening) discardDatabase(databaseName);
    }
  };
}
