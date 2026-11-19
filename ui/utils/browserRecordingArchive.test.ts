import { gzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importRecordingArchive, removeRecordingArchive, streamArchiveEntry } from "./browserRecordingArchive";

const BLOCK_SIZE = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const imported: string[] = [];
const databases = async () =>
  (await indexedDB.databases()).filter(({ name }) => name?.startsWith("jms-guacamole-archive-v1-"));

function checksum(header: Uint8Array<ArrayBuffer>) {
  header.fill(32, 148, 156);
  const value = header.reduce((sum, byte) => sum + byte, 0);
  header.set(encoder.encode(`${value.toString(8).padStart(6, "0")}\0 `), 148);
  return header;
}

function header(name: string, size: number, type = "0", prefix = "") {
  const bytes = new Uint8Array(512);
  bytes.set(encoder.encode(name).subarray(0, 100), 0);
  bytes.set(encoder.encode(`${size.toString(8).padStart(11, "0")}\0`), 124);
  bytes[156] = type.charCodeAt(0);
  bytes.set(encoder.encode("ustar\0"), 257);
  bytes.set(encoder.encode("00"), 263);
  bytes.set(encoder.encode(prefix).subarray(0, 155), 345);
  return checksum(bytes);
}

function tarEntry(
  name: string,
  content: string | Uint8Array<ArrayBuffer>,
  type = "0",
  prefix = "",
  declaredSize?: number
) {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  return [
    header(name, declaredSize ?? bytes.length, type, prefix),
    bytes,
    new Uint8Array((512 - (bytes.length % 512)) % 512)
  ];
}

function tar(parts: BlobPart[], end = true) {
  return new Blob([...parts, ...(end ? [new Uint8Array(1024)] : [])]);
}

function pax(key: string, value: string) {
  const body = ` ${key}=${value}\n`;
  let length = encoder.encode(body).length + 1;
  while (String(length).length + encoder.encode(body).length !== length) {
    length = String(length).length + encoder.encode(body).length;
  }
  return `${length}${body}`;
}

async function importArchive(blob: Blob, signal?: AbortSignal) {
  const result = await importRecordingArchive(blob, signal);
  imported.push(result.archiveId);
  return result;
}

async function entryBytes(entry: Parameters<typeof streamArchiveEntry>[0]) {
  return new Uint8Array(await new Response(streamArchiveEntry(entry)).arrayBuffer());
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const archiveId of imported.splice(0)) await removeRecordingArchive(archiveId);
  await expect.poll(databases).toEqual([]);
});

