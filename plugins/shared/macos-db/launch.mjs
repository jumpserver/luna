import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, readFile, realpath } from "node:fs/promises";
import { isIP } from "node:net";
import { isAbsolute, join } from "node:path";

export function connectionFor(input) {
  const { username, value, dbname, host, port } = input;
  const number = Number(port);
  const address = typeof host === "string" ? host.replace(/^\[([^\]]+)\]$/, "$1") : "";
  if (
    !/^\d+$/.test(String(port)) ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 65535 ||
    !(isIP(address) || /^[a-z\d](?:[a-z\d.-]*[a-z\d.])?$/i.test(address)) ||
    ![username, value, dbname].every((field) => typeof field === "string" && !/[\0\r\n]/.test(field)) ||
    !username ||
    !value
  )
    throw new Error("Invalid database connection");

  return {
    host: address,
    port: String(number),
    username,
    password: value,
    database: dbname,
    name:
      String(input.source_name || "")
        .replace(/[\r\n\0]/g, " ")
        .trim()
        .slice(0, 100) || "Database"
  };
}

export async function run(entryUrl, prepareConnection) {
  let context;
  let lockPath;
  try {
    process.stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const data = JSON.parse(input);
    const executable = await realpath(data.executable);
    const match = executable.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/);
    if (process.platform !== "darwin" || !match || !isAbsolute(data.config_dir)) return 3;
    const connection = prepareConnection(data);
    if (!connection) return 6;
    context = { ...connection, bundle: match[1] };
    lockPath = join(data.config_dir, "macos-db-autofill.lock");
  } catch {
    return 3;
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.JMS_CONNECT_JSON;
  // Script sources are static. Pass connection data to osascript over stdin.
  const [bootstrap, script] = await Promise.all([
    readFile(new URL("./autofill.js", import.meta.url), "utf8"),
    readFile(new URL("./autofill.js", entryUrl), "utf8")
  ]);
  const lock = await open(lockPath, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600).catch(
    () => undefined
  );
  if (!lock) return 1;
  try {
    return await new Promise((resolve) => {
      const child = spawn("/usr/bin/osascript", ["-l", "JavaScript", "-e", bootstrap, "-e", script], {
        env,
        stdio: ["pipe", "pipe", "ignore", lock.fd],
        timeout: 110_000
      });
      let result = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        result += chunk;
      });
      child.once("error", () => resolve(1));
      child.stdin.on("error", () => {});
      child.once("close", (code) => {
        const status = result.trim();
        resolve(code === 0 && /^[0-7]$/.test(status) ? Number(status) : 1);
      });
      child.stdin.end(JSON.stringify(context));
    });
  } finally {
    await lock.close();
  }
}
