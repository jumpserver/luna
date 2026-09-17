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
