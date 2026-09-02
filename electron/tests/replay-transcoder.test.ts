import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { gzipSync } from "node:zlib";
import { app, net } from "electron";
import { pack as createTarPack } from "tar-stream";
import { encodeInstruction } from "../src/replay/codec.ts";
import { FfmpegPluginManager } from "../src/replay/ffmpeg-plugin.ts";
import { ReplayTranscoder } from "../src/replay/transcoder.ts";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jms-node-transcode-"));

try {
  const archivePath = path.join(temporaryRoot, "session.tar");
  const outputDir = path.join(temporaryRoot, "output");
  const replay = [
    encodeInstruction("size", "0", "320", "240"),
    encodeInstruction("cfill", "0", "0", "220", "20", "30", "255"),
    encodeInstruction("sync", "0"),
    encodeInstruction("sync", "100"),
    encodeInstruction("cfill", "0", "0", "20", "30", "220", "255"),
    encodeInstruction("sync", "300")
  ].join("");
  const archive = createTarPack();
  const writing = finished(archive.pipe(createWriteStream(archivePath)));
  archive.entry(
    { name: "nested/session.replay.json" },
    JSON.stringify({ id: "session", user: "user", asset: "asset", account: "account", files: [] })
  );
  archive.entry({ name: "nested/session.0.part.gz" }, gzipSync(replay));
  archive.finalize();
  await writing;

  const progress = [];
  const ffmpegPlugin = new FfmpegPluginManager(path.join(temporaryRoot, "plugins"), (url, options) =>
    net.fetch(String(url), options)
  );
  await ffmpegPlugin.install();
  const transcoder = new ReplayTranscoder(temporaryRoot, (event) => progress.push(event), ffmpegPlugin);
  const [result] = await transcoder.transcode(
    {
      tarPaths: [archivePath],
      outputDir,
      filenameStyle: "original",
      outputResolution: "p360",
      transcodePower: "low"
    },
    "main"
  );

  assert.equal(result.success, true, result.error);
  assert.ok((await stat(result.output)).size > 0);
  assert.deepEqual((await readFile(result.output)).subarray(4, 8).toString("ascii"), "ftyp");
  assert.equal(progress.at(-1).success, true);
  console.info("Node replay transcoder smoke test passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  app.quit();
}
