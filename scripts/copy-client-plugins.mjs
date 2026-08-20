import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const sourceRoot = resolve("plugins");
const destinationRoot = resolve("src-tauri/resources/plugins");

await mkdir(destinationRoot, { recursive: true });
for (const platform of ["windows", "macos", "linux"]) {
  const destination = resolve(destinationRoot, platform);
  await rm(destination, { recursive: true, force: true });
  await cp(resolve(sourceRoot, platform), destination, { recursive: true });
}
