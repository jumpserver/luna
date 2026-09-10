import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  CLIENT_AUTH_CALLBACK,
  findClientProtocolUrl,
  normalizeClientProtocolUrl,
  registerClientProtocol
} from "../src/shared/client-protocol.ts";

// Execute the real entry/service code with Electron replaced; no desktop or OS
// registration is touched by these Windows lifecycle checks on other platforms.
function loadWithElectronMocks(relativePath: string, replacements: Record<string, unknown>, runtime = process) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const require = createRequire(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  const exports: Record<string, any> = {};
  runInNewContext(output.outputText, {
    exports,
    require: (name: string) => (Object.hasOwn(replacements, name) ? replacements[name] : require(name)),
    process: runtime,
    console,
    Buffer,
    URLSearchParams,
    AbortSignal
  });
  return exports;
}

test("Windows RDP launch preserves a connection file path containing spaces and waits for spawn", async () => {
  const child = Object.assign(new EventEmitter(), { unref() {} });
  let spawned: { executable: string; args: string[] };
  let writtenPath = "";
  const { LocalApplicationLauncher } = loadWithElectronMocks(
    "../src/apps/local-app-launcher.ts",
    {
      "node:path": path.win32,
      "node:fs/promises": {
        mkdir: async () => {},
        writeFile: async (file: string) => {
          writtenPath = file;
        },
        stat: async () => ({ isFile: () => true })
      },
      "node:child_process": {
        spawn: (executable: string, args: string[]) => {
          spawned = { executable, args };
          return child;
        }
      }
    },
    { platform: "win32", env: {} } as NodeJS.Process
  );
  const launcher = new LocalApplicationLauncher({}, "", { configDir: "C:\\Users\\Test User\\JumpServer" }, null);
  let finished = false;
  const launch = launcher
    .launchFile(
      { path: "C:\\WINDOWS\\system32\\mstsc.exe", arg_format: "{file}" },
      { protocol: "rdp", file: { name: "asset", content: "full address:s:127.0.0.1:3389" } }
    )
    .then(() => {
      finished = true;
    });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(spawned.executable, "C:\\WINDOWS\\system32\\mstsc.exe");
  assert.deepEqual(Array.from(spawned.args), [writtenPath]);
  assert.equal(writtenPath, "C:\\Users\\Test User\\JumpServer\\asset.rdp");
  child.emit("spawn");
  await launch;
  assert.equal(finished, true);
});

test("native launcher reports spawn errors without leaking connection arguments", async () => {
  const child = Object.assign(new EventEmitter(), { unref() {} });
  let executable = "";
  const { LocalApplicationLauncher } = loadWithElectronMocks(
    "../src/apps/local-app-launcher.ts",
    {
      "node:child_process": {
        spawn: (value: string) => {
          executable = value;
          return child;
        }
      }
    },
    { platform: "linux", env: {} } as NodeJS.Process
  );
  const launcher = new LocalApplicationLauncher({}, "", null, null);
  const launch = launcher.launchTerminal({ path: "Terminal" }, "ssh -P test-secret", false);
  const rejected = assert.rejects(launch, (error: Error) => {
    assert.match(error.message, /failed to launch client.*ENOENT/);
    assert.doesNotMatch(error.message, /test-secret/);
    return true;
  });
  assert.equal(executable, "x-terminal-emulator");
  child.emit("error", Object.assign(new Error("spawn failed with test-secret"), { code: "ENOENT" }));
  await rejected;
});

