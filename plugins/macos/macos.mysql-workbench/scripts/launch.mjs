import { connectionFor, run } from "../../../shared/macos-db/launch.mjs";

export function prepareConnection(input) {
  if (input.protocol !== "mysql") throw new Error("Unsupported Workbench protocol");
  return connectionFor(input);
}

if (import.meta.main) process.exitCode = await run(import.meta.url, prepareConnection);
