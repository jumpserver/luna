// Actual Nuxt/Monaco UI against an isolated synthetic HTTP/SSE boundary.
// This validates client state transitions, not Core policy or database execution.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}output/chen-v1-controls`;
await mkdir(output, { recursive: true });
const session = {
  id: "controls-session",
  dialect: "postgresql",
  asset: "Synthetic controls fixture",
  account: "fixture",
  state: "ready",
  can_cancel: false,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  permissions: { can_copy: true, can_paste: true, can_upload: false, can_download: false }
};
const consoleView = { id: "console-one", database: "fixture", schema: "public", state: "ready" };
const executions = new Map();
const requests = [];
const streams = new Set();
let sequence = 0;
let lostReviewResponse = true;
let current;
let deferredResponse;
let delayedConsoleResponse;
let consoleCount = 0;
let holdExecutionReads = false;
const delayedReads = [];
const consoleDeletes = [];
function publish(type, data) {
  const frame = `data: ${JSON.stringify({ sequence: ++sequence, type, data })}\n\n`;
  for (const stream of streams) stream.write(frame);
}
function updateExecution(status, reviewState) {
  current = {
    ...current,
    status,
    review: { ...current.review, state: reviewState },
    audit_status: ["succeeded", "failed", "canceled"].includes(status) ? "recorded" : "pending"
  };
  executions.set(current.id, current);
  publish("execution.updated", current);
}
const backend = createServer(async (req, res) => {
  const path = new URL(req.url, "http://fixture").pathname;
  const respond = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(status === 204 ? undefined : JSON.stringify(value));
  };
  if (path.endsWith("/events")) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(": connected\n\n");
    streams.add(res);
    req.on("close", () => streams.delete(res));
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = body ? JSON.parse(body) : {};
  if (path.endsWith("/capabilities")) return respond({ mode: "single" });
  if (path.endsWith("/sessions") && req.method === "POST")
    return respond({ token: "synthetic-fixture-token", session });
  if (path.endsWith(`/sessions/${session.id}`)) {
    if (req.method === "DELETE") {
      session.state = "closed";
      return respond(null, 204);
    }
    return respond(session);
  }
  if (path.endsWith("/consoles")) {
    consoleCount++;
    if (consoleCount === 2) {
      delayedConsoleResponse = () => respond({ ...consoleView, id: "console-late" });
      return;
    }
    return respond(consoleView);
  }
  if (path.includes("/catalog/schemas")) return respond({ items: [{ name: "public" }], has_more: false });
  if (path.includes("/catalog/")) return respond({ items: [], has_more: false });
  if (path.endsWith("/analysis"))
    return respond({
      document_version: input.document_version,
      statements: [{ from: 0, to: input.document.length, kind: "select" }]
    });
  if (path.endsWith("/completion"))
    return respond({
      document_version: input.document_version,
      from: input.position_utf16,
      to: input.position_utf16,
      items: []
    });
  if (path.endsWith("/executions") && req.method === "POST") {
    requests.push(input);
    if (input.sql.includes("late_response")) {
      current = {
        id: "late-execution",
        console_id: consoleView.id,
        status: "running",
        result_ids: [],
        statement_results: [],
        audit_status: "pending"
      };
      deferredResponse = () => respond(current);
      return;
    }
    const existing = [...executions.values()].find((item) => item.requestId === input.request_id);
    if (existing) return respond(existing);
    if (input.sql.includes("warning_value") && !input.confirm_warnings) {
      current = {
        id: `execution-${executions.size + 1}`,
        console_id: consoleView.id,
        requestId: input.request_id,
        status: "failed",
        result_ids: [],
        statement_results: [],
        audit_status: "recorded",
        error: { code: "command_warning_confirmation_required", message: "Confirm warning" }
      };
      executions.set(current.id, current);
      return respond(current);
    }
    current = {
      id: `execution-${executions.size + 1}`,
      console_id: consoleView.id,
      requestId: input.request_id,
      status: input.submit_review ? "waiting_review" : "failed",
      result_ids: [],
      statement_results: [],
      audit_status: input.submit_review ? "pending" : "recorded",
      ...(input.submit_review
        ? { review: { state: "pending", reviewers: ["Fixture reviewer"], ticket_url: "/tickets/fixture" } }
        : { error: { code: "command_review_required", message: "Command requires review" } })
    };
    executions.set(current.id, current);
    if (input.submit_review && lostReviewResponse) {
      lostReviewResponse = false;
      return respond({ error: { code: "fixture_response_lost", message: "Synthetic lost response" } }, 503);
    }
    return respond(current);
  }
  if (path.endsWith("/cancel")) {
    updateExecution("canceled", "canceled");
    return respond(current);
  }
  if (req.method === "DELETE" && path.includes("/consoles/")) consoleDeletes.push(path);
  const execution = executions.get(path.split("/").at(-1));
  if (execution) {
    if (holdExecutionReads) {
      delayedReads.push(() => respond(execution));
      return;
    }
    return respond(execution);
  }
  return respond({ error: { code: "fixture_route_missing", message: path } }, 404);
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const backendUrl = `http://127.0.0.1:${backend.address().port}`;
const port = 3021;
const child = spawn(
  process.execPath,
  [`${root}node_modules/nuxt/bin/nuxt.mjs`, "dev", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: root,
    env: { ...process.env, JMS_DEV_LIGHT: "1", JMS_CHEN_DEV_URL: backendUrl, JMS_CHEN_GO_DEV_URL: backendUrl },
    stdio: ["ignore", "pipe", "pipe"]
  }
);
let log = "";
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
let browser;
let page;
const errors = [];
const checks = [];
try {
  const url = `http://127.0.0.1:${port}/luna/chen/?selector=controls-fixture`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Dev startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Nuxt did not start");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('[data-chen-session-state="ready"]').waitFor({ timeout: 60_000 });
  const editor = page.locator("[data-chen-query]:visible .monaco-editor");
  await editor.waitFor();
  async function document(sql) {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(sql);
  }
  async function run() {
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.locator('[data-chen-execution-state="failed"]').waitFor();
  }
  const requestReview = page.getByRole("button", { name: /^(申请复核|Request review)$/ });
  const cancelReview = page.getByRole("button", { name: /^(取消复核|Cancel review)$/ });
  const original = "SELECT 42 AS protected_value";
  await document(original);
  await run();
  await document("SELECT 99 AS changed_draft");
  await requestReview.click();
  await page.getByRole("button", { name: /恢复提交|Recover submission/ }).click();
  await page.locator('[data-chen-execution-state="waiting_review"]').waitFor();
  assert.equal(requests[1].sql, original);
  assert.equal(requests[1].document_version, requests[0].document_version);
  assert.equal(requests[1].submit_review, true);
  assert.notEqual(requests[1].request_id, requests[0].request_id);
  assert.deepEqual(requests[2], requests[1]);
  assert.equal(await cancelReview.isEnabled(), true);
  checks.push(
    "explicit review uses immutable SQL/version and stable retry ID; pending ticket cancellation is available with can_cancel:false"
  );
  await cancelReview.click();
  await page.locator('[data-chen-execution-state="canceled"]').waitFor();
  await page.getByText(/复核已取消|Review canceled/).waitFor();
  checks.push("pending review cancellation is confirmed by HTTP/SSE");
  await document(original);
  await run();
  await requestReview.click();
  await page.locator('[data-chen-execution-state="waiting_review"]').waitFor();
  updateExecution("failed", "rejected");
  await page.getByText(/复核已拒绝|Review rejected/).waitFor();
  assert.equal(await requestReview.count(), 0);
  checks.push("rejected review does not silently execute or resubmit");
  await document(original);
  await run();
  await requestReview.click();
  await page.locator('[data-chen-execution-state="waiting_review"]').waitFor();
  updateExecution("running", "approved");
  await page.locator('[data-chen-execution-state="running"]').waitFor();
  assert.equal(await page.getByRole("button", { name: /^(取消|Cancel)$/ }).isEnabled(), false);
  updateExecution("succeeded", "approved");
  await page.locator('[data-chen-execution-state="succeeded"]').waitFor();
  checks.push("approval follows server events; database cancellation remains disabled when unsupported");
  const warningSql = "SELECT 314 AS warning_value";
  await document(warningSql);
  await run();
  const warningButton = page.getByRole("button", { name: /^(确认命令告警|Review command warning)$/ });
  await warningButton.click();
  const beforeWarningCancel = requests.length;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(取消|Cancel)$/ })
    .click();
  assert.equal(requests.length, beforeWarningCancel);
  await document("SELECT 999 AS edited_after_warning");
  await warningButton.click();
  assert.ok((await page.getByRole("dialog").innerText()).includes(warningSql));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(确认并继续|Confirm and continue)$/ })
    .click();
  await requestReview.waitFor();
  assert.equal(requests.at(-1).sql, warningSql);
  assert.equal(requests.at(-1).confirm_warnings, true);
  await requestReview.click();
  await page.locator('[data-chen-execution-state="waiting_review"]').waitFor();
  assert.equal(requests.at(-1).sql, warningSql);
  assert.equal(requests.at(-1).confirm_warnings, true);
  assert.equal(requests.at(-1).submit_review, true);
  await cancelReview.click();
  await page.locator('[data-chen-execution-state="canceled"]').waitFor();
  checks.push(
    "warning cancel sends nothing; explicit consent binds original SQL and survives later administrator review"
  );
  await page.getByRole("button", { name: /^(新建查询|New query)$/i }).click();
  await page.getByRole("tab").nth(1).waitFor();
  await page.getByRole("tab").first().click();
  holdExecutionReads = true;
  for (const stream of streams) stream.end();
  for (let attempt = 0; attempt < 200; attempt++) {
    if (delayedReads.length && delayedConsoleResponse) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(delayedReads.length, "Fixture must hold the execution GET after SSE reconnect");
  assert.ok(delayedConsoleResponse, "Fixture must hold the second console creation");
  session.state = "locked";
  session.state_reason = "session_control_unavailable";
  publish("session.updated", session);
  await page.locator('[data-chen-session-state="locked"]').waitFor();
  await page.getByText(/会话控制连接暂时不可用|Session control is temporarily unavailable/).waitFor();
  session.state_reason = "session_locked";
  publish("session.updated", session);
  await page.getByText(/会话已被管理员暂停|Session paused by an administrator/).waitFor();
  checks.push("a hanging execution-state GET after reconnect does not delay control-stream lock/unlock/close events");
  const beforePause = requests.length;
  await document("SELECT 101 AS paused_draft");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(350);
  assert.equal(requests.length, beforePause);
  session.state = "ready";
  delete session.state_reason;
  publish("session.updated", session);
  await page.locator('[data-chen-session-state="ready"]').waitFor();
  assert.equal(requests.length, beforePause);
  assert.ok((await editor.innerText()).includes("paused_draft"));
  checks.push("pause disables execution but retains editing; unlock preserves draft without automatic execution");
  await document("SELECT 202 AS late_response");
  await page.keyboard.press("ControlOrMeta+Enter");
  for (let attempt = 0; attempt < 100; attempt++) {
    if (deferredResponse) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(deferredResponse, "Fixture must hold an execution response before close");
  session.state = "closed";
  publish("session.closed", { reason: "Fixture administrator closed the session" });
  await page.locator('[data-chen-session-state="closed"]').waitFor();
  deferredResponse();
  delayedConsoleResponse();
  for (const complete of delayedReads) complete();
  holdExecutionReads = false;
  await page.locator('[data-chen-execution-state="unknown"]').waitFor();
  const afterClose = requests.length;
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(350);
  assert.equal(requests.length, afterClose);
  assert.ok((await editor.innerText()).includes("late_response"));
  checks.push("administrator close disables execution and preserves the draft");
  checks.push("late HTTP execution response cannot revive an active spinner after session close");
  await page
    .getByRole("button", { name: /^(关闭页签|Close tab) / })
    .nth(1)
    .click();
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "The late console must remain closed, with no transaction warning"
  );
  assert.equal(await page.getByRole("tab").count(), 1);
  checks.push("late console creation remains closed and its untouched local tab closes without a transaction warning");
  await page.getByRole("button", { name: /^(关闭页签|Close tab) / }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /确认关闭|Confirm close/ })
    .click();
  await page.locator("[data-chen-query]").waitFor({ state: "detached" });
  assert.deepEqual(consoleDeletes, []);
  checks.push("closed session drafts can be discarded locally without a failing DELETE against an expired session");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/closed.png`, fullPage: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ passed: true, boundary: "synthetic HTTP/SSE; actual Nuxt UI", checks }, null, 2)
  );
  console.log(JSON.stringify({ passed: true, checks, report: `${output}/report.json` }, null, 2));
} catch (error) {
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: false, checks, error: error.message }, null, 2));
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(
      `${output}/failure.txt`,
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    );
  }
  throw error;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  for (const stream of streams) stream.end();
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
  await writeFile(`${output}/nuxt.log`, log);
}
