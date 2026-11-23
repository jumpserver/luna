import { ipcRenderer } from "electron";
import Guacamole from "@jumpserver/guacamole";
import { computeTargetDimensions } from "./codec";

const channel = process.argv.find((arg) => arg.startsWith("--replay-renderer-channel="))?.split("=")[1];
const FRAME_INTERVAL_MS = 100;
const BLOCK_SIZE = 256 * 1024;

type Instruction = { opcode: string; args: string[] };

async function* instructions(size: number): AsyncGenerator<Instruction> {
  const parser = new Guacamole.Parser();
  const pending: Instruction[] = [];
  parser.oninstruction = (opcode, args) => pending.push({ opcode, args });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let start = 0; start < size; start += BLOCK_SIZE) {
    const bytes = await ipcRenderer.invoke(channel, "read", { start, end: Math.min(start + BLOCK_SIZE, size) });
    parser.receive(decoder.decode(bytes, { stream: true }));
    for (const instruction of pending) yield instruction;
    pending.length = 0;
  }
  parser.receive(decoder.decode());
  for (const instruction of pending) yield instruction;
}

async function render() {
  const { size, resolution } = await ipcRenderer.invoke(channel, "bootstrap");
  let width = 0;
  let height = 0;
  let firstTimestamp: number | undefined;
  let lastTimestamp = 0;
  for await (const { opcode, args } of instructions(size)) {
    if (opcode === "size" && args[0] === "0") {
      const w = Number(args[1]);
      const h = Number(args[2]);
      if (![w, h].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)) {
        throw new Error("Invalid replay dimensions");
      }
      width = Math.max(width, w);
      height = Math.max(height, h);
    } else if (opcode === "sync") {
      const timestamp = Number(args[0]);
      if (!Number.isFinite(timestamp) || timestamp < lastTimestamp) throw new Error("Invalid replay timeline");
      firstTimestamp ??= timestamp;
      lastTimestamp = timestamp;
    }
  }
  if (!width || !height) throw new Error("Replay has no display size");
  if (firstTimestamp === undefined) throw new Error("Replay has no frames");
  const duration = lastTimestamp - firstTimestamp;
  const totalFrames = Math.ceil(duration / FRAME_INTERVAL_MS) + 1;
  const dimensions = computeTargetDimensions(width, height, resolution);
  const tunnel = new Guacamole.Tunnel();
  tunnel.connect = tunnel.disconnect = tunnel.sendMessage = () => {};
  // Use the player's rendering engine without interactive seek/snapshot caching.
  const client = new Guacamole.Client(tunnel);
  const display = client.getDisplay();
  const element = display.getElement();
  display.showCursor(false);
  document.body.style.cssText = "margin:0;background:black;overflow:hidden";
  document.body.appendChild(element);
  client.connect();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;
  const memoryFrame = () => {
    const layer = display.getDefaultLayer();
    // CSS layer composition remains Chromium's job. Read flat displays directly from
    // the player's canvases, including its separate software cursor, without a paint wait.
    if (
      Object.keys(layer.children).length ||
      layer.alpha !== 255 ||
      layer.x ||
      layer.y ||
      layer.matrix.some((value, index) => value !== [1, 0, 0, 1, 0, 0][index])
    )
      return;
    if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
    }
    context.fillStyle = "black";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(canvas.width / display.getWidth(), canvas.height / display.getHeight());
    context.drawImage(layer.getCanvas(), 0, 0, layer.width, layer.height, 0, 0, layer.width, layer.height);
    const cursor = display.getCursorLayer();
    if (cursor.getElement().parentNode && cursor.width && cursor.height) {
      context.drawImage(
        cursor.getCanvas(),
        0,
        0,
        cursor.width,
        cursor.height,
        cursor.x,
        cursor.y,
        cursor.width,
        cursor.height
      );
    }
    context.restore();
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  let frameIndex = 0;
  let changed = false;
  const emitFrames = async (end: number) => {
    if (frameIndex >= end) return;
    let pixels: Uint8ClampedArray | undefined;
    if (changed) {
      await new Promise<void>((resolve) => display.flush(resolve));
      pixels = memoryFrame();
      element.style.transformOrigin = "0 0";
      element.style.transform = `scale(${dimensions.width / display.getWidth()}, ${dimensions.height / display.getHeight()})`;
      if (!pixels) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
    }
    await ipcRenderer.invoke(channel, "frame", {
      index: frameIndex,
      count: end - frameIndex,
      capture: changed && !pixels,
      pixels
    });
    frameIndex = end;
    changed = false;
  };
  try {
    await ipcRenderer.invoke(channel, "ready", { ...dimensions, totalFrames });
    const frame: Instruction[] = [];
    for await (const instruction of instructions(size)) {
      if (instruction.opcode !== "sync") {
        frame.push(instruction);
        continue;
      }
      // Empty heartbeat frames do not change the image; encode the entire idle span in one batch.
      if (!frame.length) continue;
      const timestamp = Number(instruction.args[0]) - firstTimestamp;
      await emitFrames(Math.min(totalFrames, Math.ceil(timestamp / FRAME_INTERVAL_MS)));
      for (const { opcode, args } of frame) tunnel.oninstruction!(opcode, args);
      tunnel.oninstruction!(instruction.opcode, instruction.args);
      frame.length = 0;
      changed = true;
    }
    await emitFrames(totalFrames);
    await ipcRenderer.invoke(channel, "done");
  } finally {
    client.disconnect();
    display.cancel();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void render().catch((error) => ipcRenderer.invoke(channel, "error", String(error.message || error)));
});
