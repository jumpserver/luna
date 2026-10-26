// Existing Nuxt dev server + isolated HTTP fixture. This tests real UI/download handling, not database policy.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const output = fileURLToPath(new URL("../output/chen-v1-export/", import.meta.url));
await mkdir(output, { recursive: true });
const session = {
  id: "export-fixture",
  dialect: "postgresql",
  asset: "Export fixture",
  account: "fixture",
  state: "ready",
  can_cancel: true,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  permissions: { can_copy: true, can_paste: true, can_download: true, can_upload: false }
};
const consoleView = { id: "export-console", database: "fixture", schema: "public", state: "ready" };
const jobs = new Map();
const executions = new Map();
const exports = [];
const requests = [];
const errors = [];
const checks = [];
let counter = 0;
let currentExecution;
let runSlow = false;
let downloadFormat = "csv";
const frozenSql = "SELECT id, body FROM export_fixture";
const csv = `id,body\n${"9223372036854775807,中文😀\n".repeat(300000)}`;
function execution(sql, extra = {}) {
  return {
    id: `execution-${++counter}`,
    console_id: consoleView.id,
    status: "succeeded",
    result_ids: ["result-one"],
    statement_results: [{ result_id: "result-one" }],
    audit_status: "recorded",
    ...extra
  };
}
function job(extra = {}) {
  return {
    id: `export-${++counter}`,
    status: "succeeded",
    mode: "cached",
    format: "csv",
    rows: 200,
    bytes: 8000,
    ready: true,
    truncated: true,
    expires_at: new Date(Date.now() + 900000).toISOString(),
    limits: { max_rows: 1000000, max_bytes: 134217728, max_cell_chars: 32767 },
    ...extra
  };
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/chen/api/v1/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const input = req.postData()
    ? path.endsWith("/downloads")
      ? Object.fromEntries(new URLSearchParams(req.postData()))
      : JSON.parse(req.postData())
    : {};
  requests.push({ path, method: req.method() });
  const respond = (body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: status === 204 ? undefined : JSON.stringify(body) });
  if (path.endsWith("/capabilities")) return respond({ mode: "single" });
  if (path.endsWith("/sessions")) return respond({ token: "fixture", session });
  if (path.endsWith(`/sessions/${session.id}`)) return respond(session);
  if (path.endsWith("/events"))
    return route.fulfill({
      contentType: "text/event-stream",
      body:
        session.state === "closed"
          ? `data: ${JSON.stringify({ sequence: 1, type: "session.closed", data: { reason: "fixture closed" } })}\n\n`
          : ": fixture\n\n"
    });
  if (path.endsWith("/consoles")) return respond(consoleView);
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
  if (path.endsWith("/rows"))
    return respond({
      id: "result-one",
      columns: [
        { name: "id", data_type: "BIGINT" },
        { name: "body", data_type: "TEXT" }
      ],
      rows: [["9223372036854775807", "中文😀"]],
      offset: 0,
      total_rows: 200,
      truncated: true
    });
  if (path.endsWith("/executions") && req.method() === "POST") {
    currentExecution = execution(input.sql);
    executions.set(currentExecution.id, currentExecution);
    return respond(currentExecution, 202);
  }
  if (path.includes("/executions/")) return respond(executions.get(path.split("/").at(-1)) || currentExecution);
  if (path.includes("/results/") && path.endsWith("/exports")) {
    const value = job({ format: input.format });
    jobs.set(value.id, value);
    exports.push({ mode: "cached", ...input });
    return respond(value, 202);
  }
  if (path.includes("/consoles/") && path.endsWith("/exports")) {
    exports.push({ mode: "query", ...input });
    const error = !input.confirm_warnings
      ? { code: "command_warning_confirmation_required", message: "Confirm warning" }
      : !input.submit_review
        ? { code: "command_review_required", message: "Review required" }
        : undefined;
    const value = job({
      mode: "query",
      format: input.format,
      console_id: consoleView.id,
      truncated: false,
      status: error ? "failed" : runSlow ? "running" : "succeeded",
      ready: !error && !runSlow,
      rows: error ? 0 : 300000,
      error
    });
    currentExecution = execution(input.sql, {
      export_id: value.id,
      status: value.status,
      result_ids: [],
      statement_results: [],
      error
    });
    value.execution_id = currentExecution.id;
    jobs.set(value.id, value);
    executions.set(currentExecution.id, currentExecution);
    return respond(currentExecution, 202);
  }
  if (path.endsWith("/download-ticket")) {
    const value = jobs.get(path.split("/").at(-2));
    downloadFormat = value.format;
    return respond({
      method: "POST",
      download_url: "/chen/api/v1/downloads",
      fields: { ticket: "one-use-fixture" },
      expires_at: new Date(Date.now() + 60000).toISOString()
    });
  }
  if (path.endsWith("/downloads")) {
    assert.equal(req.method(), "POST");
    assert.equal(input.ticket, "one-use-fixture");
    assert.ok(!req.url().includes("one-use"));
    return route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="fixture.${downloadFormat}"`
      },
      body: csv
    });
  }
  if (path.includes("/exports/")) {
    const id = path.endsWith("/cancel") ? path.split("/").at(-2) : path.split("/").at(-1);
    const value = jobs.get(id);
    if (req.method() === "DELETE") {
      jobs.delete(id);
      return respond(null, 204);
    }
    if (path.endsWith("/cancel")) {
      value.status = "canceled";
      value.ready = false;
      if (currentExecution?.export_id === id) currentExecution.status = "canceled";
    }
    return respond(value);
  }
  return respond({ error: { code: "fixture_unhandled", message: path } }, 404);
});
try {
  await page.goto(process.env.CHEN_UI_URL || "http://127.0.0.1:3000/luna/chen/?selector=export-fixture", {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });
  await page.locator('[data-chen-session-state="ready"]').waitFor({ timeout: 90000 });
  const editor = page.locator("[data-chen-query]:visible .monaco-editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(frozenSql);
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.locator('[data-chen-execution-state="succeeded"]').waitFor();
  const show = () => page.getByRole("button", { name: /^(导出数据|Export data|导出任务|Export task)$/ }).click();
  const panel = page.locator("[data-chen-export-panel]");
  await show();
  await panel.getByText(/全部 200 行|all 200 cached/).waitFor();
  await panel.getByText(/当前结果已截断|cached result was truncated/).waitFor();
  await panel.getByRole("button", { name: /生成导出文件|Generate export file/ }).click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: /下载文件|Download file/ }).click();
  const file = await download;
  await file.saveAs(`${output}cached.csv`);
  assert.equal(await file.failure(), null);
  assert.equal(await readFile(`${output}cached.csv`, "utf8"), csv);
  checks.push(
    "cached export defaults, exact row count and truncation warning; native POST download preserves an 11 MiB Unicode/BIGINT CSV without renderer Blob"
  );
  assert.equal(exports[0].mode, "cached");
  await panel.getByRole("button", { name: /释放文件|Release file/ }).click();
  await panel.getByText(/已交给浏览器下载|Download handed to the browser/).waitFor({ state: "hidden" });
  await panel.getByRole("button", { name: /导出完整查询|Export complete query/ }).click();
  await panel.getByRole("button", { name: "XLSX", exact: true }).click();
  assert.ok((await panel.innerText()).includes("32,767"));
  await panel.getByRole("button", { name: /确认重新查询并导出|Confirm and rerun/ }).click();
  await page.getByRole("button", { name: /确认命令告警|Review command warning/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /确认并继续|Confirm and continue/ })
    .click();
  await page.getByRole("button", { name: /申请复核|Request review/ }).click();
  await show();
  await panel.getByRole("button", { name: /下载文件|Download file/ }).waitFor();
  assert.deepEqual(
    exports.slice(1).map((x) => [x.sql, x.format, !!x.confirm_warnings, !!x.submit_review]),
    [
      [frozenSql, "xlsx", false, false],
      [frozenSql, "xlsx", true, false],
      [frozenSql, "xlsx", true, true]
    ]
  );
  checks.push(
    "full export confirms frozen result SQL; XLSX format and warning consent survive explicit review submission"
  );
  await panel.getByRole("button", { name: /释放文件|Release file/ }).click();
  runSlow = true;
  await panel.getByRole("button", { name: /导出完整查询|Export complete query/ }).click();
  await panel.getByRole("button", { name: /确认重新查询并导出|Confirm and rerun/ }).click();
  await page.getByRole("button", { name: /确认命令告警|Review command warning/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /确认并继续|Confirm and continue/ })
    .click();
  await page.getByRole("button", { name: /申请复核|Request review/ }).click();
  await show();
  await panel.getByRole("button", { name: /^(取消|Cancel)$/ }).click();
  await panel.getByText(/^(已取消|Canceled)$/).waitFor();
  assert.equal(await panel.getByRole("button", { name: /下载文件|Download file/ }).count(), 0);
  checks.push("cancelled export has no download action and never labels a partial file successful");
  session.state = "closed";
  await page.locator('[data-chen-session-state="closed"]').waitFor();
  await panel.getByText(/会话已暂停或关闭|The session is paused or closed/).waitFor();
  await page.keyboard.press("Escape");
  const requestsBeforeClosedView = requests.length;
  await show();
  await panel.getByRole("button", { name: /^(清除任务|Clear task)$/ }).click();
  await panel.getByRole("button", { name: /生成导出文件|Generate export file/ }).waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: /^(导出数据|Export data)$/ }).isDisabled(), true);
  assert.equal(
    requests.slice(requestsBeforeClosedView).filter((request) => request.path.includes("/exports/")).length,
    0
  );
  checks.push(
    "closed sessions allow local task inspection and clearing without API calls; creation and download remain unavailable"
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}export-canceled.png`, fullPage: true });
  await writeFile(
    `${output}report.json`,
    JSON.stringify(
      {
        checks,
        errors,
        boundary: "Synthetic HTTP, real Nuxt/Monaco/Chromium download; not database or XLSX encoding validation"
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: String(error),
        url: page.url(),
        errors,
        requests: requests.slice(-20),
        body: (await page.locator("body").innerText()).slice(0, 12000)
      },
      null,
      2
    )
  );
  await page.screenshot({ path: `${output}failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
