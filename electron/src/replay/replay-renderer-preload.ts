import { ipcRenderer } from "electron";
import Guacamole from "@jumpserver/guacamole";
import { computeTargetDimensions } from "./codec";

const channel = process.argv.find((arg) => arg.startsWith("--replay-renderer-channel="))?.split("=")[1];
const FRAME_INTERVAL_MS = 100;
const BLOCK_SIZE = 256 * 1024;

async function render() {
  const { size, resolution } = await ipcRenderer.invoke(channel, "bootstrap");
  let width = 0;
  let height = 0;
  const parser = new Guacamole.Parser();
  parser.oninstruction = (opcode, args) => {
    if (opcode !== "size" || args[0] !== "0") return;
    const w = Number(args[1]);
    const h = Number(args[2]);
    if (![w, h].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)) {
      throw new Error("Invalid replay dimensions");
    }
    width = Math.max(width, w);
    height = Math.max(height, h);
  };
  let closed = false;
  const read = async (start: number, end: number): Promise<Uint8Array<ArrayBuffer>> => {
    if (closed) throw new DOMException("Recording closed", "AbortError");
    return ipcRenderer.invoke(channel, "read", { start, end });
  };
  // Read protocol bytes on demand without copying the full recording into the renderer.
  const source: Guacamole.SessionRecording.Source = {
    async *stream(signal) {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for (let start = 0; start < size; start += BLOCK_SIZE) {
        if (signal?.aborted) throw new DOMException("Recording closed", "AbortError");
        const bytes = await read(start, Math.min(start + BLOCK_SIZE, size));
        parser.receive(decoder.decode(bytes, { stream: true }));
        yield bytes;
      }
      parser.receive(decoder.decode());
    },
    async read(start, end) {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for (let offset = start; offset < end; offset += BLOCK_SIZE) {
        parts.push(await read(offset, Math.min(offset + BLOCK_SIZE, end)));
      }
      return new Blob(parts);
    },
    close() {
      closed = true;
    }
  };
  // Use the same recording and display implementation as GuacamolePlayer.
  const recording = new Guacamole.SessionRecording(source);
  const display = recording.getDisplay();
  const element = display.getElement();
  document.body.style.cssText = "margin:0;background:black;overflow:hidden";
  document.body.appendChild(element);
  let rejectRender: (error: Error) => void;
  const timestamps: number[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      rejectRender = reject;
      recording.onerror = (message) => rejectRender(new Error(message));
      recording.onprogress = (timestamp) => {
        if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp < (timestamps.at(-1) ?? 0)) {
          rejectRender(new Error("Invalid replay timeline"));
          return;
        }
        timestamps.push(timestamp);
      };
      recording.onload = resolve;
    });
    if (!width || !height) throw new Error("Replay has no display size");
    if (!timestamps.length) throw new Error("Replay has no frames");
    const duration = recording.getDuration();
    const totalFrames = Math.ceil(duration / FRAME_INTERVAL_MS) + 1;
    const dimensions = computeTargetDimensions(width, height, resolution);
    await ipcRenderer.invoke(channel, "ready", { ...dimensions, totalFrames });
    let sourceIndex = 0;
    let renderedIndex = -1;
    for (let index = 0; index < totalFrames; index++) {
      const timestamp = Math.min(index * FRAME_INTERVAL_MS, duration);
      while (sourceIndex + 1 < timestamps.length && timestamps[sourceIndex + 1] <= timestamp) sourceIndex++;
      if (sourceIndex !== renderedIndex) {
        await new Promise<void>((resolve, reject) => {
          rejectRender = reject;
          recording.seek(timestamps[sourceIndex], resolve);
        });
        renderedIndex = sourceIndex;
      }
      // Capture the actual display, including cursor, CSS layer transforms, clipping and group opacity.
      // Use the player's display scaling and wait for Chromium to commit it before capturePage().
      element.style.transformOrigin = "0 0";
      element.style.transform = `scale(${dimensions.width / display.getWidth()}, ${dimensions.height / display.getHeight()})`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      // Await capture and the encoder write so only one unencoded frame exists at a time.
      await ipcRenderer.invoke(channel, "frame", { index });
    }
    await ipcRenderer.invoke(channel, "done");
  } finally {
    recording.dispose();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void render().catch((error) => ipcRenderer.invoke(channel, "error", String(error.message || error)));
});
