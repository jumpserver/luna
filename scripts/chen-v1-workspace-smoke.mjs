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
import GoDatabaseSessionSurface from "~/chen/v1/GoDatabaseSessionSurface.vue";
definePageMeta({ layout: false });
const open = ref(true);
const tab = reactive({id:"chen-browser-fixture",assetId:"fixture",assetName:${JSON.stringify(`${dialect} browser fixture`)},address:"127.0.0.1",
 assetType:${JSON.stringify(dialect)},assetPlatform:${JSON.stringify(dialect)},assetCategory:"database",protocol:${JSON.stringify(dialect)},account:"fixture",
 status:"connecting",layoutMode:"single",panes:[],payload:{token:{id:${JSON.stringify(connectToken)}}}} as WorkspaceSessionTab);
</script><template><div class="h-screen w-screen"><UButton v-if="open" class="fixed right-12 top-0 z-50" @click="open = false">Close fixture workspace</UButton><GoDatabaseSessionSurface v-if="open" :tab="tab" /><p v-else data-fixture-closed>Workspace closed</p></div></template>`;
await writeFile(routeFile, route, { flag: "wx" });
const child = spawn(`${root}node_modules/.bin/nuxt`, ["dev", "--host", "127.0.0.1", "--port", "3019"], {
  cwd: root,
  env: {
    ...process.env,
    JMS_DEV_LIGHT: "1",
    JMS_CHEN_DEV_URL: fixture.backend_url
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
let auditHeaders;
const errors = [];
const api = [];
const summary = {
  database: dialect,
  frontend: "Nuxt + actual Go workspace",
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
  // Only the Core login/public-settings boundary is synthetic. All Chen
  // session, SQL, completion and cancellation requests reach the real handler.
  await page.route("**/api/v1/settings/public/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/authentication/web-session/status/**", (route) =>
    route.fulfill({
      json: {
        scope: "a".repeat(40),
        state_version: 1,
        locked: false,
        has_password: true,
        idle_lock_time: 0,
        user: { id: "browser-fixture", name: "Fixture", username: "fixture" }
      }
    })
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", async (response) => {
    if (!response.url().includes("/chen/api/v1/")) return;
    const path = new URL(response.url()).pathname;
    const call = { path, method: response.request().method(), status: response.status() };
    api.push(call);
    if (path.includes("/executions") || path.endsWith("/cancel")) {
      if (response.request().method() === "POST" && path.endsWith("/executions")) {
        // Keep the synthetic session credential only in memory, never in reports.
        const headers = response.request().headers();
        auditHeaders = Object.fromEntries(
          Object.entries(headers).filter(([name]) => ["authorization", "token"].includes(name))
        );
      }
      try {
        call.body = await response.json();
      } catch {
        /* Canceled/closed response. */
      }
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('[data-chen-session-state="ready"]').waitFor({ timeout: 60_000 });
  const editor = page.locator("[data-chen-query]:visible .monaco-editor");
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
  // The UI intentionally only shows audit failures now. Verify the real
  // execution receipt, rather than expecting an obsolete success-status label.
  const execution = api.findLast((call) => call.method === "POST" && call.path.endsWith("/executions"));
  assert.ok(execution?.body?.id && auditHeaders, "Missing actual query execution");
  let recorded = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const receipt = await page.request.get(`http://127.0.0.1:3019/chen/api/v1/executions/${execution.body.id}`, {
      headers: auditHeaders
    });
    assert.equal(receipt.status(), 200, "Execution receipt request failed");
    const state = await receipt.json();
    if (state.status === "succeeded" && state.audit_status === "recorded") {
      recorded = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(recorded, "Successful SQL did not reach recorded audit status");
  summary.checks.push("query, exact BIGINT, Unicode, NULL, recorded execution receipt");
  await page.screenshot({ path: `${output}/query.png`, fullPage: true });
  // A bare MySQL SELECT SLEEP() returns 1 after KILL QUERY as a successful known result.
  // A UNION query reports server error 1317, so this checks the canceled terminal state.
  await document(
    dialect === "mysql"
      ? "SELECT /* browser_cancel */ SLEEP(30), 1 UNION ALL SELECT 0, 2"
      : "SELECT /* browser_cancel */ pg_sleep(30)"
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.locator('[data-chen-execution-state="running"]').waitFor({ timeout: 20_000 });
  const cancel = page.getByRole("button", { name: /^(取消|Cancel)$/ });
  await cancel.waitFor();
  await cancel.click();
  await page.locator('[data-chen-execution-state="canceled"]').waitFor({ timeout: 20_000 });
  summary.checks.push(`HTTP cancellation confirmed by ${dialect}, separate from cancellation request`);
  // A managed tab is closed by its parent workspace, not the single-mode
  // in-panel close button. Unmount the actual component like that parent does.
  await page.getByRole("button", { name: "Close fixture workspace" }).click();
  await page.locator("[data-fixture-closed]").waitFor();
  for (
    let attempt = 0;
    attempt < 50 && !api.some((call) => call.method === "DELETE" && call.status === 204);
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  summary.checks.push("managed workspace unmount closes the real HTTP session");
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
