import Guacamole from "@jumpserver/guacamole";

import { createRecordingSource } from "@jumpserver/guacamole/recording-source";
import { gzipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

const BLOCK_SIZE = 2 * 1024 * 1024;
const sources: Guacamole.SessionRecording.Source[] = [];
const source = (...args: Parameters<typeof createRecordingSource>) => {
  const value = createRecordingSource(...args);
  sources.push(value);
  return value;
};
const databases = async () =>
  (await indexedDB.databases()).filter(({ name }) => name?.startsWith("jms-guacamole-replay-v1-"));

async function scan(recording: Guacamole.SessionRecording.Source) {
  let bytes = 0;
  for await (const chunk of recording.stream()) bytes += chunk.byteLength;
  return bytes;
}

afterEach(async () => {
  for (const recording of sources.splice(0)) recording.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await expect.poll(databases).toEqual([]);
});

describe.skipIf(typeof document === "undefined")("Guacamole recording sources", () => {
  it("commits gzip chunks before publishing their byte ranges and deletes the temporary database", async () => {
    const text = `${"x".repeat(BLOCK_SIZE - 1)}中😀 tail`;
    const bytes = strToU8(text);
    const recording = source(new Blob([gzipSync(bytes)]));
    let size = 0;
    for await (const chunk of recording.stream()) {
      expect(new Uint8Array(await (await recording.read(size, size + chunk.length)).arrayBuffer())).toEqual(chunk);
      size += chunk.length;
    }
    expect(size).toBe(bytes.length);
    expect(await (await recording.read(BLOCK_SIZE - 1, size)).text()).toBe("中😀 tail");
    expect(await databases()).toHaveLength(1);
    recording.close();
    await expect(recording.read(0, 1)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads an uncompressed local file directly without creating a browser cache", async () => {
    const file = new File(["4.name,2.中😀;4.sync,1.0;"], "local.guac");
    const recording = source(file);
    expect(await scan(recording)).toBe(file.size);
    expect(await (await recording.read(0, file.size)).text()).toBe(await file.text());
    expect(await databases()).toEqual([]);
  });

  it("indexes archived entry streams without creating a full input Blob or downloading again", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const text = "4.name,2.中😀;4.sync,1.0;";
    for (const bytes of [strToU8(text), gzipSync(strToU8(text))]) {
      const stream = vi.fn(() => new Blob([bytes]).stream());
      const recording = source({ stream });
      expect(await scan(recording)).toBe(strToU8(text).length);
      expect(await (await recording.read(0, strToU8(text).length)).text()).toBe(text);
      expect(stream).toHaveBeenCalledOnce();
      recording.close();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sniffs gzip split across network chunks and accepts already decoded HTTP bodies", async () => {
    const text = "4.sync,1.0;";
    for (const bytes of [gzipSync(strToU8(text)), gzipSync(gzipSync(strToU8(text))), strToU8(text)]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes.slice(0, 1));
                  controller.enqueue(bytes.slice(1));
                  controller.close();
                }
              })
            )
        )
      );
      const recording = source("/recording.part.gz");
      expect(await scan(recording)).toBe(text.length);
      expect(await (await recording.read(0, text.length)).text()).toBe(text);
      recording.close();
    }
  });

  it("cancels a stalled indexing stream while keeping committed chunks readable", async () => {
    const cancel = vi.fn();
    let sent = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                if (!sent) {
                  sent = true;
                  controller.enqueue(new Uint8Array(BLOCK_SIZE).fill(65));
                }
              },
              cancel
            })
          )
      )
    );
    const recording = source("/slow.guac");
    const controller = new AbortController();
    const iterator = recording.stream(controller.signal)[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.length).toBe(BLOCK_SIZE);
    const pending = iterator.next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(await (await recording.read(0, 3)).text()).toBe("AAA");
  });

  it("reports storage failure instead of retaining a full recording in memory", async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Storage quota exhausted", "QuotaExceededError");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("4.sync,1.0;"))
    );
    const recording = source("/recording.guac");
    await expect(scan(recording)).rejects.toThrow(/quota|storage/i);
    expect(put).toHaveBeenCalledOnce();
    await expect(recording.read(0, 1)).rejects.toThrow("not available");
  });

  it("reports disabled storage and completes player disposal even if cache deletion is denied", async () => {
    const denied = () => {
      throw new DOMException("Browser storage is disabled", "SecurityError");
    };
    vi.stubGlobal("indexedDB", { open: denied, deleteDatabase: denied });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("4.sync,1.0;"))
    );
    const recordingSource = source("/recording.guac");
    const recording = new Guacamole.SessionRecording(recordingSource);
    const onerror = vi.fn();
    recording.onerror = onerror;
    try {
      await expect.poll(() => onerror.mock.calls.length).toBe(1);
      expect(onerror).toHaveBeenCalledWith("Browser storage is disabled");
      expect(recording.isPlaying()).toBe(false);
      expect(() => recording.dispose()).not.toThrow();
      expect(() => recordingSource.close()).not.toThrow();
    } finally {
      recording.dispose();
    }
  });

  it("uses Electron ranges with a bounded LRU and no IndexedDB copy", async () => {
    const length = BLOCK_SIZE * 9;
    const ranges: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        const range = new Headers(options?.headers).get("Range");
        if (range) {
          ranges.push(range);
          const [start, end] = range.slice(6).split("-").map(Number);
          return new Response(new Uint8Array(end! - start! + 1).fill(start! / BLOCK_SIZE), {
            status: 206,
            headers: { "Content-Range": `bytes ${start}-${end}/${length}` }
          });
        }
        let sent = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (sent === length) controller.close();
              else {
                controller.enqueue(new Uint8Array(BLOCK_SIZE));
                sent += BLOCK_SIZE;
              }
            }
          }),
          { headers: { "Content-Length": String(length) } }
        );
      })
    );
    const recording = source("jms-asset://recordings/test.guac", { disk: true });
    expect(await scan(recording)).toBe(length);
    for (let index = 0; index < 9; index++) {
      expect(
        new Uint8Array(await (await recording.read(index * BLOCK_SIZE, index * BLOCK_SIZE + 1)).arrayBuffer())[0]
      ).toBe(index);
    }
    await recording.read(8 * BLOCK_SIZE, 8 * BLOCK_SIZE + 1);
    expect(ranges).toHaveLength(9);
    await recording.read(0, 1);
    expect(ranges).toHaveLength(10);
    expect(await databases()).toEqual([]);
  });

  it("rejects a disk server that ignores Range without buffering its full response", async () => {
    const cancel = vi.fn();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (++calls === 1) return new Response("4.sync,1.0;", { headers: { "Content-Length": "11" } });
        return new Response(new ReadableStream({ cancel }));
      })
    );
    const recording = source("jms-asset://recordings/test.guac", { disk: true });
    await scan(recording);
    await expect(recording.read(0, 1)).rejects.toThrow("byte-range");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
