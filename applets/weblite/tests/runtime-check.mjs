import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright";

const applet = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] || "basic";
const recording = mode === "recording";
const standalone = mode === "standalone";
const requests = [];
let frames = 0;
let recordingStarts = 0;
const server = createServer((req, res) => {
  requests.push(req.url);
  const route = new URL(req.url, "http://localhost").pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (route.startsWith("/_jumpserver/web-sessions"))
    return json(
      {
        session_id: "11111111-1111-4111-8111-111111111111",
        target_url: target,
        origin: new URL(target).origin,
        autofill: "none",
        autofill_available: false
      },
      201
    );
  if (route === "/_jumpserver/web-recordings") {
    recordingStarts++;
    return json({ id: "recording" }, 201);
  }
  if (route.endsWith("/frames")) return json({ frame_count: ++frames });
  if (route.endsWith("/finish")) return json({ frame_count: frames });
  if (recording) assert.equal(recordingStarts, 1, "target loaded before required recording started");
  res.setHeader("content-type", "text/html");
  if (standalone) return res.end("<!doctype html><html><body><h1>Standalone browsing works</h1></body></html>");
  res.end(`<!doctype html><html><body>
    <form id="login"><input id="username"><input id="password" type="password"><button id="submit">Login</button></form>
    <h1 id="dashboard" style="display:${recording ? "block" : "none"}">Signed in</h1>
    <script>document.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (document.querySelector('#username').value === 'tester' && document.querySelector('#password').value === 'runtime-secret') {
        document.querySelector('form').remove();document.querySelector('#dashboard').style.display = 'block';
      }
    };</script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const target = `http://127.0.0.1:${server.address().port}/${standalone ? "standalone" : "login"}`;
const child = spawn(electron, ["--remote-debugging-port=0", applet], {
  stdio: [standalone ? "ignore" : "pipe", "pipe", "pipe"]
});
let stderr = "";
child.stdout.on("data", (chunk) => {
  stderr += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
if (!standalone)
  child.stdin.end(
    JSON.stringify({
      target_url: target,
      safe_mode: true,
      recording_enabled: recording,
      ...(recording
        ? { proxy_url: new URL(target).origin, token_id: "test-token", token_value: "test-token-value" }
        : {}),
      login: {
        config:
          mode === "script"
            ? {
                autofill: "script",
                script: [
                  { step: 1, command: "type", target: "id=username", value: "{USERNAME}" },
                  { step: 2, command: "type", target: "id=password", value: "{SECRET}" },
                  { step: 3, command: "interactive", target: "css=div.captcha-field" },
                  { step: 4, command: "click", target: "id=submit" },
                  { step: 5, command: "success", target: "id=dashboard" }
                ]
              }
            : {
                autofill: "basic",
                username_selector: "id=username",
                password_selector: "id=password",
                submit_selector: "id=submit",
                success_selector: "id=dashboard"
              },
        username: "tester",
        password: "runtime-secret",
        secret_type: "password"
      }
    })
  );
let browser;
async function waitFor(check, message) {
  for (let n = 0; n < 150; n++) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`${message}\n${stderr}`);
}
try {
  const endpoint = await waitFor(
    () => stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1],
    "Electron debugging endpoint unavailable"
  );
  browser = await chromium.connectOverCDP(endpoint);
  const pages = () => browser.contexts().flatMap((context) => context.pages());
  const shell = await waitFor(() => pages().find((page) => page.url().startsWith("file:")), "Applet shell not loaded");
  if (standalone) {
    const address = shell.getByRole("textbox", { name: "地址栏" });
    await address.fill(target);
    await address.press("Enter");
  }
  const page = await waitFor(() => pages().find((page) => page.url() === target), "Direct target never loaded");
  if (standalone) await page.getByRole("heading", { name: "Standalone browsing works" }).waitFor();
  else {
    await page.locator("#dashboard").waitFor({ state: "visible", timeout: 15_000 });
    await shell
      .getByRole("button", { name: recording ? /会话状态：.*未配置代填/ : /会话状态：.*登录成功/ })
      .waitFor({ state: "visible" });
  }
  const bootstrap = await shell.evaluate(() => window.webApplet.invoke("bootstrap"));
  assert.equal(bootstrap.proxyUrl, recording ? new URL(target).origin : "");
  assert.equal(bootstrap.recordingEnabled, recording);
  assert.equal(bootstrap.standalone, standalone);
  assert.ok(!JSON.stringify(bootstrap).includes("runtime-secret"));
  assert.equal(await page.evaluate(() => typeof window.webApplet), "undefined");
  if (recording) {
    await waitFor(() => frames > 0, "Web recording did not capture frames");
    assert.equal(recordingStarts, 1, "UI and main process started duplicate recordings");
  } else assert.ok(requests.every((path) => !path.includes("_jumpserver")));
  await shell.screenshot({
    path: fileURLToPath(new URL(`../../../release/applets/${mode}-runtime.png`, import.meta.url))
  });
  // Close the native app through its shell. Windows/macOS then run normal cleanup.
  await shell.evaluate(() => window.close());
  await waitFor(() => child.exitCode !== null, "Applet did not exit after its window closed");
  assert.equal(child.exitCode, 0);
  console.info(`Standalone applet ${mode}: login/recording policy, IPC isolation and clean exit passed.`);
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
