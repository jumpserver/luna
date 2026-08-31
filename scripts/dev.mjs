import { spawn } from "node:child_process";

const rendererPort = process.env.JMS_WEB_DEV_PORT || "3000";
const rendererUrl = `http://localhost:${rendererPort}/luna/`;
const children = new Set();
let stopping = false;

function run(script, args = [], env = process.env) {
  const child = spawn("pnpm", [script, ...args], {
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", (code) => {
    children.delete(child);
    stop(code || 0);
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

run("web:dev", ["--port", rendererPort]);
run("electron:dev", [], {
  ...process.env,
  JMS_ELECTRON_RENDERER_URL: rendererUrl
});
