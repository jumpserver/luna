import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import { readableFromWebBody } from "../shared/bytes";
import { probeCodex } from "./process";
import type { CodexRuntimeStatus } from "../../../ui/shared/codex/types";

export const CODEX_VERSION = "0.167.2";
// Official @openai/codex native npm artifacts. Upgrade the protocol and artifacts together.
const TARGETS = {
  "darwin-arm64": [
    "aarch64-apple-darwin",
    "JB6L+L2jefDIaNgoHi7ePZKK1u2riDhlbwgm6zK57ZWpMGAYAwKgDYDb7l+xie7oUkRZuCVx307wsB/k4VsMKw=="
  ],
  "darwin-x64": [
    "x86_64-apple-darwin",
    "/IqO1pMHGgeiZgbuklStur3o60giaXoESQ++Vak+I6eJ6CMULvojBfzwnk2aYeytCEIWU2cXcFKHA1L2tblbVg=="
  ],
  "linux-arm64": [
    "aarch64-unknown-linux-musl",
    "x/PhPRq0X+hBZDqXKE0YIm4NZoSyCF99KcJJWRn0B2WNdmYk3eBDtjNO5+wl7zWMCBwjTOev5Tz2ZZ6+Y14YQA=="
  ],
  "linux-x64": [
    "x86_64-unknown-linux-musl",
    "2Rw3VkWonMxwCSgOw+NkiKLOuOzyoQNWmxU7x8GniesdMfhKc4asNqOzTgQwJLKCrSlPc4/6fYTaH7fYcuGWGQ=="
  ],
  "win32-arm64": [
    "aarch64-pc-windows-msvc",
    "RyUq/XcXNylg8UW0u6Y1d/JlYr6d+HcOBiIPP8Z+rJrKXD09nG5Cm8AkTd5GhpiNmb72d8LD6z8a8cx3HImBFw=="
  ],
  "win32-x64": [
    "x86_64-pc-windows-msvc",
    "AIkl2U3kjC4Ac9fINmSt8kf1W0lWqFfNZUpqtHd+UDvskYYZxx7Vga7RcAtOVNJ2v4BXb1QqpCqcTOGPHLIwRw=="
  ]
} as const;

export async function unpackCodex(archive: string, directory: string, triple: string) {
  const unpack = extract();
  let total = 0;
  let entries = 0;
  unpack.on("entry", (header, stream, next) => {
    const write = async () => {
      if (++entries > 128 || !Number.isSafeInteger(header.size) || (header.size || 0) < 0)
        throw new Error("Invalid Codex archive");
      total += header.size || 0;
      if (total > 640 * 1024 * 1024) throw new Error("Codex archive exceeds its size limit");
      const parts = header.name.replace(/\/$/, "").split("/");
      if (
        parts[0] !== "package" ||
        parts.some((part) => !part || part === "." || part === ".." || /[\\:\0]/.test(part))
      )
        throw new Error("Invalid Codex archive path");
      if (header.type !== "file" && header.type !== "directory") throw new Error("Unsupported Codex archive entry");
      if (parts[1] !== "vendor" || parts[2] !== triple) {
        // Keep the package's license and notices alongside the private installation.
        if (parts.length !== 2 || !/^(?:LICENSE|NOTICE|README)/i.test(parts[1])) {
          stream.resume();
          return;
        }
      }
      const destination = path.join(directory, ...parts.slice(1));
      if (header.type === "directory") {
        await mkdir(destination, { recursive: true, mode: 0o700 });
        stream.resume();
      } else {
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await pipeline(stream, createWriteStream(destination, { flags: "wx", mode: 0o700 }));
      }
    };
    void write().then(next, (error) => unpack.destroy(error));
  });
  await pipeline(createReadStream(archive), createGunzip(), unpack);
}

export class CodexInstallation {
  private installing?: Promise<CodexRuntimeStatus>;
  private progress = 0;
  private controller?: AbortController;

