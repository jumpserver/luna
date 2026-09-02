import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract as createTarExtractor } from "tar-stream";

const MAX_EXTRACTED_ENTRY_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_MEDIA_ENTRIES = 10_000;
const IDENTIFIER_PATTERN = /^[\w-]{1,128}$/;
let recordingSequence = 0;

function basename(value) {
  return String(value).replaceAll("\\", "/").split("/").pop() || "";
}

function classify(sourceName) {
  const lower = sourceName.toLowerCase();
  if (lower.endsWith(".replay.json")) return { kind: "metadata" };
  if (lower.endsWith(".part.gz")) {
    const match = lower.match(/^.+\.(\d+)\.part\.gz$/);
    return match ? { kind: "media", mediaType: "part", partIndex: Number(match[1]) } : null;
  }
  if (lower.endsWith(".replay.gz")) return { kind: "media", mediaType: "gua" };
  if (lower.endsWith(".cast.gz") || lower.endsWith(".cast")) return { kind: "media", mediaType: "cast" };
  if (lower.endsWith(".mp4")) return { kind: "media", mediaType: "mp4" };
  return null;
}

function recordingLabel(sourcePath) {
  const fileName = path.basename(sourcePath);
  const lower = fileName.toLowerCase();
  for (const suffix of [".replay.tar", ".tar", ".cast.gz", ".cast", ".replay.gz", ".part.gz", ".mp4"]) {
    if (lower.endsWith(suffix)) return fileName.slice(0, -suffix.length);
  }
  return fileName;
}

function nextRecordingId() {
  return `recording-${Date.now()}-${recordingSequence++}`;
}

function sizeLimiter(sourceName, maximumBytes) {
  let byteLength = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      byteLength += chunk.length;
      if (byteLength > maximumBytes) {
        callback(new Error(`package entry exceeds ${maximumBytes} bytes: ${sourceName}`));
        return;
      }
      callback(null, chunk);
    }
  });
}

async function readMetadata(stream, sourceName) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of stream) {
    byteLength += chunk.length;
    if (byteLength > MAX_METADATA_BYTES) {
      throw new Error(`metadata entry ${sourceName} exceeds the ${MAX_METADATA_BYTES} byte limit`);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new Error(`invalid replay metadata: ${error}`);
  }
}

async function writeMedia(stream, sourceName, destination) {
  const limiter = sizeLimiter(sourceName, MAX_EXTRACTED_ENTRY_BYTES);
  const destinationStream = createWriteStream(destination, { flags: "wx" });
  if (sourceName.toLowerCase().endsWith(".gz")) {
    await pipeline(stream, createGunzip(), limiter, destinationStream);
  } else {
    await pipeline(stream, limiter, destinationStream);
  }
  return (await stat(destination)).size;
}

function recordingMetadata(raw) {
  if (!raw) return {};
  const metadata = {
    source_id: raw.id,
    user: raw.user,
    asset: raw.asset,
    account: raw.account,
    protocol: raw.protocol,
    login_from: raw.login_from,
    remote_addr: raw.remote_addr,
    date_start: raw.date_start,
    date_end: raw.date_end,
    duration: raw.duration,
    command_amount: raw.command_amount
  };
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null));
}

function buildManifest(recordingId, label, extracted) {
  if (!extracted.media.length) throw new Error("no supported media entries found in recording package");
  extracted.media.sort(
    (left, right) =>
      Number(left.media_type !== "part") - Number(right.media_type !== "part") ||
      (left.part_index ?? Number.MAX_SAFE_INTEGER) - (right.part_index ?? Number.MAX_SAFE_INTEGER)
  );
  const partTotal = extracted.media.filter((entry) => entry.media_type === "part").length;
  const replayFiles = Array.isArray(extracted.metadata?.files) ? extracted.metadata.files : [];
  const entries = extracted.media.map((entry) => {
    const fileMetadata = replayFiles.find((file) => basename(file?.name) === entry.source_name);
    return Object.fromEntries(
      Object.entries({
        ...entry,
        part_total: entry.media_type === "part" && partTotal > 1 ? partTotal : undefined,
        start_ms: fileMetadata?.start,
        end_ms: fileMetadata?.end,
        duration_ms: fileMetadata?.duration
      }).filter(([, value]) => value !== undefined)
    );
  });
  return {
    version: 1,
    recording_id: recordingId,
    label,
    metadata: recordingMetadata(extracted.metadata),
    entries
  };
}

