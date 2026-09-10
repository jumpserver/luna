import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const children = new Set();
let stopping = false;

function findAvailablePort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (preferredPort && error.code === "EADDRINUSE") {
        resolve(findAvailablePort());
        return;
      }
      reject(error);
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function portFromRendererUrl(value) {
  try {
    return Number(new URL(value).port || 3000);
  } catch (cause) {
    throw new Error(`Invalid JMS_ELECTRON_RENDERER_URL: ${value}`, { cause });
  }
}

const sharedWeb = process.argv.includes("--web");
const requestedRendererUrl = process.env.JMS_ELECTRON_RENDERER_URL;
const rendererHost = "127.0.0.1";
const rendererPort = requestedRendererUrl
  ? portFromRendererUrl(requestedRendererUrl)
  : await findAvailablePort(sharedWeb ? 3000 : 0);
const hmrPort = process.env.JMS_ELECTRON_HMR_PORT || String(await findAvailablePort());
const rendererUrl = requestedRendererUrl || `http://${rendererHost}:${rendererPort}/luna/`;

const repoRoot = process.cwd();
const nuxtCli = path.join(repoRoot, "node_modules/nuxt/bin/nuxt.mjs");
const forgeStart = path.join(repoRoot, "node_modules/@electron-forge/cli/dist/electron-forge-start.js");

function run(command, args, env = process.env, cwd = repoRoot) {
  const child = spawn(command, args, {
    cwd,
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
    } catch {
      // Nuxt is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nuxt renderer did not become ready at ${rendererUrl}`);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 250);
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

if (!requestedRendererUrl) {
  // ponytail: --no-fork skips Nuxt's 2 pre-warm restart workers (~90MB); drop the flag if config-change restarts feel slow.
  const nuxt = run(
    process.execPath,
    [
      nuxtCli,
      "dev",
      "--dotenv",
      ".env.development",
      "--host",
      rendererHost,
      "--port",
      String(rendererPort),
      "--no-fork"
    ],
    {
      ...process.env,
      JMS_HMR_PORT: hmrPort,
      JMS_DEV_LIGHT: "1"
    }
  );
  nuxt.once("exit", (code) => stop(code || 0));
}

try {
  await waitForRenderer();
  const electron = run(
    process.execPath,
    [forgeStart],
    {
      ...process.env,
      JMS_ELECTRON_DEV: "1",
      JMS_ELECTRON_RENDERER_URL: rendererUrl
    },
    path.join(repoRoot, "electron")
  );
  electron.once("exit", (code) => stop(code || 0));
} catch (error) {
  console.error(error);
  stop(1);
}
