import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { BrowserWindow, nativeImage, net } from "electron";
import Guacamole from "@jumpserver/guacamole";
import { pack as createTarPack } from "tar-stream";
import { FfmpegPluginManager } from "../src/replay/ffmpeg-plugin.ts";
import { ReplayTranscoder } from "../src/replay/transcoder.ts";

export async function runTranscodeChecks() {
  const { build } = await import("vite");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jms-node-transcode-"));

  try {
    const archivePath = path.join(temporaryRoot, "session.tar");
    const outputDir = path.join(temporaryRoot, "output");
    const preload = path.join(temporaryRoot, "replay-renderer-preload.js");
    await build({
      configFile: false,
      logLevel: "error",
      build: {
        outDir: temporaryRoot,
        emptyOutDir: false,
        lib: {
          entry: fileURLToPath(new URL("../src/replay/replay-renderer-preload.ts", import.meta.url)),
          formats: ["cjs"],
          fileName: () => path.basename(preload)
        },
        rolldownOptions: { external: ["electron"], output: { codeSplitting: false } }
      }
    });
    const instruction = (opcode: string, ...args: unknown[]) => Guacamole.Parser.toInstruction([opcode, ...args]);
    const cursorBitmap = Buffer.alloc(8 * 8 * 4);
    for (let offset = 0; offset < cursorBitmap.length; offset += 4) cursorBitmap.set([0, 255, 0, 255], offset);
    const cursorPng = nativeImage.createFromBitmap(cursorBitmap, { width: 8, height: 8 }).toPNG().toString("base64");
    const replay = [
      instruction("name", `鼠标录像${"界".repeat(90_000)}`),
      instruction("size", 0, 64, 48),
      instruction("rect", 0, 0, 0, 64, 48),
      instruction("cfill", 14, 0, 220, 20, 30, 255),
      instruction("rect", 0, 22, 6, 8, 8),
      instruction("cfill", 14, 0, 255, 255, 0, 255),
      instruction("size", -1, 8, 8),
      instruction("img", 0, 12, -1, "image/png", 0, 0),
      instruction("blob", 0, cursorPng),
      instruction("end", 0),
      instruction("cursor", 2, 3, -1, 0, 0, 8, 8),
      instruction("sync", 1000),
      instruction("mouse", 12, 14),
      instruction("sync", 1200),
      instruction("size", 1, 6, 6),
      instruction("rect", 1, 0, 0, 6, 6),
      instruction("cfill", 14, 1, 20, 30, 220, 255),
      instruction("move", 1, 0, 40, 25, 1),
      instruction("distort", 1, 1, 0, 0, 1, 4, 0),
      instruction("shade", 1, 160),
      instruction("size", 2, 8, 8),
      instruction("rect", 2, 0, 0, 8, 8),
      instruction("cfill", 14, 2, 220, 0, 220, 255),
      instruction("move", 2, 1, 4, 4, 1),
      instruction("mouse", 34, 24),
      instruction("sync", 1400),
      instruction("sync", 1500),
      instruction("dispose", 1),
      instruction("mouse", 1, 1),
      instruction("sync", 1600)
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
    if (!process.env.REPLAY_TEST_FFMPEG) await ffmpegPlugin.install();
    const plugin = process.env.REPLAY_TEST_FFMPEG
      ? { executable: async () => process.env.REPLAY_TEST_FFMPEG }
      : ffmpegPlugin;
    const executable = await plugin.executable();
    const transcoder = new ReplayTranscoder(preload, (event) => progress.push(event), plugin);
    const results = await transcoder.transcode(
      {
        tarPaths: [archivePath, archivePath],
        outputDir,
        filenameStyle: "original",
        outputResolution: "p360",
        transcodePower: "low"
      },
      "main"
    );

    assert.equal(results.length, 2);
    assert.ok(
      results.every((result) => result.success),
      results.map((result) => result.error).join("\n")
    );
    assert.notEqual(results[0].output, results[1].output);
    for (const result of results) {
      assert.ok((await stat(result.output)).size > 0);
      assert.deepEqual((await readFile(result.output)).subarray(4, 8).toString("ascii"), "ftyp");
    }
    assert.equal(progress.at(-1).success, true);
    const pixels = execFileSync(
      executable,
      [
        "-v",
        "error",
        "-threads",
        "1",
        "-i",
        results[0].output,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-threads",
        "1",
        "-"
      ],
      { timeout: 10_000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(pixels.length, 7 * 64 * 48 * 4, "keep the original size and sample through the last sync");
    const pixel = (frame: number, x: number, y: number) => {
      const offset = (frame * 64 * 48 + y * 64 + x) * 4;
      return [...pixels.subarray(offset, offset + 3)];
    };
    const color = (actual: number[], expected: number[], message: string) =>
      assert.ok(
        actual.every((value, index) => Math.abs(value - expected[index]) < 45),
        `${message}: ${actual}`
      );
    color(pixel(0, 13, 14), [220, 20, 30], "cursor stays hidden until a mouse position is recorded");
    color(pixel(1, 13, 14), [220, 20, 30], "do not move the mouse ahead of its recorded timestamp");
    color(pixel(2, 13, 14), [0, 255, 0], "include the decoded cursor image");
    color(pixel(2, 11, 12), [0, 255, 0], "apply the cursor hotspot offset");
    color(pixel(4, 13, 14), [220, 20, 30], "moving the cursor must restore the previous background");
    color(pixel(4, 35, 24), [0, 255, 0], "move the cursor with the recording");
    color(pixel(5, 47, 28), [95, 26, 149], "preserve Guacamole child-layer positions, CSS transforms and opacity");
    color(pixel(5, 53, 34), [220, 20, 30], "clip children to their parent layer");
    color(pixel(5, 25, 9), [255, 255, 0], "respect the fill path");
    color(pixel(6, 1, 1), [0, 255, 0], "clip a partly offscreen cursor on the memory path");
    color(pixel(6, 47, 28), [220, 20, 30], "return to memory frames after disposing a child layer");
    color(pixel(6, 35, 24), [220, 20, 30], "do not leave the old cursor behind when switching capture paths");
    assert.equal(BrowserWindow.getAllWindows().length, 0, "release hidden renderers after each file");

    const scaledReplay = replay
      .replace(instruction("size", 0, 64, 48), instruction("size", 0, 80, 400))
      .replace(instruction("rect", 0, 0, 0, 64, 48), instruction("rect", 0, 0, 0, 80, 400));
    const scaledArchivePath = path.join(temporaryRoot, "scaled.tar");
    const scaledArchive = createTarPack();
    const scaledWriting = finished(scaledArchive.pipe(createWriteStream(scaledArchivePath)));
    scaledArchive.entry({ name: "scaled.0.part.gz" }, gzipSync(scaledReplay));
    scaledArchive.finalize();
    await scaledWriting;
    const [scaledResult] = await transcoder.transcode(
      { tarPaths: [scaledArchivePath], outputDir, outputResolution: "p360", transcodePower: "low" },
      "scaled"
    );
    assert.equal(scaledResult.success, true, scaledResult.error);
    const scaledPixels = execFileSync(
      executable,
      [
        "-v",
        "error",
        "-threads",
        "1",
        "-i",
        scaledResult.output,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-threads",
        "1",
        "-"
      ],
      { timeout: 10_000, maxBuffer: 1024 * 1024 }
    );
    assert.equal(scaledPixels.length, 7 * 72 * 360 * 4, "downscale both memory and compositor frames");
    const cursorOffset = (2 * 72 * 360 + 12 * 72 + 11) * 4;
    color(
      [...scaledPixels.subarray(cursorOffset, cursorOffset + 3)],
      [0, 255, 0],
      "scale the cursor with its background"
    );

    // Compare the MP4 with Chromium's actual player display, including its separate cursor DOM layer.
    const player = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false }
    });
    try {
      await player.loadURL("data:text/html,<body style='margin:0;background:black'>");
      const guacamole = await readFile(new URL("../../packages/guacamole/dist/guacamole.js", import.meta.url), "utf8");
      for (const scene of [
        { source: replay, decoded: pixels, width: 64, height: 48, scale: 1 },
        { source: scaledReplay, decoded: scaledPixels, width: 72, height: 360, scale: 0.9 }
      ]) {
        for (const frame of [2, 4, 6]) {
          await player.webContents.executeJavaScript(`${guacamole.replace("export default Guacamole;", "")}
        new Promise((resolve, reject) => {
          const recording = new Guacamole.SessionRecording(new Blob([${JSON.stringify(scene.source)}]));
          const element = recording.getDisplay().getElement();
          element.style.transformOrigin = "0 0";
          element.style.transform = "scale(${scene.scale})";
          document.body.replaceChildren(element);
          recording.onerror = reject;
          recording.onload = () => recording.seek(${frame * 100}, () => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });`);
          const screenshot = await player.webContents.capturePage({
            x: 0,
            y: 0,
            width: scene.width,
            height: scene.height
          });
          const bitmap = screenshot.resize({ width: scene.width, height: scene.height }).toBitmap();
          assert.equal(bitmap.length, scene.width * scene.height * 4);
          let difference = 0;
          for (let offset = 0; offset < bitmap.length; offset += 4) {
            for (let channel = 0; channel < 3; channel++) {
              difference += Math.abs(
                bitmap[offset + 2 - channel] - scene.decoded[frame * scene.width * scene.height * 4 + offset + channel]
              );
            }
          }
          assert.ok(
            difference / (scene.width * scene.height * 3) < 6,
            `export ${scene.width}x${scene.height} frame ${frame} must match the player display within H.264 compression error: mean=${difference / (scene.width * scene.height * 3)}, first=${[...bitmap.subarray(0, 4)]}`
          );
        }
      }
    } finally {
      player.destroy();
    }

    for (const cancelAt of [5, 25]) {
      let cancelledOnce = false;
      const cancelling = new ReplayTranscoder(
        preload,
        (event) => {
          if (!cancelledOnce && event.progress >= cancelAt) {
            cancelledOnce = true;
            cancelling.cancelCurrent("cancel");
          }
        },
        plugin
      );
      const cancelled = await cancelling.transcode(
        { tarPaths: [archivePath, archivePath], outputDir, transcodePower: "low" },
        "cancel"
      );
      assert.equal(cancelled[0].success, false);
      assert.equal(cancelled[1].success, true, "cancelling the current file must allow the next file to complete");
      assert.equal(BrowserWindow.getAllWindows().length, 0, "cancelling must release the renderer and encoder");
    }
    assert.ok(
      (await readdir(outputDir)).every((name) => !name.endsWith(".tmp.mp4")),
      "remove cancelled temporary videos"
    );
    console.info("Replay transcode checks passed: cursor image, position, hotspot, timing, layers and cancellation");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
