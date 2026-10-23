// Isolated browser editor check. Completion fixtures validate UI integration, not database semantics.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
import { createApp, h, ref } from 'vue';
import Editor from '/ui/chen/v1/MonacoSqlEditor.client.vue';
import { monaco } from '/ui/chen/v1/monaco.ts';
import { readResolvedEditorTokens } from '/ui/shared/theme/resolvedTokens.ts';
const value = ref('SELECT u.');
window.runs = [];
window.completions = [];
const api = { async complete(consoleId, document, position, version, signal) {
  window.completions.push({consoleId, document, position, version});
  return {document_version:version, from:position, to:position, items:[{label:'user_id', insert_text:'user_id', kind:'column', detail:'bigint · users'}]};
}};
const app = createApp({ render: () => h(Editor, {modelValue:value.value, 'onUpdate:modelValue':v=>value.value=v,
  dialect:'postgresql', consoleId:'console-test', api, canCopy:false, canPaste:false,
  onRun:(sql,version)=>window.runs.push({sql,version})}) });
app.mount('#editor');
window.editorModel = () => monaco.editor.getModels()[0];
window.modelValue = () => value.value;
window.themeDebug = {client:import.meta.client,tokens:readResolvedEditorTokens()};
window.disposeEditor = () => {app.unmount(); return monaco.editor.getModels().length;};
window.ready = true;
`;
const server = await createServer({
  root,
  appType: "custom",
  configFile: false,
  plugins: [
    {
      name: "chen-smoke-entry",
      resolveId: (id) => (id === "/@chen-smoke-entry" ? "\0chen-smoke-entry" : undefined),
      load: (id) => (id === "\0chen-smoke-entry" ? source : undefined),
      // This isolated Vite harness does not load Nuxt's import.meta compiler transform.
      transform: (code, id) =>
        id.startsWith(root) || id === "\0chen-smoke-entry" ? code.replaceAll("import.meta.client", "true") : undefined
    },
    vue(),
    AutoImport({ imports: ["vue"], dts: false })
  ],
  resolve: { alias: { "~": `${root}ui` } },
  define: { "import.meta.client": "true" },
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: { entries: [], include: ["vue"] }
});
server.middlewares.use((req, res, next) => {
  if (req.url?.split("?")[0] !== "/chen-editor-smoke") return next();
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><html class="dark"><head><style>
  :root { --editor-background:#202124; --editor-foreground:#efefef; --editor-gutter-background:#202124;
  --editor-gutter-foreground:#888888; --editor-line-highlight:#25282b; --editor-selection:#304d6f;
  --editor-selection-inactive:#333333; --editor-cursor:#ffffff; --editor-find-match:#5a4b00;
  --editor-find-match-active:#8a6500; --editor-bracket-match:#444444; --editor-indent-guide:#333333;
  --editor-indent-guide-active:#666666; --workspace-surface-panel:#202124; --workspace-surface-border:#444444;
  --syntax-keyword:#bb88ff; --syntax-string:#b5d99b; --syntax-number:#66bbdd; --syntax-comment:#888888;
  --syntax-variable:#dddddd; --syntax-type:#55aaaa; --syntax-function:#ddcc77; --syntax-operator:#aaaaaa;
  --syntax-constant:#dd8877; --syntax-property:#99bbcc; --font-mono:monospace }
  body { margin:0 } #editor { width:1100px;height:600px } .h-full { height:100% } .w-full {width:100%} </style></head>
  <body><div id="editor"></div><script type="module" src="/@chen-smoke-entry"></script></body></html>`);
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/chen-editor-smoke`);
  await page
    .waitForFunction(() => window.ready && window.editorModel())
    .catch((cause) => {
      throw new Error(`Editor failed to load: ${errors.join("; ")}`, { cause });
    });
  await page.locator(".monaco-editor").click();
  assert.equal(
    await page
      .locator(".monaco-editor-background")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(32, 33, 36)",
    JSON.stringify(await page.evaluate(() => window.themeDebug))
  );
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Control+Space");
  await page
    .getByRole("option", { name: /user_id/ })
    .waitFor({ timeout: 10_000 })
    .catch(async (cause) => {
      throw new Error(
        `Completion did not appear: ${JSON.stringify(await page.evaluate(() => window.completions))}; ${errors.join("; ")}`,
        { cause }
      );
    });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.modelValue() === "SELECT u.user_id");
  await page.keyboard.press("ControlOrMeta+Enter");
  assert.equal((await page.evaluate(() => window.runs))[0].sql, "SELECT u.user_id");
  await page.evaluate(() => navigator.clipboard.writeText("clipboard-sentinel"));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "clipboard-sentinel");
  await page.keyboard.press("ControlOrMeta+v");
  assert.equal(await page.evaluate(() => window.modelValue()), "SELECT u.user_id");
  assert.equal(await page.evaluate(() => window.disposeEditor()), 0);
  assert.deepEqual(errors, []);
  console.log("Monaco SQL browser smoke passed: completion, keyboard execution, clipboard permissions, model cleanup.");
} finally {
  await browser?.close();
  await server.close();
}
