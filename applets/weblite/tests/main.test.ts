import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { readLaunch } from "../src/launch.ts";
import { formatWebProxyMessage, webProxyMessages } from "@jumpserver/web-proxy/i18n";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

for (const platform of ["darwin", "win32"]) {
  for (const [failure, payload, expected] of [
    ["invalid JSON", '{"secret":"must-not-appear-in-dialog",', "数据格式无效"],
    [
      "invalid selector",
      JSON.stringify({
        target_url: "https://app.example.com/login",
        safe_mode: true,
        login: {
          config: { autofill: "basic", success_selector: "javascript=must-not-appear-in-dialog" },
          username: "tester",
          password: "must-not-appear-in-dialog"
        }
      }),
      "success_selector"
    ],
    [
      "invalid AppletArgs asset selector",
      JSON.stringify({
        protocol: "https",
        asset: {
          address: "https://app.example.com/login",
          spec_info: { autofill: "basic", success_selector: "invalid-must-not-appear-in-dialog" }
        },
        account: { username: "tester", secret: "must-not-appear-in-dialog" }
      }),
      "success_selector"
    ],
    [
      "invalid AppletArgs platform selector",
      JSON.stringify({
        protocol: "https",
        asset: { address: "https://app.example.com/login" },
        platform: {
          protocols: [
            { name: "https", setting: { autofill: "basic", success_selector: "invalid-must-not-appear-in-dialog" } }
          ]
        },
        account: { username: "tester", secret: "must-not-appear-in-dialog" }
      }),
      "success_selector"
    ],
    [
      "invalid allowlist",
      JSON.stringify({ target_url: "https://app.example.com", allowed_urls: ["*"], safe_mode: true }),
      "Website 访问白名单请填写完整 HTTP/HTTPS 站点地址"
    ],
    [
      "window creation",
      JSON.stringify({ target_url: "https://app.example.com", safe_mode: true, login: { config: { autofill: "no" } } }),
      "BrowserWindow unavailable"
    ]
  ]) {
    test(`${platform} reports ${failure} at its startup stage`, async (t) => {
      const paths = new Map<string, string>();
      const stdin = new PassThrough();
      const inherited = new PassThrough();
      const dialogs: string[] = [];
      const logs: string[] = [];
      let input;
      let exit;
      let windows = 0;
      const exited = new Promise<number>((resolve) => (exit = resolve));
      t.after(async () => {
        stdin.destroy();
        inherited.destroy();
        for (const profile of new Set(paths.values())) await rm(profile, { recursive: true, force: true });
      });
      const electron = {
        Menu: { setApplicationMenu() {} },
        app: {
          setPath: (name: string, value: string) => paths.set(name, value),
          setName() {},
          whenReady: async () => {},
          exit: (code: number) => exit(code)
        },
        dialog: { showErrorBox: (_title: string, message: string) => dialogs.push(message) },
        BrowserWindow: class {
          constructor() {
            windows += 1;
            if (failure === "window creation") throw Object.assign(new Error(expected), { code: "E_WINDOW" });
            assert.fail("invalid input must not create a browser window");
          }
        }
      };
      runInNewContext(outputText, {
        exports: {},
        __dirname: "/tmp/weblite",
        console: { error: (message: string) => logs.push(message) },
        process: { platform, stdin, on() {} },
        require(id: string) {
          if (id === "electron") return electron;
          if (id === "node:tty") return { isatty: () => false };
          if (id === "node:fs")
            return {
              ...require(id),
              createReadStream: (_path, options) => {
                assert.equal(options.fd, 0);
                assert.equal(options.autoClose, false);
                return inherited;
              }
            };
          if (id === "./launch")
            return {
              readLaunch: (stream) => {
                input = stream;
                return readLaunch(stream);
              }
            };
          if (id === "@jumpserver/web-proxy/manager") return {};
          if (id === "@jumpserver/web-proxy/i18n") return { formatWebProxyMessage, webProxyMessages };
          return require(id);
        }
      });
      assert.equal(input, platform === "win32" ? inherited : stdin);
      const profile = paths.get("userData");
      assert.ok(profile && existsSync(profile), "profile must exist before stdin finishes");
      assert.equal(paths.get("sessionData"), profile, "Chromium must use the isolated profile too");
      input.end(payload);
      assert.equal(await exited, 1);
      assert.equal(windows, failure === "window creation" ? 1 : 0);
      if (failure !== "window creation") assert.equal(existsSync(profile), false);
      assert.equal(dialogs.length, 1);
      assert.ok(
        dialogs[0].includes(failure === "window creation" ? "创建浏览器窗口" : "读取并校验连接配置（尚未打开资产页面）")
      );
      if (failure === "window creation") assert.ok(dialogs[0].includes("Error (E_WINDOW)"));
      assert.ok(dialogs[0].includes("错误类型："));
      assert.ok(dialogs[0].includes(expected));
      assert.ok(!dialogs[0].includes("must-not-appear-in-dialog"));
      assert.equal(logs.length, 1);
      assert.ok(!logs[0].includes("must-not-appear-in-dialog"));
    });
  }
}

