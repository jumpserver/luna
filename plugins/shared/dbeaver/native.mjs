import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

// A separate workspace per custom driver leaves the user's drivers and connections untouched.
// Only a driver definition is persisted; connection credentials remain in the launch plan.
export async function prepareDriverWorkspace(configDir, kind) {
  if (!configDir) throw new Error("Missing client configuration directory");
  const definitionFile = { "clickhouse-native": "drivers-clickhouse.xml", "oceanbase-oracle": "drivers-oceanbase-oracle.xml" }[kind];
  if (typeof definitionFile !== "string") throw new Error("Unknown DBeaver workspace driver");
  const workspace = path.join(configDir, `dbeaver-${kind}`);
  const directory = path.join(workspace, ".metadata", ".config");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "drivers.xml");
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const definition = await readFile(new URL(definitionFile, import.meta.url));
    await writeFile(temporary, definition, { flag: "wx", mode: 0o600 });
    try {
      // Publish atomically; never replace a running workspace's driver definition.
      await link(temporary, target);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return workspace;
}
