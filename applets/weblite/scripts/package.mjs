import packager from "@electron/packager";
import { MSICreator } from "electron-wix-msi";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("WebLite MSI packaging must run on Windows");
await import("./build.mjs");

const root = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(root, "../..");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const work = await mkdtemp(path.join(os.tmpdir(), "weblite-package-"));
const source = path.join(work, "source");
const packageOut = path.join(work, "package");
const installerOut = path.join(work, "installer");
const releaseOut = path.join(repo, "release/weblite");

try {
  await mkdir(source, { recursive: true });
  await cp(path.join(root, "dist"), path.join(source, "dist"), { recursive: true });
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({
      name: "weblite",
      productName: manifest.productName,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      main: "dist/main.cjs"
    })
  );

  const [appDir] = await packager({
    dir: source,
    out: packageOut,
    name: "weblite",
    platform: "win32",
    arch: "x64",
    electronVersion: manifest.devDependencies.electron,
    asar: true,
    prune: false,
    overwrite: true,
    executableName: "weblite",
    icon: path.join(root, "assets/icon.ico")
  });

  await mkdir(installerOut, { recursive: true });
  const creator = new MSICreator({
    appDirectory: appDir,
    outputDirectory: installerOut,
    name: manifest.productName,
    description: manifest.description,
    manufacturer: manifest.author,
    version: manifest.version,
    exe: "weblite.exe",
    shortName: "WebLite",
    shortcutFolderName: "JumpServer",
    appUserModelId: "com.jumpserver.weblite",
    arch: "x64",
    defaultInstallMode: "perMachine",
    // Keep this stable so Windows Installer upgrades the existing deployment.
    upgradeCode: "BBB88A37-4470-4B1C-B582-EAE84A775985"
  });
  await creator.create();
  const { msiFile } = await creator.compile();
  const installer = path.join(releaseOut, `JumpServer-WebLite-${manifest.version}-x64.msi`);
  await mkdir(releaseOut, { recursive: true });
  await copyFile(msiFile, installer);
  console.info(`WebLite installer: ${installer}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
