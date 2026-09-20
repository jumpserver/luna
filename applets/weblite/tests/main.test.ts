import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { readLaunch } from "../src/launch.ts";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

for (const platform of ["darwin", "win32"]) {
  test(`${platform} isolates its profile before waiting for stdin and cleans up invalid launches`, async (t) => {
    const paths = new Map<string, string>();
    const stdin = new PassThrough();
    const inherited = new PassThrough();
    const dialogs: string[] = [];
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
          assert.fail("invalid input must not create a browser window");
        }
      }
    };
    runInNewContext(outputText, {
      exports: {},
      process: { platform, stdin },
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
        return require(id);
      }
    });
    assert.equal(input, platform === "win32" ? inherited : stdin);
    const profile = paths.get("userData");
    assert.ok(profile && existsSync(profile), "profile must exist before stdin finishes");
    assert.equal(paths.get("sessionData"), profile, "Chromium must use the isolated profile too");
    input.end('{"secret":"must-not-appear-in-dialog",');
    assert.equal(await exited, 1);
    assert.equal(windows, 0);
    assert.equal(existsSync(profile), false);
    assert.equal(dialogs.length, 1);
    assert.ok(!dialogs[0].includes("must-not-appear-in-dialog"));
  });
}

for (const [language, system, expected] of [
  ["fr-CA", "zh-CN", "fr-CA"],
  ["en", "fr-FR", "en"],
  [undefined, "fr-FR", "fr-FR"],
  [" ", "ja-JP", "ja-JP"]
]) {
  test(`bootstrap resolves launch language ${language} before system ${system}`, async (t) => {
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
    const contents = { mainFrame: {}, on() {}, setWindowOpenHandler() {} };
    const electron = {
      app: {
        setPath: (_name, value) => profiles.add(value),
        setName() {},
        whenReady: async () => {},
        getLocale: () => system,
        exit: () => fail(new Error("Startup failed"))
      },
      Menu: { setApplicationMenu() {} },
      ipcMain: {
        handle: (_name, handler) => {
          invoke = handler;
        }
      },
      dialog: { showErrorBox() {} },
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
      process: { platform: "darwin", stdin: {} },
      require(id: string) {
        if (id === "electron") return electron;
        if (id === "./launch") return { readLaunch: async () => ({ language, standalone: !language }) };
        if (id === "@jumpserver/web-proxy/manager") return { createWebProxyManager: () => ({}) };
        return require(id);
      }
    });
    await ready;
    const bootstrap = await invoke({ senderFrame: contents.mainFrame }, "bootstrap");
    assert.equal(bootstrap.language, expected);
    assert.equal(bootstrap.standalone, !language);
  });
}
