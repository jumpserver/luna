import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";

const productName = "JumpServer";

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
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = run(command, args);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal || code}`));
    });
  });
}

async function prepareMacDevApp() {
  const require = createRequire(path.join(process.cwd(), "electron/package.json"));
  const electronExecutable = require("electron");
  const sourceApp = path.dirname(path.dirname(path.dirname(electronExecutable)));
  const iconPath = path.join(process.cwd(), "electron/assets/icons/icon.icns");
  const cacheDirectory = path.join(process.cwd(), "node_modules/.cache/jumpserver-electron");
  const cachedApp = path.join(cacheDirectory, `${productName}.app`);
  const cachedExecutable = path.join(cachedApp, `Contents/MacOS/${productName}`);
  const markerPath = path.join(cacheDirectory, "source");
  const marker = `2\n${electronExecutable}\n${(await stat(iconPath)).mtimeMs}\n`;

  try {
    if ((await readFile(markerPath, "utf8")) === marker) {
      return cachedExecutable;
    }
  } catch {}

  await mkdir(cacheDirectory, { recursive: true });
  await rm(cachedApp, { recursive: true, force: true });
  await runAndWait("/bin/cp", ["-cR", sourceApp, cachedApp]);

  const plistPath = path.join(cachedApp, "Contents/Info.plist");
  for (const [key, value] of [
    ["CFBundleDisplayName", productName],
    ["CFBundleName", productName],
    ["CFBundleIdentifier", "com.jumpserver.client.dev"],
    ["CFBundleExecutable", productName],
    ["CFBundleIconFile", "icon.icns"]
  ]) {
    await runAndWait("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath]);
  }
  await rename(path.join(cachedApp, "Contents/MacOS/Electron"), cachedExecutable);
  await copyFile(iconPath, path.join(cachedApp, "Contents/Resources/icon.icns"));
  await runAndWait("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", cachedApp]);
  await writeFile(markerPath, marker);
  return cachedExecutable;
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

const nuxt = run("pnpm", ["web:dev", "--port", String(rendererPort)], {
  ...process.env,
  JMS_HMR_PORT: hmrPort
});
nuxt.once("exit", (code) => stop(code || 0));

try {
  await waitForRenderer();
  const electronCommand = process.platform === "darwin" ? await prepareMacDevApp() : "pnpm";
  const electronArgs = process.platform === "darwin" ? ["."] : ["--dir", "electron", "exec", "electron", "."];
  const electron = run(electronCommand, electronArgs, {
    ...process.env,
    JMS_ELECTRON_DEV: "1",
    JMS_ELECTRON_RENDERER_URL: rendererUrl
  });
  electron.once("exit", (code) => stop(code || 0));
} catch (error) {
  console.error(error);
  stop(1);
}
