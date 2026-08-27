import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const tauriDir = join(rootDir, "src-tauri");

const mode = process.argv[2] === "release" ? "release" : "debug";
const withTranscode = process.argv.includes("--with-transcode");
const binaryName = process.platform === "win32" ? "client.exe" : "client";

function resourcePlatform() {
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
const args = ["build", "--manifest-path", join("src-tauri", "Cargo.toml"), "--bin", "client"];
if (withTranscode) args.push("--bin", "jms-transcode");
if (mode === "release") args.push("--release");

const build = spawnSync(cargo, args, {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const source = join(tauriDir, "target", mode, binaryName);
const resourceDir = join(tauriDir, "resources", "bin", resourcePlatform());
mkdirSync(resourceDir, { recursive: true });
copyFileSync(source, join(resourceDir, binaryName));

const compatibilityPath = join(tauriDir, "resources", "bin", binaryName);
copyFileSync(source, compatibilityPath);

if (process.platform !== "win32") {
  chmodSync(join(resourceDir, binaryName), 0o755);
  chmodSync(compatibilityPath, 0o755);
}
