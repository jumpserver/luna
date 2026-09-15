import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { pack as createTarPack } from "tar-stream";
import { extractReplayArchive, ReplayTranscoder, replayTranscoderInternals } from "../src/replay/transcoder.ts";

async function withTemporaryRoot(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "jms-replay-archive-"));
  try {
    await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeArchive(root: string, name: string, entries: Array<{ name: string; data?: string | Buffer }>) {
  const archivePath = path.join(root, name);
  const archive = createTarPack();
  const writing = finished(archive.pipe(createWriteStream(archivePath)));
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) =>
      archive.entry({ name: entry.name }, entry.data, (error) => (error ? reject(error) : resolve()))
    );
  }
  archive.finalize();
  await writing;
  return archivePath;
}

test("extracts Guacamole parts without replay metadata", () =>
  withTemporaryRoot(async (root) => {
    const archivePath = await writeArchive(root, "session.tar", [
      { name: "nested/session.0.part.gz", data: gzipSync("gua") }
    ]);
    const archive = await extractReplayArchive(archivePath);

    assert.equal(archive.metadata, undefined);
    assert.deepEqual(
      archive.parts.map((part) => [part.index, part.gzipped]),
      [[0, true]]
    );
    assert.equal(replayTranscoderInternals.extractSessionId(archivePath), "session");
    assert.deepEqual(replayTranscoderInternals.classifyReplayArchiveEntry("session.replay"), {
      kind: "gua",
      partIndex: 0,
      gzipped: false
    });
    assert.equal(replayTranscoderInternals.classifyReplayArchiveEntry("session.0.part.cast.gz").kind, "cast");
  }));

test("keeps replay metadata when it is present", () =>
  withTemporaryRoot(async (root) => {
    const archivePath = await writeArchive(root, "session.tar", [
      { name: "nested/session.0.part.gz", data: gzipSync("gua") },
      { name: "nested/session.replay.json", data: JSON.stringify({ id: "replay-id" }) }
    ]);

    assert.deepEqual((await extractReplayArchive(archivePath)).metadata, { id: "replay-id" });
  }));

test("ignores invalid optional metadata", () =>
  withTemporaryRoot(async (root) => {
    const archivePath = await writeArchive(root, "session.tar", [
      { name: "nested/session.0.part.gz", data: gzipSync("gua") },
      { name: "nested/session.json", data: "not json" }
    ]);

    assert.equal((await extractReplayArchive(archivePath)).metadata, undefined);
  }));

test("rejects terminal-only archives with a useful message", () =>
  withTemporaryRoot(async (root) => {
    const archivePath = await writeArchive(root, "session.tar", [
      { name: "nested/session.cast.gz", data: gzipSync("cast") },
      { name: "nested/session.json", data: JSON.stringify({ id: "session" }) }
    ]);

    await assert.rejects(extractReplayArchive(archivePath), /终端录像请用离线播放器/);
  }));

test("rejects archives without graphical recordings", () =>
  withTemporaryRoot(async (root) => {
    const archivePath = await writeArchive(root, "session.tar", []);

    await assert.rejects(extractReplayArchive(archivePath), /包里没有可转码的图形录像/);
    assert.equal(replayTranscoderInternals.outputFilename({ id: "session", user: "user" }, "friendly"), "session.mp4");
  }));

test("cancels active transcoding before it reads an archive", () =>
  withTemporaryRoot(async (root) => {
    const transcoder = new ReplayTranscoder(root, () => undefined, { executable: async () => "" });
    const work = transcoder.transcode(
      { tarPaths: [path.join(root, "missing.tar")], outputDir: path.join(root, "output") },
      "main"
    );

    assert.equal(transcoder.isTranscoding, true);
    transcoder.cancel();
    assert.deepEqual(await work, []);
    assert.equal(transcoder.isTranscoding, false);
  }));