test("macOS protocol launch waits for the terminal handoff and rejects failed AppleScript", async () => {
  const child = Object.assign(new EventEmitter(), { unref() {} });
  const { LocalApplicationLauncher } = loadWithElectronMocks(
    "../src/apps/local-app-launcher.ts",
    {
      "node:child_process": { spawn: () => child }
    },
    { platform: "darwin", env: {} } as NodeJS.Process
  );
  const launcher = new LocalApplicationLauncher({}, "", null, null);
  let finished = false;
  const launch = launcher.launchTerminal({ application_id: "com.apple.Terminal" }, "ssh test", false);
  const rejected = assert.rejects(launch, /failed to launch client.*exit code 1/).then(() => {
    finished = true;
  });
  child.emit("spawn");
  await new Promise(setImmediate);
  assert.equal(finished, false);
  child.emit("exit", 1, null);
  await rejected;
});

test("extracts Windows cold-start and forwarded URLs without changing their payload", () => {
  const url = `${CLIENT_AUTH_CALLBACK}?code=a%2Bb&state=xyz`;
  assert.equal(CLIENT_AUTH_CALLBACK, "jms2://auth/callback");
  assert.equal(findClientProtocolUrl(["C:\\Program Files\\JumpServer\\jumpserver.exe", url, "--flag"]), url);
  assert.equal(findClientProtocolUrl(["electron.exe", "C:\\My Project\\electron", `"${url}"`]), url);
  assert.equal(findClientProtocolUrl(["jumpserver.exe"], { protocolUrl: url }), url);
  assert.equal(findClientProtocolUrl(["jumpserver.exe", url], { protocolUrl: "https://untrusted.example/" }), url);
  assert.equal(normalizeClientProtocolUrl(encodeURIComponent(url)), url);
  assert.equal(normalizeClientProtocolUrl("JMS2://AbC+/DeF=="), "jms2://AbC+/DeF==");
  assert.equal(findClientProtocolUrl(["jumpserver.exe", "jms://legacy", `https://site/?next=${url}`]), undefined);
  assert.equal(normalizeClientProtocolUrl("jms2%3A%2F%2Fbad%ZZ"), undefined);
});

test("registers only jms2 and keeps the Windows development entry path as one argument", () => {
  const calls: unknown[][] = [];
  const app = {
    setAsDefaultProtocolClient: (...args: unknown[]) => {
      calls.push(args);
      return true;
    }
  };
  const runtime = {
    platform: "win32" as const,
    defaultApp: true,
    execPath: "C:\\Program Files\\Electron\\electron.exe",
    argv: ["electron.exe", "C:\\My Project\\electron"]
  };
  registerClientProtocol(app, runtime);
  assert.deepEqual(calls, [["jms2", runtime.execPath, [runtime.argv[1]]]]);
  calls.length = 0;
  registerClientProtocol(app, { ...runtime, defaultApp: false });
  assert.deepEqual(calls, [["jms2"]]);
  calls.length = 0;
  registerClientProtocol(app, { ...runtime, platform: "darwin" });
  registerClientProtocol(app, { ...runtime, argv: ["electron.exe"] });
  assert.deepEqual(calls, []);
});

for (const primary of [false, true]) {
  test(`Windows ${primary ? "primary" : "secondary"} process handles a protocol launch once`, async () => {
    const url = `${CLIENT_AUTH_CALLBACK}?code=abc&state=xyz`;
    const events: string[] = [];
    let forwarded: unknown;
    const app = Object.assign(new EventEmitter(), {
      setName: () => events.push("name"),
      requestSingleInstanceLock: (data: unknown) => {
        events.push("lock");
        forwarded = data;
        return primary;
      },
      quit: () => events.push("quit")
    });
    const runtime = { argv: ["jumpserver.exe", url], platform: "win32" } as NodeJS.Process;
    const replacements = {
      electron: { app },
      "electron-squirrel-startup": false,
      "./shared/client-protocol": {
        findClientProtocolUrl,
        registerClientProtocol: () => events.push("register")
      },
      get "./desktop/main"() {
        events.push("main");
        return { handleIncomingProtocolUrl: () => {} };
      }
    };
    loadWithElectronMocks("../src/bootstrap.ts", replacements, runtime);
    await new Promise(setImmediate);
    assert.equal((forwarded as { protocolUrl: string }).protocolUrl, url);
    assert.deepEqual(events, primary ? ["name", "lock", "register", "main"] : ["name", "lock", "quit"]);
  });
}

