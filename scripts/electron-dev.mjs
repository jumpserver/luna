import { spawn } from "node:child_process";
import { createServer } from "node:net";

const children = new Set();
let stopping = false;

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const requestedRendererUrl = process.env.JMS_ELECTRON_RENDERER_URL;
const rendererPort = requestedRendererUrl
  ? Number(new URL(requestedRendererUrl).port || 3000)
  : await findAvailablePort();
const hmrPort = process.env.JMS_ELECTRON_HMR_PORT || String(await findAvailablePort());
const rendererUrl = requestedRendererUrl || `http://localhost:${rendererPort}/luna/`;

function run(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function waitForRenderer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nuxt renderer did not become ready at ${rendererUrl}`);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

const nuxt = run("pnpm", ["dev", "--port", String(rendererPort)], {
  ...process.env,
  JMS_HMR_PORT: hmrPort
});
nuxt.once("exit", (code) => stop(code || 0));

try {
  await waitForRenderer();
  const electron = run("pnpm", ["exec", "electron", "."], {
    ...process.env,
    JMS_ELECTRON_RENDERER_URL: rendererUrl
  });
  electron.once("exit", (code) => stop(code || 0));
} catch (error) {
  console.error(error);
  stop(1);
}
