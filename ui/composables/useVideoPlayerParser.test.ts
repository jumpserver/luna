import { gzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, shallowRef } from "vue";
import { streamArchiveEntry } from "~/utils/browserRecordingArchive";
import { useArchivedPlayerMedia } from "./useArchivedPlayerMedia";
import { releaseBrowserVideoPlayerItems, useVideoPlayerParser } from "./useVideoPlayerParser";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function archiveFile(entries: Array<{ name: string; data: Uint8Array }>) {
  const parts: BlobPart[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    const write = (value: string, offset: number) => header.set(new TextEncoder().encode(value), offset);
    write(entry.name, 0);
    write(`${entry.data.byteLength.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156);
    write("0", 156);
    write("ustar\0", 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    parts.push(header, new Uint8Array(entry.data).buffer, new Uint8Array((512 - (entry.data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  return new File(parts, "session.tar");
}

describe("Guacamole file import", () => {
  it("retains original files without reading or decompressing whole parts", async () => {
    vi.stubGlobal("useOfflineRecording", () => ({}));
    const content = new TextEncoder().encode("4.sync,1.0;4.sync,4.1000;");
    const compressed = gzipSync(content);
    const files = [
      new File([content], "session.0.part.gz"),
      new File([new Uint8Array(compressed).buffer], "session.1.part.gz")
    ];
    for (const file of files) {
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("whole-file reads are forbidden"));
    }
    const metadata = new File(
      [JSON.stringify({ id: "session", user: "reviewer", files: files.map((file) => ({ name: file.name })) })],
      "session.replay.json"
    );

    const items = await useVideoPlayerParser().parseFiles([...files, metadata]);

    expect(items).toHaveLength(2);
    for (const [index, item] of items.entries()) {
      expect(item.recordingBlob).toBe(files[index]);
      expect(item.source).toBe("");
      expect(item.type).toBe("gua");
      expect(item.partIndex).toBe(index + 1);
      expect(item.partTotal).toBe(2);
      expect(item.meta.user).toBe("reviewer");
    }
  });

  it.skipIf(typeof indexedDB === "undefined")(
    "keeps archive entries on disk, reads trailing metadata, and only loads the selected cast",
    async () => {
      vi.stubGlobal("useOfflineRecording", () => ({}));
      const encode = (value: string) => new TextEncoder().encode(value);
      const cast = '{"version":2,"width":80,"height":24}\n';
      const gua = gzipSync(encode("4.sync,1.0;4.sync,4.1000;"));
      const file = archiveFile([
        { name: "session.0.part.gz", data: gua },
        { name: "session.1.part.gz", data: gua },
        { name: "session.cast.gz", data: gzipSync(encode(cast)) },
        { name: "session.replay.json", data: encode('{"id":"session","user":"reviewer"}') },
        { name: "__MACOSX/._session.replay.json", data: encode("invalid sidecar") }
      ]);
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("whole-archive reads are forbidden"));
      const items = await useVideoPlayerParser().parseFiles([file]);
      const scope = effectScope();
      try {
        expect(items.map((item) => item.type)).toEqual(["gua", "gua", "cast"]);
        for (const item of items) {
          expect(item.recordingEntry).toBeDefined();
          expect(item.recordingBlob).toBeUndefined();
          expect(item.castData).toBeUndefined();
          expect(item.source).toBe("");
          expect(item.meta.user).toBe("reviewer");
        }
        const active = shallowRef(items[0]!);
        const media = scope.run(() => useArchivedPlayerMedia(active))!;
        expect(media.loading.value).toBe(false);
        active.value = items[2]!;
        await vi.waitFor(() => expect(media.castData.value).toBe(cast));
        expect(media.error.value).toBe("");
        expect(items[2]!.castData).toBeUndefined();

        await releaseBrowserVideoPlayerItems([items[0]!], items.slice(1));
        expect(new Uint8Array(await new Response(streamArchiveEntry(items[1]!.recordingEntry!)).arrayBuffer())).toEqual(
          gua
        );
      } finally {
        scope.stop();
        await releaseBrowserVideoPlayerItems(items);
      }
      await expect(new Response(streamArchiveEntry(items[1]!.recordingEntry!)).arrayBuffer()).rejects.toThrow();
    }
  );

  it.skipIf(typeof indexedDB === "undefined")(
    "releases duplicate imports independently and rolls back oversized metadata",
    async () => {
      vi.stubGlobal("useOfflineRecording", () => ({}));
      const data = new TextEncoder().encode("4.sync,1.0;");
      const file = archiveFile([{ name: "session.0.part.gz", data }]);
      const parser = useVideoPlayerParser();
      const original = await parser.parseFiles([file]);
      const duplicate = await parser.parseFiles([file]);
      try {
        expect(original[0]!.recordingId).not.toBe(duplicate[0]!.recordingId);
        await releaseBrowserVideoPlayerItems(duplicate, original);
        expect(await new Response(streamArchiveEntry(original[0]!.recordingEntry!)).text()).toBe("4.sync,1.0;");
        await expect(new Response(streamArchiveEntry(duplicate[0]!.recordingEntry!)).arrayBuffer()).rejects.toThrow();

        const opened = vi.spyOn(indexedDB, "open");
        const invalid = archiveFile([{ name: "session.replay.json", data: new Uint8Array(1024 * 1024 + 1) }]);
        await expect(parser.parseFiles([file, invalid])).rejects.toThrow("1 MiB");
        const remaining = new Set((await indexedDB.databases()).map((entry) => entry.name));
        for (const [name] of opened.mock.calls) expect(remaining.has(name)).toBe(false);
      } finally {
        await releaseBrowserVideoPlayerItems([...original, ...duplicate]);
      }
    }
  );
});
