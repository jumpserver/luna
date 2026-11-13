import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, WebContentsView } from "electron";
import ts from "typescript";
import { WebVideoRecording } from "../src/replay/web-recording.ts";

// Run with the actual installed Electron; no display or microphone capture is used.
export async function runRecordingChecks() {
  const directory = process.env.WEB_RECORDING_TEST_OUTPUT || (await mkdtemp(path.join(os.tmpdir(), "web-video-")));
  const preload = process.env.WEB_RECORDING_TEST_PRELOAD || path.join(directory, "web-recording-preload.js");
  if (!process.env.WEB_RECORDING_TEST_PRELOAD) {
    const source = await readFile(new URL("../src/replay/web-recording-preload.ts", import.meta.url), "utf8");
    await writeFile(
      preload,
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 }
      }).outputText
    );
  }
  const chunks: Buffer[] = [];
  let format = "";
  let resized = false;
  let retried = false;
  const server = createServer(async (request, response) => {
    if (request.url === "/asset") {
      response.setHeader("content-type", "text/html");
      response.end(
        '<body style="margin:0;background:#14314d;color:white"><h1>Asset page</h1><script>setInterval(()=>document.querySelector("h1").textContent="Asset frame "+Date.now(),40)</script>'
      );
      return;
    }
    assert.equal(request.headers["proxy-authorization"], `Basic ${Buffer.from("session:ticket").toString("base64")}`);
    const buffers = [];
    for await (const buffer of request) buffers.push(buffer);
    const body = Buffer.concat(buffers);
    response.setHeader("content-type", "application/json");
    if (request.url === "/_jumpserver/web-recordings") {
      const data = JSON.parse(body.toString());
      format = data.format;
      assert.ok(["mp4", "webm"].includes(format));
      assert.ok(data.width <= 1920 && data.height <= 1080);
      response.end(JSON.stringify({ id: "video-test", format }));
    } else if (request.url?.includes("/chunks?")) {
      const query = new URL(request.url, "http://localhost").searchParams;
      const sequence = Number(query.get("sequence"));
      resized ||= query.get("resized") === "1";
      if (sequence === chunks.length) {
        chunks.push(body);
        await appendFile(path.join(directory, `video.${format}`), body);
        // Verify an ambiguous network failure retries without duplicating bytes.
        if (sequence === 0) {
          request.socket.destroy();
          return;
        }
      } else {
        assert.equal(sequence, chunks.length - 1);
        assert.deepEqual(body, chunks[sequence]);
        retried = true;
      }
      response.end(JSON.stringify({ chunk_count: chunks.length }));
    } else response.end(JSON.stringify({ path: "" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const host = new BrowserWindow({ show: true, width: 700, height: 500, webPreferences: { sandbox: true } });
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 640, height: 360 });
  let recording: WebVideoRecording;
  try {
    await host.loadURL("data:text/html,<body style='background:red'>Host shell must not be captured</body>");
    await view.webContents.loadURL(`${baseUrl}/asset`);
    recording = await WebVideoRecording.start(
      {
        label: "web-proxy-video-test",
        sessionId: "test-session",
        targetUrl: `${baseUrl}/asset`,
        proxyUrl: baseUrl,
        proxyAuth: { username: "session", password: "ticket" },
        webContents: view.webContents,
        width: 640,
        height: 360,
        getPauseReasons: () => [],
        emit: () => {}
      },
      preload
    );
    await delay(1400);
    recording.setPaused("autofill", true, "paused");
    await recording.capturePending;
    await delay(700);
    recording.setPaused("autofill", false, "resumed");
    await recording.capturePending;
    await delay(400);
    view.setBounds({ x: 0, y: 0, width: 320, height: 240 });
    await delay(1500);
    await WebVideoRecording.finishAll();
    assert.equal(WebVideoRecording.hasActiveRecordings(), false);
    assert.ok(chunks.length >= 3);
    assert.ok(retried);
    if (process.env.WEB_RECORDING_TEST_FFPROBE) {
      const info = JSON.parse(
        execFileSync(
          process.env.WEB_RECORDING_TEST_FFPROBE,
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", path.join(directory, `video.${format}`)],
          { encoding: "utf8", timeout: 10_000 }
        )
      );
      assert.equal(info.streams.length, 1, "recording must contain no audio track");
      assert.equal(info.streams[0].codec_name, format === "mp4" ? "h264" : "vp8");
      assert.equal(info.streams[0].width, 640);
      assert.equal(info.streams[0].height, 360);
      assert.equal(resized, false, "native capture must keep the recording size stable when the viewport changes");
      const [frames, seconds] = info.streams[0].avg_frame_rate.split("/").map(Number);
      assert.ok(frames / seconds > 10, "active recording must be smoother than the old 2fps screenshots");
      console.log(
        JSON.stringify({
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          format,
          codec: info.streams[0].codec_name,
          frameRate: info.streams[0].avg_frame_rate,
          chunks: chunks.length,
          resized,
          retried,
          directory
        })
      );
    }
    if (process.env.WEB_RECORDING_TEST_FFMPEG) {
      const frame = (at: string) =>
        execFileSync(
          process.env.WEB_RECORDING_TEST_FFMPEG,
          [
            "-v",
            "error",
            "-threads",
            "1",
            "-ss",
            at,
            "-i",
            path.join(directory, `video.${format}`),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-"
          ],
          { timeout: 10_000, maxBuffer: 1 << 20 }
        );
      const paused = frame("1.7");
      assert.ok(
        paused.every((value) => value <= 3),
        "credential pause must encode black pixels"
      );
      const afterResize = frame("3.4");
      const pixel = (x: number, y: number) => [...afterResize.subarray((y * 640 + x) * 3, (y * 640 + x) * 3 + 3)];
      assert.ok(
        pixel(10, 340).every((value) => value <= 3),
        "changed viewport aspect ratio must add padding"
      );
      assert.ok(
        pixel(320, 340)[2] > 50 && pixel(320, 340)[0] < 40,
        "only the blue asset surface may be captured; the red host must stay excluded"
      );
    }
  } finally {
    recording?.dispose();
    if (!view.webContents.isDestroyed()) view.webContents.close();
    host.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!process.env.WEB_RECORDING_TEST_OUTPUT) await rm(directory, { recursive: true, force: true });
  }
}
