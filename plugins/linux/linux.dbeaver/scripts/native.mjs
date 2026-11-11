import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";

// A separate workspace leaves the user's HTTP driver and existing connections untouched.
// Only a driver definition is persisted; connection credentials remain in the launch plan.
export async function prepareClickHouseWorkspace(configDir) {
  if (!configDir) throw new Error("Missing client configuration directory");
  const workspace = path.join(configDir, "dbeaver-clickhouse-native");
  const directory = path.join(workspace, ".metadata", ".config");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "drivers.xml");
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const definition = await readFile(new URL("../drivers-clickhouse.xml", import.meta.url));
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