  constructor(
    private root: string,
    private fetch: (url: string, init?: RequestInit) => Promise<Response>,
    private emit: (status: CodexRuntimeStatus) => void = () => {},
    private platform: NodeJS.Platform = process.platform,
    private arch = process.arch
  ) {}

  private get target() {
    const key = `${this.platform}-${this.arch}` as keyof typeof TARGETS;
    const target = TARGETS[key];
    if (!target) throw new Error(`Codex does not support ${key}`);
    return { key, triple: target[0], integrity: target[1] };
  }
  private get directory() {
    return path.join(this.root, CODEX_VERSION, this.target.key);
  }
  private binary(directory = this.directory) {
    return path.join(directory, "vendor", this.target.triple, "bin", this.platform === "win32" ? "codex.exe" : "codex");
  }
  async status(): Promise<CodexRuntimeStatus> {
    let installed = false;
    try {
      const manifest = JSON.parse(await readFile(path.join(this.directory, "installation.json"), "utf8"));
      installed = manifest.integrity === this.target.integrity && (await stat(this.binary())).isFile();
    } catch {
      // Missing or incomplete installations can be downloaded again.
    }
    return { version: CODEX_VERSION, installed, installing: !!this.installing, progress: this.progress };
  }
  async executable() {
    if (!(await this.status()).installed) throw new Error("Install the Codex engine in Settings > Local AI first");
    return this.binary();
  }
  install() {
    if (!this.installing) this.emit({ version: CODEX_VERSION, installed: false, installing: true, progress: 0 });
    this.installing ??= this.download().finally(() => {
      this.installing = undefined;
      void this.status()
        .then(this.emit)
        .catch(() => {});
    });
    return this.installing;
  }
  cancel() {
    this.controller?.abort();
  }
  private async download() {
    if ((await this.status()).installed) return { ...(await this.status()), installing: false };
    const target = this.target;
    await mkdir(path.dirname(this.directory), { recursive: true, mode: 0o700 });
    const staging = await mkdtemp(path.join(path.dirname(this.directory), ".install-"));
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(180_000)]);
    const archive = path.join(staging, "download.tgz");
    try {
      const response = await this.fetch(
        `https://registry.npmjs.org/@openai/codex/-/codex-${CODEX_VERSION}-${target.key}.tgz`,
        { signal }
      );
      if (!response.ok || !response.body) throw new Error(`Codex download failed: HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length"));
      const hash = createHash("sha512");
      let received = 0;
      this.progress = 0;
      const meter = new Transform({
        transform: (chunk, _encoding, done) => {
          received += chunk.length;
          if (received > 256 * 1024 * 1024) return done(new Error("Codex download exceeds its size limit"));
          hash.update(chunk);
          const percent = length > 0 ? Math.min(95, Math.floor((received / length) * 95)) : 0;
          if (percent !== this.progress) {
            this.progress = percent;
            this.emit({ version: CODEX_VERSION, installed: false, installing: true, progress: percent });
          }
          done(null, chunk);
        }
      });
      await pipeline(
        readableFromWebBody(response.body),
        meter,
        createWriteStream(archive, { flags: "wx", mode: 0o600 }),
        { signal }
      );
      if (hash.digest("base64") !== target.integrity) throw new Error("Codex download checksum mismatch");
      await unpackCodex(archive, staging, target.triple);
      await rm(archive);
      await chmod(this.binary(staging), 0o700);
      const { version } = await probeCodex(this.binary(staging));
      if (version !== `codex-cli ${CODEX_VERSION}`) throw new Error("Unexpected Codex engine version");
      await writeFile(path.join(staging, "installation.json"), JSON.stringify({ integrity: target.integrity }), {
        mode: 0o600
      });
      await rm(this.directory, { recursive: true, force: true });
      await rename(staging, this.directory);
      this.progress = 100;
      return { ...(await this.status()), installing: false };
    } finally {
      this.controller = undefined;
      await rm(staging, { recursive: true, force: true });
    }
  }
}
