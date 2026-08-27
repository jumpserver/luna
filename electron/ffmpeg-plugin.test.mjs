import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FfmpegPluginManager, ffmpegPluginInternals } from "./ffmpeg-plugin.mjs";

test("reports the optional FFmpeg plugin as absent before download", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jms-ffmpeg-plugin-"));
  try {
    const manager = new FfmpegPluginManager(root, () => {
      throw new Error("unexpected download");
    });
    const status = await manager.status();
    assert.equal(status.installed, false);
    assert.equal(status.version, ffmpegPluginInternals.VERSION);
    await assert.rejects(() => manager.executable(), /install it from Settings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported FFmpeg plugin targets", () => {
  assert.throws(
    () =>
      new FfmpegPluginManager(
        "/tmp",
        () => {},
        () => {},
        "win32",
        "arm64"
      ).target,
    /does not support win32-arm64/
  );
});
