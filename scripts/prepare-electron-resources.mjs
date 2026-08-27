import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(projectRoot, ".electron-resources");
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
await rm(stagingRoot, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(stagingRoot, "plugins"), { recursive: true }),
  mkdir(path.join(stagingRoot, "icons"), { recursive: true })
]);
await Promise.all([
  cp(path.join(projectRoot, "plugins", platform), path.join(stagingRoot, "plugins", platform), { recursive: true }),
  cp(path.join(projectRoot, "electron", "assets", "icons", "icon.png"), path.join(stagingRoot, "icons", "icon.png")),
  cp(path.join(projectRoot, "electron", "assets", "icons", "icon.ico"), path.join(stagingRoot, "icons", "icon.ico")),
  cp(path.join(projectRoot, "electron", "assets", "icons", "32x32.png"), path.join(stagingRoot, "icons", "32x32.png")),
  cp(
    path.join(projectRoot, "electron", "assets", "icons", "tray-mac.png"),
    path.join(stagingRoot, "icons", "tray-mac.png")
  )
]);

console.info(`[electron] prepared ${platform}/${process.arch} resources in ${stagingRoot}`);
