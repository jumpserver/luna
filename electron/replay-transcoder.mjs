import { availableParallelism } from "node:os";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { once } from "node:events";
import { extract as createTarExtractor } from "tar-stream";
import { nativeImage } from "electron";
import { buildTimeline, computeTargetDimensions, GuacamoleParser, ReplayRenderer } from "./replay-codec.mjs";

const FPS = 10;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_PART_BYTES = 512 * 1024 * 1024;

function extractSessionId(filename) {
  return (
    path
      .basename(filename)
      .replace(/\.tar$/i, "")
      .split(".")[0] || "unknown"
  );
}

function parsePartIndex(filename) {
  const match = path.basename(filename).match(/\.(\d+)\.part\.gz$/);
  return match ? Number(match[1]) : null;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
}

function outputFilename(metadata, style) {
  if (style === "friendly") {
    return `${sanitizeFilename(metadata.user)}-${sanitizeFilename(metadata.asset)}-${sanitizeFilename(metadata.account)}.mp4`;
  }
  if (style === "friendly_uuid") {
    return `${sanitizeFilename(metadata.user)}-${sanitizeFilename(metadata.asset)}-${sanitizeFilename(metadata.account)}(${metadata.id}).mp4`;
  }
  return `${sanitizeFilename(metadata.id)}.mp4`;
}

function readEntry(stream, maximum) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    stream.on("data", (chunk) => {
      length += chunk.length;
      if (length > maximum) stream.destroy(new Error("replay archive entry exceeds its size limit"));
      else chunks.push(chunk);
    });
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

export function extractReplayArchive(archivePath) {
  return new Promise((resolve, reject) => {
    const extractor = createTarExtractor();
    let replayJson;
    const parts = [];
    let failed = false;

    const fail = (error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    extractor.on("entry", (header, stream, next) => {
      const filename = path.basename(header.name || "");
      const partIndex = parsePartIndex(filename);
      const reading = filename.endsWith(".replay.json")
        ? readEntry(stream, MAX_METADATA_BYTES).then((data) => {
            replayJson = data;
          })
        : partIndex !== null
          ? readEntry(stream, MAX_PART_BYTES).then((data) => {
              parts.push([partIndex, data]);
            })
          : new Promise((resolve, reject) => {
              stream.once("end", resolve);
              stream.once("error", reject);
              stream.resume();
            });
      reading.then(next, fail);
    });
    extractor.once("finish", () => {
      if (failed) return;
      if (!replayJson) return fail(new Error("replay.json not found in tar archive"));
      if (!parts.length) return fail(new Error(".part.gz file not found in tar archive"));
      parts.sort(([left], [right]) => left - right);
      resolve({ replayJson, parts });
    });
    extractor.once("error", fail);
    createReadStream(archivePath).once("error", fail).pipe(extractor);
  });
}

function rgbaFromBitmap(bitmap, width, height) {
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = bitmap[offset + 2];
    rgba[offset + 1] = bitmap[offset + 1];
    rgba[offset + 2] = bitmap[offset];
    rgba[offset + 3] = bitmap[offset + 3];
  }
  return rgba;
}

function bitmapFromRgba(rgba) {
  const bitmap = Buffer.allocUnsafe(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    bitmap[offset] = rgba[offset + 2];
    bitmap[offset + 1] = rgba[offset + 1];
    bitmap[offset + 2] = rgba[offset];
    bitmap[offset + 3] = rgba[offset + 3];
  }
  return bitmap;
}

function decodeImage(_mime, data) {
  const image = nativeImage.createFromBuffer(data);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  return { width, height, pixels: rgbaFromBitmap(image.toBitmap(), width, height) };
}

function resizeFrame(frame, width, height) {
  if (frame.width === width && frame.height === height) return frame.pixels;
  const image = nativeImage.createFromBitmap(bitmapFromRgba(frame.pixels), {
    width: frame.width,
    height: frame.height
  });
  const resized = image.resize({ width, height, quality: "good" });
  return rgbaFromBitmap(resized.toBitmap(), width, height);
}

function threadCount(power) {
  const fractions = { auto: 1, full: 1, fast: 0.75, medium: 0.5, low: 0.25 };
  return Math.max(1, Math.round(availableParallelism() * (fractions[power] || 1)));
}

function bitrate(width, height) {
  return Math.max(800_000, Math.min(20_000_000, width * height * 5));
}

