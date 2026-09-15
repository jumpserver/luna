import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(projectRoot, ".electron-resources");
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
await rm(stagingRoot, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(stagingRoot, "dist"), { recursive: true }),
  mkdir(path.join(stagingRoot, "plugins"), { recursive: true }),
  mkdir(path.join(stagingRoot, "icons"), { recursive: true })
]);
await Promise.all([
  cp(path.join(projectRoot, ".output", "public"), path.join(stagingRoot, "dist"), { recursive: true }),
  cp(path.join(projectRoot, "plugins", platform), path.join(stagingRoot, "plugins", platform), { recursive: true }),
  cp(path.join(projectRoot, "electron", "assets", "icons", "icon.png"), path.join(stagingRoot, "icons", "icon.png")),
  cp(path.join(projectRoot, "electron", "assets", "icons", "icon-mac.png"), path.join(stagingRoot, "icons", "icon-mac.png")),
  cp(path.join(projectRoot, "electron", "assets", "icons", "icon.ico"), path.join(stagingRoot, "icons", "icon.ico")),
  cp(path.join(projectRoot, "electron", "assets", "icons", "32x32.png"), path.join(stagingRoot, "icons", "32x32.png")),
  cp(
    path.join(projectRoot, "electron", "assets", "icons", "tray-mac.png"),
    path.join(stagingRoot, "icons", "tray-mac.png")
  )
]);

const configuredFaceBundle = String(process.env.JMS_FACE_ENGINE_BUNDLE || "").trim();
const defaultFaceBundle = path.join(
  projectRoot,
  "electron",
  "face-engine",
  "dist",
  process.platform === "win32" ? "facelive-worker.exe" : "facelive-worker"
);
const packagedFaceExecutable = process.platform === "win32" ? "facelive-worker.exe" : "facelive-worker";
const faceBundle = path.resolve(configuredFaceBundle || defaultFaceBundle);
try {
  await access(faceBundle);
  const faceResourceDir = path.join(stagingRoot, "face-engine");
  await mkdir(faceResourceDir, { recursive: true });
  await cp(faceBundle, path.join(faceResourceDir, packagedFaceExecutable));

  const configuredModels = String(process.env.JMS_FACE_MODEL_BUNDLE || "").trim();
  if (configuredModels) {
    await cp(path.resolve(configuredModels), path.join(faceResourceDir, "model-root"), { recursive: true });
  }
  console.info(`[electron] included face engine bundle ${faceBundle}`);
} catch {
  console.info("[electron] face engine bundle is not present; packaged face features will remain unavailable");
}

console.info(`[electron] prepared ${platform}/${process.arch} resources in ${stagingRoot}`);