test("protocol events arriving while the desktop loads are forwarded after initialization", async () => {
  const callback = `${CLIENT_AUTH_CALLBACK}?code=abc&state=xyz`;
  const asset = "jms2://AbC+/DeF==";
  const delivered: unknown[][] = [];
  const app = Object.assign(new EventEmitter(), {
    setName() {},
    requestSingleInstanceLock: () => true
  });
  let prevented = false;
  loadWithElectronMocks("../src/bootstrap.ts", {
    electron: { app },
    "electron-squirrel-startup": false,
    "./shared/client-protocol": { findClientProtocolUrl, registerClientProtocol() {} },
    get "./desktop/main"() {
      app.emit("second-instance", {}, ["jumpserver.exe"], "C:\\", { protocolUrl: callback });
      app.emit("open-url", { preventDefault: () => (prevented = true) }, asset);
      assert.equal(delivered.length, 0);
      return { handleIncomingProtocolUrl: (...args: unknown[]) => delivered.push(args) };
    }
  });
  await new Promise(setImmediate);
  assert.equal(prevented, true);
  assert.deepEqual(delivered, [
    [callback, false],
    [asset, undefined]
  ]);
  app.emit("second-instance", {}, ["jumpserver.exe", asset], "C:\\");
  assert.deepEqual(delivered.at(-1), [asset, false]);
});

for (const action of ["install", "updated", "uninstall", "obsolete"]) {
  test(`Squirrel ${action} handles protocol registration without loading the desktop`, async () => {
    const events: string[] = [];
    const app = { removeAsDefaultProtocolClient: (scheme: string) => events.push(`remove:${scheme}`) };
    loadWithElectronMocks(
      "../src/bootstrap.ts",
      {
        electron: { app },
        "electron-squirrel-startup": true,
        "./shared/client-protocol": {
          CLIENT_PROTOCOL: "jms2",
          registerClientProtocol: () => events.push("register:jms2")
        },
        get "./desktop/main"() {
          return assert.fail("installer lifecycle must not start the desktop");
        }
      },
      {
        platform: "win32",
        argv: ["jumpserver.exe", `--squirrel-${action}`],
        exit: () => assert.fail("Squirrel must finish updating shortcuts before quitting")
      } as unknown as NodeJS.Process
    );
    await new Promise(setImmediate);
    assert.deepEqual(events, action === "uninstall" ? ["remove:jms2"] : action === "obsolete" ? [] : ["register:jms2"]);
  });
}

function authServiceFixture(isPackaged = true, createServer?: () => EventEmitter) {
  const app = { getPath: () => "/unused", isPackaged };
  const { DesktopAuthService } = loadWithElectronMocks("../src/auth/service.ts", {
    electron: { app, net: {}, safeStorage: {} },
    ...(createServer ? { "node:http": { createServer } } : {})
  });
  let resolveAuthorization: (url: string) => void;
  const authorized = {
    promise: new Promise<string>((resolve) => {
      resolveAuthorization = resolve;
    }),
    resolve: (url: string) => resolveAuthorization(url)
  };
  const service = new DesktopAuthService((_event: string, url: string) => authorized.resolve(url));
  service.fetchSite = async () => ({ ok: true, text: async () => JSON.stringify({ client_id: "desktop" }) });
  service.persistTokens = async () => {};
  service.buildLoginPayload = async () => ({ status: "success" });
  return { service, authorized };
}