async function startEncoder(executable, outputPath, width, height, power) {
  if (!executable || !(await stat(executable).catch(() => null))?.isFile()) {
    throw new Error("installed FFmpeg plugin executable not found");
  }
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp.mp4`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(FPS),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-threads",
    String(threadCount(power)),
    "-b:v",
    String(bitrate(width, height)),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    temporaryPath
  ];
  const child = spawn(executable, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let errorOutput = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `FFmpeg exited with code ${code}`));
    });
  });
  return { child, completion, temporaryPath };
}

async function writeFrame(stream, frame) {
  if (!stream.write(frame)) await once(stream, "drain");
}

async function encodeGuacamole(data, executable, outputPath, resolution, power, onProgress) {
  const timeline = buildTimeline(data);
  if (timeline.frames.length < 2) throw new Error("not enough frames to encode");
  const dimensions = computeTargetDimensions(timeline.maxWidth, timeline.maxHeight, resolution);
  const encoder = await startEncoder(executable, outputPath, dimensions.width, dimensions.height, power);
  const parser = new GuacamoleParser(data);
  const renderer = new ReplayRenderer(decodeImage);
  let frameIndex = 0;
  let instruction = parser.nextInstruction();
  try {
    onProgress(5);
    while (instruction !== null) {
      if (instruction.opcode === "sync") {
        const timestamp = Number(instruction.args[0]);
        while (frameIndex < timeline.frames.length && timeline.frames[frameIndex] <= timestamp) {
          await writeFrame(encoder.child.stdin, resizeFrame(renderer.composite(), dimensions.width, dimensions.height));
          frameIndex += 1;
          onProgress(10 + (frameIndex / timeline.frames.length) * 85);
        }
      } else {
        renderer.handle(instruction);
      }
      instruction = parser.nextInstruction();
    }
    encoder.child.stdin.end();
    await encoder.completion;
    await rm(outputPath, { force: true });
    await rename(encoder.temporaryPath, outputPath);
    onProgress(100);
  } catch (error) {
    encoder.child.stdin.destroy();
    encoder.child.kill();
    await encoder.completion.catch(() => undefined);
    await rm(encoder.temporaryPath, { force: true });
    throw error;
  }
}

export class ReplayTranscoder {
  constructor(_projectRoot, emitProgress, ffmpegPlugin) {
    this.emitProgress = emitProgress;
    this.ffmpegPlugin = ffmpegPlugin;
  }

  emit(file, index, total, progress, message, targetLabel, extra = {}) {
    this.emitProgress({ file, index, total, progress, message, ...extra }, targetLabel);
  }

  async transcode(request, targetLabel) {
    const tarPaths = Array.isArray(request.tarPaths) ? request.tarPaths : [];
    const outputDir = String(request.outputDir || "");
    if (!outputDir) throw new Error("output directory is required");
    const ffmpeg = await this.ffmpegPlugin.executable();
    await mkdir(outputDir, { recursive: true });
    const results = [];
    for (const [index, archivePath] of tarPaths.entries()) {
      const fallbackId = extractSessionId(archivePath);
      let metadata;
      try {
        const archive = await extractReplayArchive(archivePath);
        metadata = JSON.parse(archive.replayJson.toString("utf8"));
        if (!metadata?.id) throw new Error("replay metadata is missing its session id");
        this.emit(metadata.id, index, tarPaths.length, 0, "extracting archive", targetLabel, { metadata });
        const guacamoleData = Buffer.concat(
          archive.parts.map(([partIndex, compressed]) => {
            try {
              return gunzipSync(compressed);
            } catch (error) {
              throw new Error(`gzip decompress failed for part ${partIndex}: ${error.message}`);
            }
          })
        );
        const output = path.join(outputDir, outputFilename(metadata, request.filenameStyle));
        const started = performance.now();
        await encodeGuacamole(
          guacamoleData,
          ffmpeg,
          output,
          request.outputResolution || "original",
          request.transcodePower || "full",
          (progress) =>
            this.emit(metadata.id, index, tarPaths.length, progress, `encoding: ${Math.round(progress)}%`, targetLabel)
        );
        const duration = (performance.now() - started) / 1000;
        this.emit(metadata.id, index, tarPaths.length, 100, "done", targetLabel, {
          success: true,
          output,
          duration
        });
        results.push({ id: metadata.id, input: archivePath, output, success: true, metadata });
      } catch (error) {
        const id = metadata?.id || fallbackId;
        const message = `transcoding failed: ${error instanceof Error ? error.message : error}`;
        this.emit(id, index, tarPaths.length, 100, message, targetLabel, { success: false });
        results.push({
          id,
          input: archivePath,
          output: "",
          success: false,
          error: message,
          metadata: metadata || undefined
        });
      }
    }
    return results;
  }
}

export const replayTranscoderInternals = {
  bitrate,
  extractSessionId,
  outputFilename,
  parsePartIndex,
  sanitizeFilename,
  threadCount
};