describe.skipIf(typeof document === "undefined")("browser recording archives", () => {
  it("streams original entry bytes through one bounded write at a time", async () => {
    const gzipped = new Uint8Array(gzipSync(encoder.encode("4.sync,1.0;")));
    const large = new Uint8Array(BLOCK_SIZE + 31).fill(42);
    const file = tar([
      ...tarEntry("recording.0.part.gz", gzipped),
      ...tarEntry("recording.replay.json", "{}"),
      ...tarEntry("large.replay", large)
    ]);
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("Whole archive reads are forbidden"));
    const transaction = IDBDatabase.prototype.transaction;
    let activeWrites = 0;
    let peakWrites = 0;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(
      function (this: IDBDatabase, stores, mode, options) {
        const tx = transaction.call(this, stores, mode, options);
        if (mode === "readwrite") {
          peakWrites = Math.max(peakWrites, ++activeWrites);
          tx.addEventListener("complete", () => activeWrites--, { once: true });
        }
        return tx;
      }
    );
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const result = await importArchive(file);
    expect(result.entries.map(({ name }) => name)).toEqual([
      "recording.0.part.gz",
      "recording.replay.json",
      "large.replay"
    ]);
    expect(put.mock.calls.every(([value]) => value instanceof ArrayBuffer && value.byteLength <= BLOCK_SIZE)).toBe(
      true
    );
    expect(peakWrites).toBe(1);
    expect(await entryBytes(result.entries[0]!)).toEqual(gzipped);
    expect(await entryBytes(result.entries[2]!)).toEqual(large);
    expect(Object.keys(result.entries[0]!).sort()).toEqual(["archiveId", "entryId", "name", "size"]);
  });

  it("handles USTAR prefixes, PAX paths/sizes and GNU long names while skipping non-files", async () => {
    const longName = `${"directory/".repeat(15)}recording.part.gz`;
    const extended = pax("path", "目录/录像.part.gz") + pax("size", "3");
    const file = tar([
      ...tarEntry("folder", "", "5"),
      ...tarEntry("link", "", "2"),
      ...tarEntry("first.part.gz", "first", "0", "folder"),
      ...tarEntry("PaxHeader", extended, "x"),
      ...tarEntry("placeholder", "pax", "0", "", 0),
      ...tarEntry("././@LongLink", `${longName}\0`, "L"),
      ...tarEntry("truncated", "gnu")
    ]);
    const result = await importArchive(file);
    expect(result.entries.map(({ name }) => name)).toEqual(["folder/first.part.gz", "目录/录像.part.gz", longName]);
    expect(result.entries.map(({ size }) => size)).toEqual([5, 3, 3]);
    expect(new TextDecoder().decode(await entryBytes(result.entries[1]!))).toBe("pax");
  });

  it("supports gzip and double-gzip archives and validates their trailers", async () => {
    const plain = new Uint8Array(await tar(tarEntry("recording.part.gz", "data")).arrayBuffer());
    for (const bytes of [new Uint8Array(gzipSync(plain)), new Uint8Array(gzipSync(gzipSync(plain)))]) {
      const result = await importArchive(new Blob([bytes]));
      expect(new TextDecoder().decode(await entryBytes(result.entries[0]!))).toBe("data");
    }
    const damaged = new Uint8Array(gzipSync(plain));
    damaged[damaged.length - 8] = damaged[damaged.length - 8]! ^ 1;
    await expect(importArchive(new Blob([damaged]))).rejects.toThrow();
  });

  it("rejects corrupt, truncated, oversized metadata and excessive entry indexes without leaving caches", async () => {
    const badChecksum = header("bad", 0);
    badChecksum[0] = badChecksum[0]! ^ 1;
    const invalidSize = header("bad-size", 0);
    invalidSize[124] = 57;
    checksum(invalidSize);
    const archives = [
      tar([badChecksum]),
      tar([invalidSize]),
      tar([header("truncated", 2048)], false),
      tar(tarEntry("missing-end", "data"), false),
      tar([header("huge-pax", 1024 * 1024 + 1, "x")]),
      tar([...tarEntry("long", pax("path", "a".repeat(4097)), "x"), ...tarEntry("data", "")]),
      tar(Array.from({ length: 10_001 }, (_, index) => header(`file-${index}`, 0)))
    ];
    for (const file of archives) {
      await expect(importRecordingArchive(file)).rejects.toThrow(/tar|PAX|file limit/i);
      await expect.poll(databases).toEqual([]);
    }
  });

  it("cancels imports and removes quota failures without retaining partial archives", async () => {
    const file = tar(tarEntry("large.replay", new Uint8Array(BLOCK_SIZE + 1)));
    const controller = new AbortController();
    const put = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementationOnce(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key);
        queueMicrotask(() => controller.abort());
        return request;
      });
    await expect(importRecordingArchive(file, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(databases).toEqual([]);
    spy.mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await expect(importRecordingArchive(file)).rejects.toThrow("Not enough browser storage");
    await expect.poll(databases).toEqual([]);
  });

  it("cancels individual readers independently and removal aborts active readers", async () => {
    const result = await importArchive(tar(tarEntry("large.replay", new Uint8Array(BLOCK_SIZE + 1))));
    const entry = result.entries[0]!;
    const first = streamArchiveEntry(entry).getReader();
    expect((await first.read()).value?.length).toBe(BLOCK_SIZE);
    await first.cancel();
    expect(await databases()).toHaveLength(1);
    const second = streamArchiveEntry(entry).getReader();
    await removeRecordingArchive(result.archiveId);
    await expect(second.read()).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(databases).toEqual([]);
  });
});
