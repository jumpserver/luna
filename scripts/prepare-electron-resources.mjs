import { access, chmod, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(projectRoot, ".electron-resources");
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const executable = process.platform === "win32" ? "jms-transcode.exe" : "jms-transcode";
const rustTarget = process.env.JMS_ELECTRON_RUST_TARGET?.trim();
const transcodeSource = path.join(
  projectRoot,
  "src-tauri",
  "target",
  ...(rustTarget ? [rustTarget] : []),
  "release",
  executable
);

await access(transcodeSource).catch(() => {
  throw new Error(`Electron transcode sidecar was not built: ${transcodeSource}`);
});

await rm(stagingRoot, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(stagingRoot, "bin"), { recursive: true }),
  mkdir(path.join(stagingRoot, "plugins"), { recursive: true }),
  mkdir(path.join(stagingRoot, "resources"), { recursive: true }),
  mkdir(path.join(stagingRoot, "icons"), { recursive: true })
]);
await Promise.all([
  cp(transcodeSource, path.join(stagingRoot, "bin", executable)),
  cp(path.join(projectRoot, "plugins", platform), path.join(stagingRoot, "plugins", platform), { recursive: true }),
  cp(path.join(projectRoot, "src-tauri", "resources", "bin"), path.join(stagingRoot, "resources", "bin"), {
    recursive: true
  }),
  cp(path.join(projectRoot, "src-tauri", "icons", "icon.png"), path.join(stagingRoot, "icons", "icon.png")),
  cp(path.join(projectRoot, "src-tauri", "icons", "32x32.png"), path.join(stagingRoot, "icons", "32x32.png")),
  cp(path.join(projectRoot, "src-tauri", "icons", "tray-mac.png"), path.join(stagingRoot, "icons", "tray-mac.png"))
]);
if (process.platform !== "win32") await chmod(path.join(stagingRoot, "bin", executable), 0o755);

console.info(`[electron] prepared ${platform} resources in ${stagingRoot}`);
