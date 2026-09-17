import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { nativeImage } from "electron";
import { extract as createTarExtractor } from "tar-stream";
import { electronLog } from "../shared/debug-log";
import { buildTimeline, computeTargetDimensions, GuacamoleParser, ReplayRenderer } from "./codec";

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
  const match = path.basename(filename).match(/\.(\d+)\.part\.gz$/i);
  return match ? Number(match[1]) : null;
}

function classifyReplayArchiveEntry(filename) {
  const lower = path.basename(filename).toLowerCase();
  if (lower.endsWith(".replay.json")) return { kind: "metadata", priority: 0 };
  if (lower.endsWith(".json")) return { kind: "metadata", priority: 1 };
  const partIndex = parsePartIndex(filename);
  if (partIndex !== null) return { kind: "gua", partIndex, gzipped: true };
  if (lower.endsWith(".replay.gz")) return { kind: "gua", partIndex: 0, gzipped: true };
  if (lower.endsWith(".replay")) return { kind: "gua", partIndex: 0, gzipped: false };
  if (lower.endsWith(".part.cast.gz") || lower.endsWith(".cast.gz")) return { kind: "cast" };
  return { kind: null };
}

function parseReplayMetadata(data) {
  try {
    const metadata = JSON.parse(data.toString("utf8"));
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : undefined;
  } catch {
    // Invalid JSON is optional metadata, not an invalid replay archive.
  }
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
}

function outputFilename(metadata, style) {
  const id = sanitizeFilename(metadata.id);
  const friendly = [metadata.user, metadata.asset, metadata.account].map(sanitizeFilename);
  if (style === "friendly" && friendly.every(Boolean)) return `${friendly.join("-")}.mp4`;
  if (style === "friendly_uuid" && friendly.every(Boolean)) return `${friendly.join("-")}(${id}).mp4`;
  return `${id}.mp4`;
}

