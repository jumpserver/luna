import { spawn } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function goTarget(platform, architecture) {
  const goos = { darwin: "darwin", linux: "linux", win32: "windows", windows: "windows" }[platform];
  const goarch = { arm64: "arm64", x64: "amd64", amd64: "amd64" }[architecture];
  if (!goos || !goarch) throw new Error(`unsupported SSH helper target: ${platform}/${architecture}`);
  return { goos, goarch };
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}`));
    });
  });
}

async function signDarwinHelper(outputPath) {
  if (process.platform !== "darwin") return;
  const identity = process.env.CSC_NAME || "-";
  const args = ["--force", "--sign", identity];
  if (identity !== "-") args.push("--options", "runtime", "--timestamp");
  args.push("--entitlements", path.join(projectRoot, "electron", "assets", "entitlements", "ssh-helper.plist"));
  args.push(outputPath);
  await run("codesign", args);
  await run("codesign", ["--verify", "--strict", "--verbose=2", outputPath]);
}

export async function buildSshHelper({
  platform = process.env.JMS_ELECTRON_TARGET_PLATFORM || process.platform,
  architecture = process.env.JMS_ELECTRON_TARGET_ARCH || process.arch
} = {}) {
  const { goos, goarch } = goTarget(platform, architecture);
  const outputDir = path.join(projectRoot, ".electron-resources", "bin");
  const outputPath = path.join(outputDir, goos === "windows" ? "jms-ssh.exe" : "jms-ssh");
  await mkdir(outputDir, { recursive: true });
  await run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", outputPath, "."], {
    cwd: path.join(projectRoot, "electron", "ssh-helper"),
    env: { ...process.env, CGO_ENABLED: "0", GOOS: goos, GOARCH: goarch }
  });
  if (goos !== "windows") await chmod(outputPath, 0o755);
  if (goos === "darwin") await signDarwinHelper(outputPath);
  console.info(`[electron] built SSH helper for ${goos}/${goarch}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSshHelper();
}
