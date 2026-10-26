import Guacamole from '@guacamole';

const BLOCK_SIZE = 2 * 1024 * 1024;
const CACHE_BLOCKS = 8;
const DATABASE_PREFIX = 'jms-guacamole-replay-v1-';
let sweptDatabases = false;

function discardDatabase(name: string) {
  try {
    indexedDB.deleteDatabase(name);
  } catch (_) {
    // Disabled storage must not prevent releasing the player.
  }
}

function sweepAbandonedDatabases() {
  const databases = (indexedDB as any).databases;
  if (sweptDatabases || typeof databases !== 'function') {
    return;
  }
  sweptDatabases = true;
  databases.call(indexedDB).then((entries: Array<{name?: string}>) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    entries.forEach(({name}) => {
      if (name && name.indexOf(DATABASE_PREFIX) === 0 && Number(name.slice(DATABASE_PREFIX.length).split('-')[0]) < cutoff) {
        // Open connections protect recordings still playing in another tab.
        discardDatabase(name);
      }
    });
  }).catch(() => {});
}

function storageError(error: Error): Error {
  if (error && error.name === 'QuotaExceededError') {
    return new Error('Not enough browser storage to cache this recording.');
  }
  return error || new Error('Browser recording storage is unavailable.');
}

/** Browser URL reader backported from dev's seekable recording source. */
export function createRecordingSource(url: string): Guacamole.SessionRecording.Source {
  const lifetime = new AbortController();
  const cache = new Map<number, ArrayBuffer>();
  const databaseName = DATABASE_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2);
  let database: IDBDatabase;
  let opening: Promise<IDBDatabase>;
  let available = 0;
  let started = false;
  let closed = false;

  function assertOpen() {
    if (closed) {
      throw new DOMException('Recording closed', 'AbortError');
    }
  }

  function openDatabase(): Promise<IDBDatabase> {
    assertOpen();
    if (opening) {
      return opening;
    }
    if (typeof indexedDB === 'undefined') {
      throw new Error('Browser storage is required to play this recording.');
    }
    sweepAbandonedDatabases();
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('chunks');
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        if (closed) {
          request.result.close();
          discardDatabase(databaseName);
          reject(new DOMException('Recording closed', 'AbortError'));
          return;
        }
        database = request.result;
        resolve(database);
      };
    });
    return opening;
  }

  async function writeBlock(index: number, bytes: Uint8Array) {
    const db = await openDatabase();
    assertOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(bytes.buffer, index);
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
    const db = await openDatabase();
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const request = tx.objectStore('chunks').get(index);
      tx.oncomplete = () => request.result instanceof ArrayBuffer
        ? resolve(request.result)
        : reject(new Error('Recording cache is incomplete. Please reopen the recording.'));
      tx.onabort = tx.onerror = () => reject(storageError(tx.error));
    });
    assertOpen();
    cache.set(index, bytes);
    while (cache.size > CACHE_BLOCKS) {
      cache.delete(cache.keys().next().value);
    }
    return bytes;
  }

  async function* stream(signal?: AbortSignal): AsyncIterableIterator<Uint8Array> {
    assertOpen();
    if (started) {
      throw new Error('Recording indexing has already started.');
    }
    started = true;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    const abort = () => {
      controller.abort();
      if (reader) {
        reader.cancel().catch(() => {});
      }
    };
    lifetime.signal.addEventListener('abort', abort, {once: true});
    if (signal) {
      signal.addEventListener('abort', abort, {once: true});
    }
    try {
      if ((signal && signal.aborted) || lifetime.signal.aborted) {
        throw new DOMException('Recording closed', 'AbortError');
      }
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) {
        throw new Error('Unable to load recording: HTTP ' + response.status);
      }
      if (!response.body) {
        throw new Error('Recording response has no content.');
      }
      reader = response.body.getReader();

      // Sniff actual bytes: HTTP Content-Encoding may already be decoded.
      // Preserve support for two gzip layers, including split signatures.
      for (let layer = 0; layer <= 2; layer++) {
        const firstChunks: Uint8Array[] = [];
        const prefix: number[] = [];
        while (prefix.length < 2) {
          const first = await reader.read();
          if (controller.signal.aborted) {
            throw new DOMException('Recording closed', 'AbortError');
          }
          if (first.done) {
            break;
          }
          if (first.value.length) {
            firstChunks.push(first.value);
            for (let i = 0; i < first.value.length && prefix.length < 2; i++) {
              prefix.push(first.value[i]);
            }
          }
        }
        const gzip = prefix[0] === 0x1f && prefix[1] === 0x8b;
        if (gzip && layer === 2) {
          throw new Error('Too many gzip layers in recording.');
        }
        const upstream = reader;
        const joined = new ReadableStream<Uint8Array>({
          async pull(target) {
            if (firstChunks.length) {
              target.enqueue(firstChunks.shift());
            } else {
              const chunk = await upstream.read();
              if (chunk.done) {
                target.close();
              } else {
                target.enqueue(chunk.value);
              }
            }
          },
          cancel: (reason) => upstream.cancel(reason)
        });
        const Decompression = (window as any).DecompressionStream;
        if (gzip && typeof Decompression !== 'function') {
          throw new Error('This browser does not support streaming gzip recording playback.');
        }
        reader = (gzip ? joined.pipeThrough<Uint8Array>(new Decompression('gzip')) : joined).getReader();
        if (!gzip) {
          break;
        }
      }

      let block = new Uint8Array(BLOCK_SIZE);
      let used = 0;
      let index = 0;
      while (!controller.signal.aborted) {
        const next = await reader.read();
        if (controller.signal.aborted) {
          throw new DOMException('Recording closed', 'AbortError');
        }
        if (next.done) {
          break;
        }
        let offset = 0;
        while (offset < next.value.length) {
          const count = Math.min(BLOCK_SIZE - used, next.value.length - offset);
          block.set(next.value.subarray(offset, offset + count), used);
          offset += count;
          used += count;
          if (used === BLOCK_SIZE) {
            // Commit before exposing offsets, and await each write for backpressure.
            await writeBlock(index++, block);
            available += used;
            yield block;
            block = new Uint8Array(BLOCK_SIZE);
            used = 0;
            if (controller.signal.aborted) {
              throw new DOMException('Recording closed', 'AbortError');
            }
          }
        }
      }
      if (controller.signal.aborted) {
        throw new DOMException('Recording closed', 'AbortError');
      }
      if (used) {
        const tail = block.slice(0, used);
        await writeBlock(index, tail);
        available += used;
        yield tail;
      }
    } finally {
      controller.abort();
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      lifetime.signal.removeEventListener('abort', abort);
      if (signal) {
        signal.removeEventListener('abort', abort);
      }
    }
  }

  return {
    stream,
    async read(start, end) {
      assertOpen();
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > available) {
        throw new Error('Recording byte range is not available.');
      }
      const parts: BlobPart[] = [];
      for (let offset = start; offset < end;) {
        const index = Math.floor(offset / BLOCK_SIZE);
        const block = await readBlock(index);
        const localStart = offset % BLOCK_SIZE;
        const count = Math.min(block.byteLength - localStart, end - offset);
        if (count <= 0) {
          throw new Error('Recording cache is incomplete.');
        }
        parts.push(new Uint8Array(block, localStart, count));
        offset += count;
      }
      assertOpen();
      return new Blob(parts);
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      lifetime.abort();
      cache.clear();
      if (database) {
        database.close();
      }
      if (opening) {
        discardDatabase(databaseName);
      }
    }
  };
}