for (const [language, system, expected, failure] of [
  ["fr-CA", "zh-CN", "fr-CA"],
  ["en", "fr-FR", "en"],
  [undefined, "fr-FR", "fr-FR"],
  [" ", "ja-JP", "ja-JP"],
  ["en", "en", "en", "report_error"],
  ["en", "en", "en", "render-process-gone"],
  ["en", "en", "en", "uncaughtException"],
  ["en", "en", "en", "unhandledRejection"]
]) {
  test(
    failure ? `reports ${failure} after window creation` : `bootstrap resolves ${language} before ${system}`,
    async (t) => {
      const profiles = new Set<string>();
      t.after(async () => {
        for (const profile of profiles) await rm(profile, { recursive: true, force: true });
      });
      let invoke;
      let shown;
      let fail;
      const ready = new Promise<void>((resolve, reject) => {
        shown = resolve;
        fail = reject;
      });
      const dialogs: string[] = [];
      const handlers = new Map();
      let exit;
      const exited = new Promise<number>((resolve) => (exit = resolve));
      const contents = { mainFrame: {}, on: (name, handler) => handlers.set(name, handler), setWindowOpenHandler() {} };
      const electron = {
        app: {
          setPath: (_name, value) => profiles.add(value),
          setName() {},
          whenReady: async () => {},
          getLocale: () => system,
          exit: (code: number) => {
            exit(code);
            if (!failure) fail(new Error("Startup failed"));
          }
        },
        Menu: { setApplicationMenu() {} },
        ipcMain: {
          handle: (_name, handler) => {
            invoke = handler;
          }
        },
        dialog: { showErrorBox: (_title, message) => dialogs.push(message) },
        BrowserWindow: class {
          webContents = contents;
          on() {}
          async loadFile() {}
          maximize() {}
          show() {
            shown();
          }
        }
      };
      runInNewContext(outputText, {
        exports: {},
        __dirname: "/tmp/weblite",
        console: { error() {} },
        process: { platform: "darwin", stdin: {}, on: (name, handler) => handlers.set(name, handler) },
        require(id: string) {
          if (id === "electron") return electron;
          if (id === "./launch") return { readLaunch: async () => ({ language, standalone: !language }) };
          if (id === "@jumpserver/web-proxy/manager") return { createWebProxyManager: () => ({}) };
          if (id === "@jumpserver/web-proxy/i18n") return { formatWebProxyMessage, webProxyMessages };
          return require(id);
        }
      });
      await ready;
      const bootstrap = await invoke({ senderFrame: contents.mainFrame }, "bootstrap");
      assert.equal(bootstrap.language, expected);
      assert.equal(bootstrap.standalone, !language);
      if (failure) {
        if (failure === "report_error") {
          await assert.rejects(invoke({ senderFrame: {} }, "report_error", { message: "untrusted" }), /无效/);
          await assert.rejects(invoke({ senderFrame: contents.mainFrame }, "report_error", { message: {} }), /无效/);
          await invoke({ senderFrame: contents.mainFrame }, "report_error", { message: "RendererBootstrapFailed" });
        } else if (failure === "render-process-gone") {
          handlers.get(failure)({}, { reason: "crashed", exitCode: 42 });
        } else {
          handlers.get(failure)(Object.assign(new Error("RuntimeFailed"), { code: "E_RUNTIME" }));
        }
        assert.equal(await exited, 1);
        assert.equal(dialogs.length, 1);
        assert.match(dialogs[0], /失败阶段：/);
        assert.match(dialogs[0], /RendererBootstrapFailed|crashed \(exitCode: 42\)|RuntimeFailed/);
      }
    }
  );
}

const rendererSource = await readFile(new URL("../src/renderer/main.ts", import.meta.url), "utf8");
const rendererOutput = ts.transpileModule(rendererSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;

for (const failure of ["bootstrap", "vue", "error", "unhandledrejection", "syntax", "ipc"]) {
  test(`renderer reports ${failure} failures with a visible fallback when IPC is unavailable`, async () => {
    const handlers = new Map();
    const root = { textContent: "" };
    const reports: string[] = [];
    let mounted;
    const ready = new Promise<void>((resolve) => (mounted = resolve));
    const application = {
      config: { errorHandler: undefined as any },
      use() {
        return this;
      },
      mount() {
        mounted();
      }
    };
    const cause = new Error("RendererFailure");
    let complete;
    const reported = new Promise<void>((resolve) => (complete = resolve));
    runInNewContext(rendererOutput, {
      exports: {},
      navigator: { language: "en" },
      document: { getElementById: () => root },
      window: {
        addEventListener: (name, handler) => handlers.set(name, handler),
        webApplet: {
          async invoke(command, args) {
            if (command === "bootstrap") {
              if (failure === "bootstrap") throw cause;
              return {};
            }
            assert.equal(command, "report_error");
            reports.push(args.message);
            complete();
            if (failure === "ipc") throw new Error("IPC unavailable");
          }
        }
      },
      require(id: string) {
        if (id === "vue") return { createApp: () => application };
        if (id === "vue-i18n") return { createI18n: () => ({}) };
        if (id.endsWith("/language")) return { normalizeLanguageCode: (value) => value };
        return {};
      }
    });
    if (failure !== "bootstrap") await ready;
    if (failure === "vue") await application.config.errorHandler(cause);
    if (failure === "error") handlers.get("error")({ error: cause });
    if (failure === "unhandledrejection") handlers.get("unhandledrejection")({ reason: cause });
    if (failure === "syntax") await application.config.errorHandler(new SyntaxError("must-not-appear-in-dialog"));
    if (failure === "ipc") await application.config.errorHandler(cause);
    await reported;
    if (failure === "syntax") {
      assert.match(reports[0], /SyntaxError/);
      assert.ok(!reports[0].includes("must-not-appear-in-dialog"));
    } else assert.deepEqual(reports, ["Error: RendererFailure"]);
    if (failure === "ipc") assert.match(root.textContent, /WebLite.*RendererFailure/);
  });
}
