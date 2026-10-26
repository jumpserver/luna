// Exercises the actual generated /luna/chen/ route served by a real chen-go single process.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = JSON.parse(
  await readFile(process.env.CHEN_SINGLE_BROWSER_FIXTURE_FILE || "/tmp/chen-single-browser-fixture.json", "utf8")
);
const base = new URL(process.env.CHEN_SINGLE_BASE_URL || "http://127.0.0.1:3030");
assert.equal(base.hostname, "127.0.0.1", "Use an isolated localhost single-mode CLI");
const dialect = fixture.protocol || fixture.dialect;
assert.ok(["mysql", "postgresql"].includes(dialect));
const selector = fixture.selector;
assert.equal(typeof selector, "string");
const output = `${root}output/chen-single-browser/${dialect}`;
await mkdir(output, { recursive: true });
const direct = new URL("/luna/chen/", base);
direct.searchParams.set("selector", selector);
const entry = new URL("/", base);
entry.searchParams.set("selector", selector);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const coreRequests = [];
const sockets = [];
const api = [];
const creations = [];
const pages = [];
const summary = {
  database: dialect,
  route: direct.pathname,
  backend: "real chen-go single CLI + YAML + real ordinary-account database, no Core/Wisp",
  checks: []
};

async function open(url) {
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => sockets.push(socket.url()));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/core/") || path.startsWith("/api/v1/") || path.includes("/wisp/")) coreRequests.push(path);
  });
  page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith("/chen/api/v1/")) return;
    const call = { path, method: response.request().method(), status: response.status() };
    api.push(call);
    try {
      if (path.endsWith("/sessions") && response.request().method() === "POST" && response.ok()) {
        const body = await response.json();
        const request = response.request().postDataJSON();
        assert.deepEqual(Object.keys(request).sort(), ["request_id", "selector"]);
        creations.push({ id: body.session.id, requestId: request.request_id, dialect: body.session.dialect });
      } else if (path.includes("/executions") || path.endsWith("/cancel") || path.endsWith("/capabilities"))
        call.body = await response.json();
    } catch (error) {
      errors.push(error.message);
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('[data-chen-session-state="ready"]').waitFor({ timeout: 30_000 });
  await page.locator("[data-chen-query]:visible .monaco-editor").waitFor({ timeout: 30_000 });
  return page;
}

let page;
try {
  page = await open(entry.toString());
  assert.equal(new URL(page.url()).pathname, direct.pathname);
  assert.equal(new URL(page.url()).searchParams.get("selector"), selector);
  summary.checks.push("real CLI root redirect preserves selector; direct cold URL discovers dialect");
  const editor = page.locator("[data-chen-query]:visible .monaco-editor");
  async function document(sql) {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(sql);
  }
  await document("SELECT * FROM chen_browser_items AS t WHERE t.");
  await page.keyboard.press("Control+Space");
  await page.getByRole("option", { name: /name/ }).first().waitFor({ timeout: 15_000 });
  await page.screenshot({ path: `${output}/completion.png`, fullPage: true });
  await page.keyboard.press("Escape");
  summary.checks.push("Monaco alias and column completion from the actual selected database");
  await document("SELECT id, name, note FROM chen_browser_items");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByText("9007199254740993", { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByText("数据库工作台", { exact: true }).waitFor();
  await page.getByText("NULL", { exact: true }).waitFor();
  await page.getByText(/已本地记录|Recorded locally/).waitFor();
  await page.screenshot({ path: `${output}/query.png`, fullPage: true });
  summary.checks.push("query, exact BIGINT, Unicode, NULL and local audit status");
  const second = await open(direct.toString());
  assert.equal(creations.length, 2);
  assert.notEqual(creations[0].id, creations[1].id);
  assert.notEqual(creations[0].requestId, creations[1].requestId);
  assert.ok(creations.every((creation) => creation.dialect === dialect));
  await second.getByRole("button", { name: /关闭连接|Close connection/ }).click();
  await second
    .getByRole("dialog")
    .getByRole("button", { name: /确认关闭|Confirm close/ })
    .click();
  await second.locator('[data-chen-session-state="closed"]').waitFor();
  await second.close();
  summary.checks.push("same selector in two tabs creates independent sessions; closing one preserves the other");
  await document(
    dialect === "mysql"
      ? "SELECT /* single_cancel */ SLEEP(30), 1 UNION ALL SELECT 0, 2"
      : "SELECT /* single_cancel */ pg_sleep(30)"
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.locator('[data-chen-execution-state="running"]').waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /^(取消|Cancel)$/ }).click();
  await page.locator('[data-chen-execution-state="canceled"]').waitFor({ timeout: 15_000 });
  summary.checks.push("server-confirmed SQL cancellation through HTTP and SSE");
  await page.getByRole("button", { name: /关闭连接|Close connection/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /确认关闭|Confirm close/ })
    .click();
  await page.locator('[data-chen-session-state="closed"]').waitFor();
  summary.checks.push("explicit close disables further submission");
  assert.deepEqual(coreRequests, [], "Standalone must not bootstrap Core or Wisp");
  assert.deepEqual(sockets, [], "Production standalone does not open WebSockets");
  assert.deepEqual(errors, []);
  assert.ok(api.some((call) => call.path.endsWith("/capabilities") && call.body?.mode === "single"));
  summary.checks.push("zero Core/Wisp requests, zero WebSockets, zero unhandled browser errors");
  summary.passed = true;
} catch (error) {
  summary.passed = false;
  summary.error = error.message;
  if (page) {
    summary.ui_text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  summary.api = api;
  summary.core_requests = coreRequests;
  summary.websockets = sockets;
  summary.browser_errors = errors;
  await writeFile(`${output}/report.json`, JSON.stringify(summary, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({ passed: summary.passed, checks: summary.checks, report: `${output}/report.json` }, null, 2)
  );
}