test("packaged login uses jms2 and ignores stale callbacks without losing the pending login", async () => {
  const { service, authorized } = authServiceFixture();
  await service.startCallbackServer();
  assert.equal(service.redirectUri, CLIENT_AUTH_CALLBACK);
  let exchange: Record<string, string>;
  service.exchangeToken = async (_site: string, parameters: Record<string, string>) => {
    exchange = parameters;
    return { access_token: "test-token" };
  };
  const login = service.authLogin({ site: "https://site.example", sessionId: "account" });
  const authorize = new URL(await authorized.promise);
  const state = authorize.searchParams.get("state");
  assert.equal(authorize.searchParams.get("redirect_uri"), CLIENT_AUTH_CALLBACK);
  const pending = service.pendingAuth;
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?code=old&state=old`), false);
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?code=no-state`), false);
  assert.equal(service.handleCallback(`jms://auth/callback?code=legacy&state=${state}`), false);
  assert.equal(service.pendingAuth, pending);
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?code=valid&state=${state}`), true);
  assert.equal((await login).status, "success");
  assert.equal(exchange.code, "valid");
  assert.equal(exchange.redirect_uri, CLIENT_AUTH_CALLBACK);
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?code=duplicate&state=${state}`), false);
});

test("OAuth denial completes the matching login with an error and does not exchange a token", async () => {
  const { service, authorized } = authServiceFixture();
  service.exchangeToken = () => assert.fail("a rejected authorization must not exchange a token");
  const login = service.authLogin({ site: "https://site.example", sessionId: "account" });
  const rejected = assert.rejects(login, /OAuth authorization failed: access_denied/);
  const state = new URL(await authorized.promise).searchParams.get("state");
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?error=access_denied&state=${state}`), true);
  await rejected;
  assert.equal(service.pendingAuth, null);
});

test("cancelling a login rejects its later callback", async () => {
  const { service, authorized } = authServiceFixture();
  const login = service.authLogin({ site: "https://site.example", sessionId: "account" });
  const state = new URL(await authorized.promise).searchParams.get("state");
  service.cancelAuth();
  assert.equal(await login, null);
  assert.equal(service.handleCallback(`${CLIENT_AUTH_CALLBACK}?code=cancelled&state=${state}`), false);
});

function callbackServerFixture(occupied = false) {
  return Object.assign(new EventEmitter(), {
    listening: false,
    listen(port: number, hostname: string, ready: () => void) {
      assert.equal(port, 14876);
      assert.equal(hostname, "127.0.0.1");
      queueMicrotask(() => {
        if (occupied) this.emit("error", Object.assign(new Error("port occupied"), { code: "EADDRINUSE" }));
        else {
          this.listening = true;
          ready();
          this.emit("listening");
        }
      });
    },
    close() {}
  });
}

test("an occupied development callback port stops login instead of using another client's deep link", async () => {
  const { service } = authServiceFixture(false, () => callbackServerFixture(true));
  service.emitEvent = () => assert.fail("must not open a browser without its callback listener");
  service.fetchSite = () => assert.fail("must fail before starting OAuth");
  await assert.rejects(service.authLogin({ site: "https://site.example", sessionId: "account" }), /14876.*in use/);
  assert.equal(service.callbackServer, null);
  assert.equal(service.pendingAuth, null);
});

test("development login waits for an in-progress callback listener and preserves the loopback flow", async () => {
  let listeners = 0;
  const { service, authorized } = authServiceFixture(false, () => {
    listeners++;
    return callbackServerFixture();
  });
  service.exchangeToken = async () => ({ access_token: "test-token" });
  const bootstrap = service.startCallbackServer();
  const login = service.authLogin({ site: "https://site.example", sessionId: "account" });
  const authorize = new URL(await authorized.promise);
  await bootstrap;
  assert.equal(listeners, 1);
  const callback = new URL(authorize.searchParams.get("redirect_uri"));
  assert.equal(callback.toString(), "http://127.0.0.1:14876/auth/callback");
  callback.searchParams.set("code", "valid");
  callback.searchParams.set("state", authorize.searchParams.get("state"));
  assert.equal(service.handleCallback(callback.toString()), true);
  assert.equal((await login).status, "success");
});
