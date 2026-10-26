// Isolated browser editor check. Completion fixtures validate UI integration, not database semantics.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const monacoImports = [
  ...(await readFile(`${root}ui/chen/v1/monaco.ts`, "utf8")).matchAll(/"(monaco-editor\/[^"?]+)"/g)
].map((match) => match[1]);
const source = `
import { createApp, h, ref, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import messages from '/i18n/locales/en.json';
import Editor from '/ui/chen/v1/MonacoSqlEditor.client.vue';
import ValueViewer from '/ui/chen/v1/MonacoValueViewer.client.vue';
import { resultValuePart, resultJsonFormat, resultBinaryHex, formatResultHex } from '/ui/chen/v1/resultGrid.ts';
import { monaco } from '/ui/chen/v1/monaco.ts';
import { readResolvedEditorTokens } from '/ui/shared/theme/resolvedTokens.ts';
const value = ref('SELECT u.');
const online = ref(true);
const mode = ref('sql');
const viewer = ref(null);
const shownValue = ref('');
const json = ref(false);
const canCopy = ref(false);
let candidate = {label:'user_id', insert_text:'user_id', kind:'column', detail:'bigint · users'};
let replacement = null;
window.runs = [];
window.completions = [];
const api = {
  async complete(consoleId, document, position, version, signal) {
    window.completions.push({consoleId, document, position, version});
    return {document_version:version, from:replacement?.from ?? position, to:replacement?.to ?? position, items:[candidate]};
  },
  async analyze(consoleId, document, version) {
    // Source spans for the known smoke fixture statements, not a SQL parser.
    return {document_version:version, statements:[...document.matchAll(/[^;]+;?/g)].map(match=>({from:match.index,to:match.index+match[0].length,kind:'select'}))};
  }
};
const app = createApp({ render: () => mode.value === 'sql'
  ? h(Editor, {modelValue:value.value, 'onUpdate:modelValue':v=>value.value=v,
      dialect:'postgresql', consoleId:'console-test', api, canCopy:false, canPaste:false, online:online.value, visible:true,
      onRun:(sql,version)=>window.runs.push({sql,version})})
  : h(ValueViewer, {ref:viewer,value:shownValue.value,json:json.value,wrap:true,canCopy:canCopy.value,label:'Fixture value'})
});
app.use(createI18n({legacy:false,locale:'en',messages:{en:messages}}));
app.mount('#editor');
window.editorModel = () => monaco.editor.getModels()[0];
window.modelValue = () => value.value;
window.setFixture = async (sql, position, item, range) => {
  candidate=item; replacement=range; value.value=sql; await nextTick();
  const editor=monaco.editor.getEditors()[0]; editor.setPosition(editor.getModel().getPositionAt(position)); editor.focus();
};
window.setOnline = async next => { online.value=next; await nextTick(); };
window.showValue = async (raw, format, part=0) => {
  mode.value='value'; json.value=format==='json';
  const full=format==='json' ? resultJsonFormat(raw).text : format==='hex' ? formatResultHex(resultBinaryHex(raw,'BLOB')) : raw;
  shownValue.value=resultValuePart(full,part).text; await nextTick();
  return {full,shown:shownValue.value};
};
window.findValue = () => viewer.value.find();
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
    AutoImport({ imports: ["vue", { "vue-i18n": ["useI18n"] }], dts: false })
  ],
  resolve: { alias: { "~": `${root}ui` } },
  define: { "import.meta.client": "true" },
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: { noDiscovery: true, entries: [], include: ["vue", "vue-i18n", "sql-formatter", ...monacoImports] }
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
  await page.waitForFunction(() => window.runs.length === 1);
  assert.equal((await page.evaluate(() => window.runs))[0].sql, "SELECT u.user_id");
  await page.evaluate(() => navigator.clipboard.writeText("clipboard-sentinel"));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "clipboard-sentinel");
  await page.keyboard.press("ControlOrMeta+v");
  assert.equal(await page.evaluate(() => window.modelValue()), "SELECT u.user_id");
  const cases = [
    { input: "SELECT * FROM us|", label: "users", insert: "users", kind: "table", prefix: "us" },
    { input: "SELECT user_| FROM users", label: "user_id", insert: "user_id", kind: "column", prefix: "user_" },
    { input: "SELECT * FROM users u WHERE u.|", label: "user_id", insert: "user_id", kind: "column", prefix: "" },
    {
      input: "SELECT * FROM users u JOIN teams t ON i|",
      label: "u.id",
      insert: 'u."id"',
      kind: "column",
      prefix: "i",
      filter: "id"
    },
    {
      input: 'SELECT * FROM users WHERE "Ord|',
      label: 'Order "number"',
      insert: '"Order ""number"""',
      kind: "column",
      prefix: '"Ord'
    }
  ];
  for (const fixture of cases) {
    const position = fixture.input.indexOf("|");
    const sql = fixture.input.replace("|", "");
    const from = position - fixture.prefix.length;
    await page.evaluate(
      ({ sql, position, from, fixture }) =>
        window.setFixture(
          sql,
          position,
          { label: fixture.label, insert_text: fixture.insert, kind: fixture.kind, filter_text: fixture.filter },
          { from, to: position }
        ),
      { sql, position, from, fixture }
    );
    await page.keyboard.press("Control+Space");
    await page.getByRole("option").filter({ hasText: fixture.label }).first().waitFor({ timeout: 10_000 });
    await page.keyboard.press("Enter");
    const expected = sql.slice(0, from) + fixture.insert + sql.slice(position);
    await page.waitForFunction((expected) => window.modelValue() === expected, expected);
  }
  await page.evaluate(() => window.setOnline(false));
  const beforeOffline = await page.evaluate(() => ({
    runs: window.runs.length,
    completions: window.completions.length
  }));
  await page.keyboard.press("Control+Space");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForTimeout(400);
  assert.deepEqual(
    await page.evaluate(() => ({ runs: window.runs.length, completions: window.completions.length })),
    beforeOffline
  );
  await page.evaluate(() => window.setOnline(true));
  await page.evaluate(() =>
    window.setFixture("SELECT 1; SELECT 2;", 18, { label: "none", insert_text: "none", kind: "column" }, null)
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.waitForFunction(() => window.runs.length === 2);
  assert.equal((await page.evaluate(() => window.runs))[1].sql.trim(), "SELECT 2;");
  const raw = `${"x".repeat(128 * 1024 - 1)}😀数据库${"z".repeat(1000)}`;
  const parts = [];
  for (const part of [0, 1]) {
    const result = await page.evaluate(({ raw, part }) => window.showValue(raw, "raw", part), { raw, part });
    parts.push(result.shown);
    await page.waitForFunction((expected) => window.editorModel()?.getValue() === expected, result.shown);
    assert.equal(result.shown.includes("�"), false);
  }
  assert.equal(parts.join(""), raw);
  await page.evaluate(() => window.findValue());
  const find = page.getByRole("textbox", { name: "Find", exact: true });
  await find.waitFor();
  assert.equal(await find.inputValue(), "", "Long words must not automatically populate Find");
  await page.keyboard.press("Escape");
  const precise = '{"id":9007199254740993123456789,"amount":1.000000000000000001,"unicode":"数据库😀"}';
  const formatted = await page.evaluate((raw) => window.showValue(raw, "json"), precise);
  assert.ok(formatted.shown.includes("9007199254740993123456789"));
  assert.ok(formatted.shown.includes("1.000000000000000001"));
  await page.waitForFunction((expected) => window.editorModel()?.getValue() === expected, formatted.shown);
  const binary = await page.evaluate(() => window.showValue("0x00ff4142", "hex"));
  assert.equal(binary.shown, "00000000  00 ff 41 42                                      |..AB|");
  await page.waitForFunction((expected) => window.editorModel()?.getValue() === expected, binary.shown);
  assert.equal(await page.evaluate(() => window.disposeEditor()), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Monaco browser fixture passed: table/field/alias/JOIN/quoted completion, current-statement execution, paused editor, clipboard permissions, Unicode chunks, precise JSON, binary, Find and model cleanup. Backend SQL semantics are covered separately."
  );
} finally {
  await browser?.close();
  await server.close();
}