async function extractTar(sourcePath, entriesDirectory) {
  const extracted = { metadata: null, media: [] };
  const extractor = createTarExtractor();
  extractor.on("entry", (header, stream, next) => {
    const processEntry = async () => {
      if (header.type !== "file") {
        stream.resume();
        await new Promise((resolve) => stream.once("end", resolve));
        return;
      }
      const sourceName = basename(header.name);
      const classified = classify(sourceName);
      if (!classified) {
        stream.resume();
        await new Promise((resolve) => stream.once("end", resolve));
        return;
      }
      if (classified.kind === "metadata") {
        if (extracted.metadata) throw new Error(`package contains more than one replay metadata entry: ${sourceName}`);
        extracted.metadata = await readMetadata(stream, sourceName);
        return;
      }
      if (extracted.media.length >= MAX_MEDIA_ENTRIES) {
        throw new Error(`package contains more than ${MAX_MEDIA_ENTRIES} media entries`);
      }
      const entryId = `entry-${String(extracted.media.length).padStart(8, "0")}`;
      const byteLength = await writeMedia(stream, sourceName, path.join(entriesDirectory, entryId));
      extracted.media.push({
        entry_id: entryId,
        source_name: sourceName,
        media_type: classified.mediaType,
        byte_length: byteLength,
        ...(classified.partIndex === undefined ? {} : { part_index: classified.partIndex })
      });
    };
    void processEntry()
      .then(next)
      .catch((error) => extractor.destroy(error));
  });
  await pipeline(createReadStream(sourcePath), extractor);
  return extracted;
}

async function extractSingleFile(sourcePath, entriesDirectory) {
  const sourceName = path.basename(sourcePath);
  const classified = classify(sourceName);
  if (!classified || classified.kind !== "media") throw new Error(`unsupported offline recording file: ${sourcePath}`);
  const entryId = "entry-00000000";
  const byteLength = await writeMedia(createReadStream(sourcePath), sourceName, path.join(entriesDirectory, entryId));
  return {
    metadata: null,
    media: [
      {
        entry_id: entryId,
        source_name: sourceName,
        media_type: classified.mediaType,
        byte_length: byteLength,
        ...(classified.partIndex === undefined ? {} : { part_index: classified.partIndex })
      }
    ]
  };
}

export class OfflineRecordingStore {
  // ponytail: migration keeps legacy dynamic state; replace with explicit recording manifest types when strict mode is enabled.
  [key: string]: any;

  constructor(root) {
    this.root = root;
  }

  async initialize() {
    await mkdir(this.root, { recursive: true });
    this.canonicalRoot = await realpath(this.root);
  }

  async importRecording(sourcePath) {
    const sourceInfo = await lstat(sourcePath);
    if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile())
      throw new Error("offline recording source must be a regular file");
    const recordingId = nextRecordingId();
    const pendingDirectory = path.join(this.root, `.pending-${recordingId}`);
    const finalDirectory = path.join(this.root, recordingId);
    const entriesDirectory = path.join(pendingDirectory, "entries");
    await mkdir(pendingDirectory, { recursive: false });
    await mkdir(entriesDirectory, { recursive: false });
    try {
      const extracted = sourcePath.toLowerCase().endsWith(".tar")
        ? await extractTar(sourcePath, entriesDirectory)
        : await extractSingleFile(sourcePath, entriesDirectory);
      const manifest = buildManifest(recordingId, recordingLabel(sourcePath), extracted);
      await writeFile(path.join(pendingDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
        flag: "wx"
      });
      await rename(pendingDirectory, finalDirectory);
      return manifest;
    } catch (error) {
      await rm(pendingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async resolveEntry(recordingId, entryId) {
    if (!IDENTIFIER_PATTERN.test(recordingId) || !IDENTIFIER_PATTERN.test(entryId)) {
      throw new Error("invalid offline recording identifier");
    }
    const entriesDirectory = path.join(this.root, recordingId, "entries");
    const candidate = path.join(entriesDirectory, entryId);
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("recording entry is not a regular file");
    const canonicalEntries = await realpath(entriesDirectory);
    const canonicalCandidate = await realpath(candidate);
    if (
      !canonicalEntries.startsWith(`${this.canonicalRoot}${path.sep}`) ||
      !canonicalCandidate.startsWith(`${canonicalEntries}${path.sep}`)
    ) {
      throw new Error("recording entry escapes offline storage");
    }
    return canonicalCandidate;
  }

  async resolveEntryDescriptor(recordingId, entryId) {
    const entryPath = await this.resolveEntry(recordingId, entryId);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(this.root, recordingId, "manifest.json"), "utf8"));
    } catch {
      throw new Error("offline recording manifest is invalid");
    }
    const entry = Array.isArray(manifest.entries)
      ? manifest.entries.find((candidate) => candidate?.entry_id === entryId)
      : null;
    if (!entry || !["mp4", "cast", "gua", "part"].includes(entry.media_type)) {
      throw new Error("offline recording entry is missing from manifest");
    }
    return { path: entryPath, mediaType: entry.media_type };
  }

  async removeRecording(recordingId) {
    if (!IDENTIFIER_PATTERN.test(recordingId)) throw new Error("invalid offline recording identifier");
    const recordingDirectory = path.join(this.root, recordingId);
    let info;
    try {
      info = await lstat(recordingDirectory);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("offline recording is not a directory");
    await rm(recordingDirectory, { recursive: true });
  }

  async listRecordings() {
    const { readdir } = await import("node:fs/promises");
    const manifests = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !IDENTIFIER_PATTERN.test(entry.name)) continue;
      try {
        manifests.push(JSON.parse(await readFile(path.join(this.root, entry.name, "manifest.json"), "utf8")));
      } catch {
        // Ignore incomplete or corrupted recording directories.
      }
    }
    return manifests.sort((left, right) => String(right.recording_id).localeCompare(String(left.recording_id)));
  }
}
