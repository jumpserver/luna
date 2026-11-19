import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
export default async function (context) {
  if (context.command) throw new Error("RESP does not accept terminal commands");
  await mkdir(context.config_dir, { recursive: true });
  const directory = await mkdtemp(path.join(context.config_dir, "resp-"));
  await mkdir(path.join(directory, ".rdm"), { mode: 0o700 });
  await writeFile(
    path.join(directory, ".rdm/connections.json"),
    JSON.stringify([
      {
        name: context.name,
        host: context.host,
        port: Number(context.port),
        auth: `${context.username}@${context.value}`,
        timeout_connect: 60000,
        timeout_execute: 60000
      }
    ]),
    { mode: 0o600 }
  );
  return { type: "args", args: ["--settings-dir", directory] };
}
