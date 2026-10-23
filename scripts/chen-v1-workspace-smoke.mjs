// Real Nuxt workspace + Go HTTP + isolated database fixture; never point this at production.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtureFile = process.env.CHEN_BROWSER_FIXTURE_FILE || "/tmp/chen-go-browser-fixture.json";
const fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
const dialect = fixture.dialect || fixture.protocol || "mysql";
assert.ok(["mysql", "postgresql"].includes(dialect), "Unsupported fixture dialect");
assert.equal(new URL(fixture.backend_url).hostname, "127.0.0.1", "Only an isolated localhost fixture is supported");
assert.equal(fixture.connect_token, "owner", "Use the synthetic Go engine browser fixture");
const connectToken = `browser-run-${Date.now()}`;
const output = `${root}output/chen-v1-browser/${dialect}`;
await mkdir(output, { recursive: true });
const routeFile = `${root}ui/pages/facelive/chen-v1-smoke.vue`;
const route = `<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import DatabaseSessionRouter from "~/chen/workspaces/DatabaseSessionRouter.vue";
definePageMeta({ layout: false });
const tab = reactive({id:"chen-browser-fixture",assetId:"fixture",assetName:${JSON.stringify(`${dialect} browser fixture`)},address:"127.0.0.1",
 assetType:${JSON.stringify(dialect)},assetPlatform:${JSON.stringify(dialect)},assetCategory:"database",protocol:${JSON.stringify(dialect)},account:"fixture",
 status:"connecting",layoutMode:"single",panes:[],payload:{token:{id:${JSON.stringify(connectToken)}}}} as WorkspaceSessionTab);
</script><template><div class="h-screen w-screen"><DatabaseSessionRouter :tab="tab" /></div></template>`;
await writeFile(routeFile, route, { flag: "wx" });
const child = spawn(`${root}node_modules/.bin/nuxt`, ["dev", "--host", "127.0.0.1", "--port", "3019"], {
  cwd: root,
  env: {
    ...process.env,
    JMS_DEV_LIGHT: "1",
    JMS_CHEN_DEV_URL: fixture.backend_url,
    NUXT_PUBLIC_CHEN_GO_V1_PROTOCOLS: "mysql,postgresql"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
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
const api = [];
const summary = {
  database: dialect,
  frontend: "Nuxt + actual DatabaseSessionRouter/Go workspace",
  backend: `Go HTTP + fake Core/Wisp boundary + real ${dialect}`,
  checks: []
};
try {
  const url = "http://127.0.0.1:3019/luna/facelive/chen-v1-smoke";
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Development startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Nuxt did not start");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (!response.url().includes("/chen/api/v1/")) return;
    const path = new URL(response.url()).pathname;
    const call = { path, method: response.request().method(), status: response.status() };
    api.push(call);
    if (path.includes("/executions") || path.endsWith("/cancel")) {
      try {
        call.body = await response.json();
      } catch {
        /* Canceled/closed response. */
      }
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText("Go V1", { exact: true }).waitFor({ timeout: 60_000 });
  const editor = page.locator(".monaco-editor");
  await editor.waitFor({ timeout: 60_000 });
  async function document(sql) {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(sql);
  }
  await document("SELECT * FROM chen_browser_items AS t WHERE t.");
  await page.keyboard.press("Control+Space");
  await page.getByRole("option", { name: /name/ }).first().waitFor({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  summary.checks.push("authenticated console and real alias/column completion");
  await document("SELECT id, name, note FROM chen_browser_items");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByText("9007199254740993", { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText("数据库工作台", { exact: true }).waitFor();
  await page.getByText("NULL", { exact: true }).waitFor();
  await page.getByText(/已本地记录|Recorded locally/).waitFor();
  summary.checks.push("query, exact BIGINT, Unicode, NULL, locally-recorded audit status");
  await page.screenshot({ path: `${output}/query.png`, fullPage: true });
  // A bare MySQL SELECT SLEEP() returns 1 after KILL QUERY as a successful known result.
  // A UNION query reports server error 1317, so this checks the canceled terminal state.
  await document(
    dialect === "mysql"
      ? "SELECT /* browser_cancel */ SLEEP(30), 1 UNION ALL SELECT 0, 2"
      : "SELECT /* browser_cancel */ pg_sleep(30)"
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByText(/执行:\s*执行中|Execution:\s*Running/).waitFor({ timeout: 20_000 });
  const cancel = page.getByRole("button", { name: /^(取消|Cancel)$/ });
  await cancel.waitFor();
  await cancel.click();
  await page.getByText(/已取消|Canceled/).waitFor({ timeout: 20_000 });
  summary.checks.push(`HTTP cancellation confirmed by ${dialect}, separate from cancellation request`);
  await page.getByRole("button", { name: /关闭连接|Close connection/ }).click();
  await page.getByText(/会话当前不可用|Session unavailable/).waitFor();
  summary.checks.push("explicit session close disables editor submission");
  assert.deepEqual(errors, [], "Unhandled browser errors");
  assert.ok(api.some((call) => call.path.endsWith("/completion") && call.status === 200));
  assert.ok(api.some((call) => call.path.endsWith("/cancel") && [200, 202].includes(call.status)));
  assert.ok(api.some((call) => call.method === "DELETE" && call.status === 204));
  summary.api = api;
  summary.browser_errors = errors;
  summary.passed = true;
  await writeFile(`${output}/report.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ passed: true, checks: summary.checks, report: `${output}/report.json` }, null, 2));
} catch (error) {
  summary.passed = false;
  summary.error = error.message;
  summary.api = api;
  summary.browser_errors = errors;
  if (page) {
    summary.ui_text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  }
  await writeFile(`${output}/report.json`, JSON.stringify(summary, null, 2));
  throw error;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await rm(routeFile, { force: true });
  await writeFile(`${output}/nuxt.log`, log);
}
