import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { readableFromWebBody } from "../shared/bytes";

const VERSION = "6.1.1";
const RELEASE = `b${VERSION}`;
const DOWNLOAD_BASES = [
  "https://cdn.npmmirror.com/binaries/ffmpeg-static",
  "https://github.com/eugeneware/ffmpeg-static/releases/download"
];
const TARGETS = {
  "darwin-arm64": {
    archiveSha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa",
    archiveSize: 18_350_000
  },
  "darwin-x64": {
    archiveSha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106",
    archiveSize: 24_120_000
  },
  "linux-arm64": {
    archiveSha256: "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
    archiveSize: 24_380_000
  },
  "linux-x64": {
    archiveSha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
    archiveSize: 28_000_000
  },
  "win32-x64": {
    archiveSha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
    archiveSize: 28_210_000
  }
};

function targetFor(platform, arch) {
  const key = `${platform}-${arch}`;
  const target = TARGETS[key];
  if (!target) throw new Error(`FFmpeg plugin does not support ${key}`);
  return { ...target, key };
}

function downloadUrl(base, filename) {
  return `${base}/${RELEASE}/${filename}`;
}

async function responseError(response) {
  const body = await response.text().catch(() => "");
  return new Error(`download failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
}

export class FfmpegPluginManager {
  private installing: Promise<unknown> | null = null;

  constructor(
    private root: string,
    private fetch: (input: string, init?: RequestInit) => Promise<Response>,
    private emitProgress: (payload: unknown, label?: string) => void = () => {},
    private platform: NodeJS.Platform = process.platform,
    private arch: string = process.arch
  ) {}

  get target() {
    return targetFor(this.platform, this.arch);
  }

  get directory() {
    return path.join(this.root, "ffmpeg", RELEASE, this.target.key);
  }

  get executablePath() {
    return path.join(this.directory, this.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  }

  get manifestPath() {
    return path.join(this.directory, "plugin.json");
  }

  async status() {
    const info = await stat(this.executablePath).catch(() => null);
    let manifest = null;
    try {
      manifest = JSON.parse(await readFile(this.manifestPath, "utf8"));
    } catch {
      // Missing or invalid manifests represent an uninstalled plugin.
    }
    const installed = Boolean(
      info?.isFile() &&
      manifest?.id === "ffmpeg" &&
      manifest?.version === VERSION &&
      manifest?.target === this.target.key &&
      manifest?.archive_sha256 === this.target.archiveSha256
    );
    return {
      id: "ffmpeg",
      name: "FFmpeg",
      version: VERSION,
      installed,
      installing: Boolean(this.installing),
      platform: this.platform,
      arch: this.arch,
      size: installed ? info.size : 0,
      downloadSize: this.target.archiveSize,
      license: "GPL-3.0-or-later",
      source: `https://github.com/eugeneware/ffmpeg-static/releases/tag/${RELEASE}`
    };
  }

  async executable() {
    const current = await this.status();
    if (!current.installed) throw new Error("FFmpeg plugin is not installed; install it from Settings > General");
    return this.executablePath;
  }

  install(targetLabel?: string) {
    if (!this.installing) {
      this.installing = this.installInternal(targetLabel).finally(() => {
        this.installing = null;
      });
    }
    return this.installing;
  }

  async installInternal(targetLabel?: string) {
    if ((await this.status()).installed) return this.status();
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = path.join(this.directory, `.ffmpeg-${process.pid}-${Date.now()}.download`);
    let lastError;
    try {
      for (const base of DOWNLOAD_BASES) {
        try {
          await this.downloadBinary(base, temporaryPath, targetLabel);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          await rm(temporaryPath, { force: true });
        }
      }
      if (lastError) throw lastError;
      if (this.platform !== "win32") await chmod(temporaryPath, 0o755);
      const check = spawnSync(temporaryPath, ["-version"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true
      });
      if (check.status !== 0 || !String(check.stdout).startsWith("ffmpeg version")) {
        throw new Error(check.stderr || "downloaded FFmpeg failed its executable check");
      }
      await rm(this.executablePath, { force: true });
      await rename(temporaryPath, this.executablePath);
      await this.downloadNotice("LICENSE", "LICENSE.txt");
      await this.downloadNotice("README", "README.txt");
      await writeFile(
        this.manifestPath,
        `${JSON.stringify(
          {
            id: "ffmpeg",
            name: "FFmpeg",
            version: VERSION,
            target: this.target.key,
            archive_sha256: this.target.archiveSha256,
            license: "GPL-3.0-or-later",
            source: `https://github.com/eugeneware/ffmpeg-static/releases/tag/${RELEASE}`
          },
          null,
          2
        )}\n`,
        { mode: 0o600 }
      );
      this.emitProgress({ status: "installed", progress: 100 }, targetLabel);
      return this.status();
    } catch (error) {
      await rm(temporaryPath, { force: true });
      this.emitProgress({ status: "error", progress: 0, error: String(error.message || error) }, targetLabel);
      throw error;
    }
  }

  async downloadBinary(base, destination, targetLabel?: string) {
    const filename = `ffmpeg-${this.target.key}.gz`;
    const response = await this.fetch(downloadUrl(base, filename), { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw await responseError(response);
    const expectedLength = Number(response.headers.get("content-length")) || this.target.archiveSize;
    const hash = createHash("sha256");
    let received = 0;
    let lastPercent = -1;
    const progress = new Transform({
      transform: (chunk, _encoding, callback) => {
        hash.update(chunk);
        received += chunk.length;
        const percent = Math.min(99, Math.floor((received / expectedLength) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          this.emitProgress({ status: "downloading", progress: percent, received, total: expectedLength }, targetLabel);
        }
        callback(null, chunk);
      }
    });
    await pipeline(
      readableFromWebBody(response.body),
      progress,
      createGunzip(),
      createWriteStream(destination, { mode: 0o700 })
    );
    const actual = hash.digest("hex");
    if (actual !== this.target.archiveSha256) {
      throw new Error(`FFmpeg download checksum mismatch: expected ${this.target.archiveSha256}, got ${actual}`);
    }
  }

  async downloadNotice(kind, destinationName) {
    const filename = `${this.target.key}.${kind}`;
    for (const base of DOWNLOAD_BASES) {
      const response = await this.fetch(downloadUrl(base, filename), { signal: AbortSignal.timeout(15_000) }).catch(
        () => null
      );
      if (!response?.ok) continue;
      const content = Buffer.from(await response.arrayBuffer());
      if (content.length > 1024 * 1024) throw new Error(`FFmpeg ${kind} exceeds its size limit`);
      await writeFile(path.join(this.directory, destinationName), content, { mode: 0o600 });
      return;
    }
    throw new Error(`FFmpeg ${kind} could not be downloaded`);
  }

  async uninstall() {
    if (this.installing) throw new Error("cannot uninstall FFmpeg while it is downloading");
    await rm(path.join(this.root, "ffmpeg"), { recursive: true, force: true });
    return this.status();
  }
}

export const ffmpegPluginInternals = { DOWNLOAD_BASES, RELEASE, TARGETS, VERSION, targetFor };
