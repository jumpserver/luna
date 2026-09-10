import { chmod } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

if (process.platform !== "win32") {
  const require = createRequire(new URL("../electron/package.json", import.meta.url));
  const forgeRoot = path.dirname(require.resolve("@electron-forge/cli/package.json"));
  // Some installs leave the CLI symlink pointing at a non-executable script.
  await chmod(path.join(forgeRoot, "dist", "electron-forge.js"), 0o755);

  const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
  const helper = path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");

  try {
    await chmod(helper, 0o755);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