async function availableOutputPath(outputDir, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  for (let index = 0; ; index += 1) {
    const suffix = index ? ` (${index})` : "";
    const candidate = path.join(outputDir, `${stem}${suffix}${extension}`);
    try {
      await stat(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function readEntry(stream, maximum) {
  return new Promise<Buffer>((resolve, reject) => {
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
  return new Promise<{
    metadata?: Record<string, unknown>;
    parts: Array<{ index: number; data: Buffer; gzipped: boolean }>;
  }>((resolve, reject) => {
    const extractor = createTarExtractor();
    let metadata;
    let metadataPriority = Infinity;
    const parts = [];
    let hasCast = false;
    let failed = false;

    const fail = (error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    extractor.on("entry", (header, stream, next) => {
      const entry = classifyReplayArchiveEntry(header.name || "");
      const reading =
        entry.kind === "metadata"
          ? readEntry(stream, MAX_METADATA_BYTES).then((data) => {
              const candidate = parseReplayMetadata(data);
              if (candidate && entry.priority < metadataPriority) {
                metadata = candidate;
                metadataPriority = entry.priority;
              }
            })
          : entry.kind === "gua"
            ? readEntry(stream, MAX_PART_BYTES).then((data) => {
                parts.push({ index: entry.partIndex, data, gzipped: entry.gzipped });
              })
            : new Promise<void>((resolve, reject) => {
                if (entry.kind === "cast") hasCast = true;
                stream.once("end", resolve);
                stream.once("error", reject);
                stream.resume();
              });
      reading.then(next, fail);
    });
    extractor.once("finish", () => {
      if (failed) return;
      if (!parts.length) {
        return fail(new Error(hasCast ? "终端录像请用离线播放器" : "包里没有可转码的图形录像"));
      }
      parts.sort((left, right) => left.index - right.index);
      resolve({ metadata, parts });
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
  const completion = new Promise<void>((resolve, reject) => {
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

async function encodeGuacamole(data, executable, outputPath, resolution, power, onProgress, onEncoder) {
  const timeline = buildTimeline(data);
  if (timeline.frames.length < 2) throw new Error("not enough frames to encode");
  const dimensions = computeTargetDimensions(timeline.maxWidth, timeline.maxHeight, resolution);
  const parser = new GuacamoleParser(data);
  const renderer = new ReplayRenderer(decodeImage);
  const encoder = await startEncoder(executable, outputPath, dimensions.width, dimensions.height, power);
  onEncoder?.(encoder.child);
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
    await rename(encoder.temporaryPath, outputPath);
    onProgress(100);
  } catch (error) {
    encoder.child.stdin.destroy();
    encoder.child.kill();
    await encoder.completion.catch(() => undefined);
    await rm(encoder.temporaryPath, { force: true });
    throw error;
  } finally {
    onEncoder?.();
  }
}

export class ReplayTranscoder {
  // ponytail: migration keeps replay job payloads dynamic; replace with explicit job types when strict mode is enabled.
  [key: string]: any;

  constructor(_projectRoot, emitProgress, ffmpegPlugin) {
    this.emitProgress = emitProgress;
    this.ffmpegPlugin = ffmpegPlugin;
    this.activeTranscodes = 0;
    this.activeJobs = new Set();
  }

  get isTranscoding() {
    return this.activeTranscodes > 0;
  }

  cancel() {
    for (const job of this.activeJobs) {
      job.cancelled = true;
      job.encoder?.kill();
    }
  }

  cancelCurrent(targetLabel) {
    const job = [...this.activeJobs].find((candidate) => candidate.targetLabel === targetLabel);
    if (!job) return false;
    job.skipCurrent = true;
    job.encoder?.kill();
    return true;
  }

  emit(file, index, total, progress, message, targetLabel, extra = {}) {
    this.emitProgress({ file, index, total, progress, message, ...extra }, targetLabel);
  }

  async transcode(request, targetLabel) {
    const job = { cancelled: false, skipCurrent: false, encoder: undefined, targetLabel };
    this.activeTranscodes += 1;
    this.activeJobs.add(job);
    try {
      return await this.transcodeRequest(request, targetLabel, job);
    } finally {
      this.activeJobs.delete(job);
      this.activeTranscodes -= 1;
    }
  }

  async transcodeRequest(request, targetLabel, job) {
    const tarPaths = Array.isArray(request.tarPaths) ? request.tarPaths : [];
    const outputDir = String(request.outputDir || "");
    if (!outputDir) throw new Error("output directory is required");
    const ffmpeg = await this.ffmpegPlugin.executable();
    await mkdir(outputDir, { recursive: true });
    electronLog.info(`transcode ${tarPaths.length} file(s) -> ${outputDir}`);
    const results = [];
    for (const [index, archivePath] of tarPaths.entries()) {
      if (job.cancelled) break;
      job.skipCurrent = false;
      const fallbackId = extractSessionId(archivePath);
      let metadata;
      try {
        const archive = await extractReplayArchive(archivePath);
        if (job.cancelled || job.skipCurrent) throw new Error("transcoding cancelled");
        metadata = { ...archive.metadata, id: String(archive.metadata?.id || fallbackId) };
        this.emit(metadata.id, index, tarPaths.length, 0, "extracting archive", targetLabel, { metadata });
        const guacamoleData = Buffer.concat(
          archive.parts.map(({ index: partIndex, data, gzipped }) => {
            if (!gzipped) return data;
            try {
              return gunzipSync(data);
            } catch (error) {
              throw new Error(`gzip decompress failed for part ${partIndex}: ${error.message}`);
            }
          })
        );
        const output = await availableOutputPath(outputDir, outputFilename(metadata, request.filenameStyle));
        const started = performance.now();
        await encodeGuacamole(
          guacamoleData,
          ffmpeg,
          output,
          request.outputResolution || "original",
          request.transcodePower || "full",
          (progress) =>
            this.emit(metadata.id, index, tarPaths.length, progress, `encoding: ${Math.round(progress)}%`, targetLabel),
          (encoder) => {
            job.encoder = encoder;
            if (job.cancelled || job.skipCurrent) encoder?.kill();
          }
        );
        const duration = (performance.now() - started) / 1000;
        this.emit(metadata.id, index, tarPaths.length, 100, "done", targetLabel, {
          success: true,
          output,
          duration
        });
        results.push({ id: metadata.id, index, input: archivePath, output, success: true, metadata });
      } catch (error) {
        const id = metadata?.id || fallbackId;
        const message = job.skipCurrent
          ? "transcoding cancelled"
          : `transcoding failed: ${error instanceof Error ? error.message : error}`;
        electronLog.error(`transcode failed ${id}`, error);
        this.emit(id, index, tarPaths.length, 100, message, targetLabel, { success: false });
        results.push({
          id,
          index,
          input: archivePath,
          output: "",
          success: false,
          error: message,
          metadata: metadata || undefined
        });
        if (job.cancelled) break;
      }
    }
    return results;
  }
}

export const replayTranscoderInternals = {
  bitrate,
  extractSessionId,
  classifyReplayArchiveEntry,
  outputFilename,
  availableOutputPath,
  parsePartIndex,
  sanitizeFilename,
  threadCount
};
