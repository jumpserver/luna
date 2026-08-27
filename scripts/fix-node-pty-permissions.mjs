import { chmod } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

if (process.platform !== "win32") {
  const require = createRequire(new URL("../electron/package.json", import.meta.url));
  const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
  const helper = path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");

  try {
    await chmod(helper, 0o755);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
