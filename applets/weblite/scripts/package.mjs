import packager from "@electron/packager";
import { Zip, ZipDeflate } from "fflate";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(root, "../..");
const platform = process.env.APPLET_PLATFORM || "win32";
const arch = process.env.APPLET_ARCH || "x64";
if (!["win32", "darwin", "linux"].includes(platform) || !["x64", "arm64"].includes(arch))
  throw new Error("Invalid applet platform/architecture");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const stage = await mkdtemp(path.join(os.tmpdir(), "weblite-package-"));
const out = path.join(repo, "release/applets");
try {
  await cp(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });
  await writeFile(
    path.join(stage, "package.json"),
    JSON.stringify({
      name: "weblite",
      productName: manifest.productName,
      version: manifest.version,
      main: "dist/main.cjs"
    })
  );
  const [appDir] = await packager({
    dir: stage,
    out,
    name: "weblite",
    platform,
    arch,
    electronVersion: "44.0.0",
    asar: true,
    prune: false,
    overwrite: true,
    executableName: "weblite",
    icon: path.join(repo, "electron/assets/icons/icon.ico")
  });
  if (platform !== "win32") {
    console.info(`Local validation app: ${appDir}`);
  } else {
    const archive = path.join(out, `weblite-${manifest.version}-${platform}-${arch}.zip`);
    const output = createWriteStream(archive);
    const closed = once(output, "close");
    const zip = new Zip((error, data, final) => {
      if (error) output.destroy(error);
      else {
        output.write(data);
        if (final) output.end();
      }
    });
    async function add(name, source) {
      const entry = new ZipDeflate(name, { level: 1 });
      zip.add(entry);
      for await (const chunk of createReadStream(source)) {
        entry.push(chunk);
        if (output.writableNeedDrain) await once(output, "drain");
      }
      entry.push(new Uint8Array(), true);
    }
    async function directory(source, prefix) {
      for (const item of await readdir(source, { withFileTypes: true })) {
        const file = path.join(source, item.name);
        const name = `${prefix}/${item.name}`;
        if (item.isDirectory()) await directory(file, name);
        else if (item.isFile()) await add(name, file);
      }
    }
    await directory(appDir, "bin");
    await writeFile(
      path.join(stage, "manifest.yml"),
      (await readFile(path.join(root, "manifest.yml"), "utf8")).replace(/^version:.*$/m, `version: ${manifest.version}`)
    );
    await writeFile(path.join(stage, "setup.yml"), "type: manual\n");
    await add("manifest.yml", path.join(stage, "manifest.yml"));
    await add("setup.yml", path.join(stage, "setup.yml"));
    await add("icon.png", path.join(repo, "electron/assets/icons/icon.png"));
    zip.end();
    await closed;
    console.info(`Applet package: ${archive}`);
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
