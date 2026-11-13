import { ipcRenderer } from "electron";

const channel = process.argv.find((arg) => arg.startsWith("--web-recording-channel="))?.split("=")[1];
const MAX_PENDING_BYTES = 16 << 20;
let stream: MediaStream;
let recorder: MediaRecorder;
let uploads = Promise.resolve();
let pendingBytes = 0;
let sequence = 0;
let resized = false;
let failed = false;
let stopping: Promise<void>;

function fail(error: unknown) {
  if (failed) return;
  failed = true;
  stream?.getTracks().forEach((track) => track.stop());
  void ipcRenderer.invoke(channel, "error", String(error)).catch(() => undefined);
}

async function probe(stream: MediaStream, mimeType: string) {
  if (!MediaRecorder.isTypeSupported(mimeType)) return false;
  return new Promise<boolean>((resolve) => {
    let probeRecorder: MediaRecorder;
    let bytes = 0;
    const timeout = setTimeout(() => {
      probeRecorder?.state !== "inactive" && probeRecorder?.stop();
      resolve(false);
    }, 3000);
    try {
      probeRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
      probeRecorder.ondataavailable = (event) => {
        bytes += event.data.size;
      };
      probeRecorder.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
      probeRecorder.onstop = () => {
        clearTimeout(timeout);
        resolve(bytes > 0);
      };
      probeRecorder.start();
      setTimeout(() => {
        if (probeRecorder.state !== "inactive") probeRecorder.stop();
      }, 300);
    } catch {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await uploads;
    stream?.getTracks().forEach((track) => track.stop());
  })();
  return stopping;
}

ipcRenderer.on(channel, async (_event, { id, command, paused }) => {
  try {
    if (command === "pause") {
      // Disabled video tracks produce black frames, retaining elapsed audit time.
      // Acknowledge before the main process may insert credentials into the page.
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !paused;
      });
    } else if (command === "stop") await stop();
    else throw new Error("Invalid recorder control");
    await ipcRenderer.invoke(channel, "ack", id);
  } catch (error) {
    fail(error);
  }
});

async function start() {
  const { sourceId, width, height } = await ipcRenderer.invoke(channel, "bootstrap");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // Chromium performs the scaling and letterboxing; no Canvas or pixel IPC.
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: sourceId,
        minWidth: width,
        maxWidth: width,
        minHeight: height,
        maxHeight: height,
        maxFrameRate: 25
      }
    } as MediaTrackConstraints
  });
  const track = stream.getVideoTracks()[0];
  track.enabled = false;
  track.contentHint = "detail";
  let mimeType = "";
  for (const candidate of ["video/mp4;codecs=avc3", "video/webm;codecs=vp8"]) {
    if (await probe(stream, candidate)) {
      mimeType = candidate;
      break;
    }
  }
  if (!mimeType) throw new Error("No supported website video encoder");
  const settings = track.getSettings();
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  video.onresize = () => {
    if (video.videoWidth && (video.videoWidth !== settings.width || video.videoHeight !== settings.height))
      resized = true;
  };
  await video.play();
  const { paused } = await ipcRenderer.invoke(channel, "ready", {
    format: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
    width: settings.width,
    height: settings.height
  });
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
  recorder.onerror = () => fail(new Error("Website video encoding failed"));
  recorder.ondataavailable = (event) => {
    if (!event.data.size || failed) return;
    pendingBytes += event.data.size;
    if (pendingBytes > MAX_PENDING_BYTES || event.data.size > 8 << 20) {
      fail(new Error("Website recording upload buffer is full"));
      return;
    }
    const index = sequence++;
    const changedSize = resized;
    uploads = uploads.then(async () => {
      const bytes = new Uint8Array(await event.data.arrayBuffer());
      await ipcRenderer.invoke(channel, "chunk", { sequence: index, resized: changedSize, bytes });
      pendingBytes -= bytes.length;
    });
    void uploads.catch(fail);
  };
  track.enabled = !paused;
  recorder.start(1000);
  await ipcRenderer.invoke(channel, "started");
}

void start().catch(fail);
