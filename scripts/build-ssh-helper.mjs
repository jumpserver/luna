import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const nativeDir = join(rootDir, "native");

const mode = process.argv[2] === "release" ? "release" : "debug";
const withTranscode = process.argv.includes("--with-transcode");
const binaryName = process.platform === "win32" ? "client.exe" : "client";
const rustTarget = process.env.JMS_ELECTRON_RUST_TARGET?.trim();

function resourcePlatform() {
  switch (rustTarget) {
    case "aarch64-apple-darwin":
      return "darwin-arm64";
    case "x86_64-apple-darwin":
      return "darwin-amd64";
    case "aarch64-unknown-linux-gnu":
      return "linux-arm64";
    case "x86_64-unknown-linux-gnu":
      return "linux-amd64";
    case "x86_64-pc-windows-msvc":
      return "windows";
  }

  switch (`${process.platform}:${process.arch}`) {
    case "darwin:arm64":
      return "darwin-arm64";
    case "darwin:x64":
      return "darwin-amd64";
    case "linux:arm64":
      return "linux-arm64";
    case "linux:x64":
      return "linux-amd64";
    default:
      return "windows";
  }
}

const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const args = ["build", "--manifest-path", join("native", "Cargo.toml"), "--bin", "client"];
if (withTranscode) args.push("--bin", "jms-transcode");
if (rustTarget) args.push("--target", rustTarget);
if (mode === "release") args.push("--release");

const build = spawnSync(cargo, args, {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const source = join(nativeDir, "target", ...(rustTarget ? [rustTarget] : []), mode, binaryName);
const resourceDir = join(nativeDir, "resources", "bin", resourcePlatform());
mkdirSync(resourceDir, { recursive: true });
copyFileSync(source, join(resourceDir, binaryName));

const compatibilityPath = join(nativeDir, "resources", "bin", binaryName);
copyFileSync(source, compatibilityPath);

if (process.platform !== "win32") {
  chmodSync(join(resourceDir, binaryName), 0o755);
  chmodSync(compatibilityPath, 0o755);
}
