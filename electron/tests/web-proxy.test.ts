import type { Server } from "node:http";
import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { pack as createTarPack } from "tar-stream";
import { OfflineRecordingStore } from "../src/replay/offline-recordings.ts";
import { requestWebProxyControl } from "../../packages/web-proxy/src/control.ts";
import {
  createCredentialSession,
  buildLoginSuccessProbeScript,
  normalizedWebOrigin,
  releaseCredentials,
  validateWebSelector,
  exactWebOrigin,
  validateWebScript
} from "../../packages/web-proxy/src/credentials.ts";
import { signaturesDiffer } from "../../packages/web-proxy/src/recording.ts";
import { WebProxyInteraction } from "../../packages/web-proxy/src/interaction.ts";
import {
  WebProxyScript,
  installWebProxyNavigationGuard,
  webProxyNavigationPolicy
} from "../../packages/web-proxy/src/script.ts";

async function setupNavigation(safeMode: unknown, allowedUrls: unknown = [], allowManualNavigation = false) {
  const main = await readFile(new URL("../../packages/web-proxy/src/manager.ts", import.meta.url), "utf8");
  const source = [
    main.slice(main.indexOf("function parseWebProxyUrl("), main.indexOf("function emitWebProxyState(")),
    main.slice(main.indexOf("async function createWebProxyView("), main.indexOf("async function closeWebProxyView("))
  ].join("\n");
  const commands = main.slice(
    main.indexOf('  if (command === "navigate_web_proxy_view")'),
    main.indexOf('  if (command === "start_web_proxy_recording")')
  );
  const createContents = () =>
    Object.assign(new EventEmitter(), {
      loadURL: mock.fn(async (_url: string) => {}),
      debugger: { isAttached: () => false },
      reload: mock.fn(),
      isDestroyed: () => false,
      setWindowOpenHandler: mock.fn((_handler: (details: { url: string }) => { action: string }) => {}),
      navigationHistory: { canGoBack: () => true, canGoForward: () => true, goBack: mock.fn(), goForward: mock.fn() }
    });
  const contents = createContents();
  const state = mock.fn();
  const finishAutofill = mock.fn();
  let preferences: any;
  const views = new Map();
  const scope = {
    requireRecording: false,
    direct: false,
    allowManualNavigation,
    createSession: undefined,
    parseUrl: (value) => new URL(value),
    normalizedWebOrigin,
    installWebProxyNavigationGuard,
    webProxyNavigationPolicy,
    webProxyViews: views,
    electronSession: { fromPartition: () => ({ setProxy: async () => {} }) },
    WebContentsView: class {
      webContents: ReturnType<typeof createContents>;
      constructor(options) {
        this.webContents = options.webPreferences.session ? contents : createContents();
        if (options.webPreferences.session) preferences = options.webPreferences;
      }
      setVisible() {}
      setBounds() {}
      setBackgroundColor() {}
      getBounds() {
        return { x: 0, y: 0, width: 800, height: 600 };
      }
    },
    labelForWindow: () => "main",
    electronLog: { info() {}, warn() {} },
    startWebProxyAutofillWait() {},
    syncWebProxyVisibility() {},
    createCredentialSession: async () => ({
      sessionId: "core-session",
      proxyAuth: { username: "token-id", password: "ticket-value" },
      autofillAvailable: false
    }),
    finishWebProxyAutofill: finishAutofill,
    emitWebProxyState: state,
    event: { sender: { id: 1 } },
    win: { contentView: { addChildView() {} } }
  };
  const api = new Function(
    ...Object.keys(scope),
    `${source}\nreturn {
      create: (args) => createWebProxyView(event, win, args),
      invoke: async (command, args) => { ${commands} }
    };`
  )(...Object.values(scope));
  const label = "web-proxy-navigation-test";
  await api.create({
    label,
    targetUrl: "https://example.test/login",
    proxyUrl: "http://localhost:5001",
    safeMode,
    allowedUrls
  });
  const managed = views.get(label);
  await managed.webSessionPromise;
  managed.autofillVisibilityBlocked = false;
  managed.autofillPending = false;
  return {
    contents,
    preferences,
    state,
    managed,
    finishAutofill,
    invoke: (command, args = {}) => api.invoke(command, { label, ...args })
  };
}

test("proxy connection failures identify the selected proxy during login and later navigation", async () => {
  const { contents, state, managed, finishAutofill } = await setupNavigation(false);
  for (const description of ["ERR_TUNNEL_CONNECTION_FAILED", "ERR_PROXY_CONNECTION_FAILED"]) {
    managed.autofillPending = true;
    contents.emit("did-fail-load", {}, -111, description, "https://example.test/login", true);
    assert.equal(
      finishAutofill.mock.calls.at(-1)!.arguments[2],
      `登录页面加载失败：${description}（代理：http://localhost:5001）`
    );
    managed.autofillPending = false;
    contents.emit("did-fail-load", {}, -111, description, "https://example.test/login", true);
    assert.equal(state.mock.calls.at(-1)!.arguments[1].error, `${description}（代理：http://localhost:5001）`);
  }
  contents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "https://example.test/login", true);
  assert.equal(state.mock.calls.at(-1)!.arguments[1].error, "ERR_NAME_NOT_RESOLVED");
});

test("proxy credentials are only supplied to the configured proxy's first authentication challenge", async () => {
  const { contents, managed } = await setupNavigation(false);
  const challenge = { isProxy: true, host: "localhost", port: 5001, scheme: "basic" };
  const callback = mock.fn();
  const event = { preventDefault: mock.fn() };
  contents.emit("login", event, { firstAuthAttempt: true }, challenge, callback);
  assert.deepEqual(callback.mock.calls.at(-1)!.arguments, ["token-id", "ticket-value"]);
  for (const authInfo of [
    { ...challenge, host: "website.test" },
    { ...challenge, port: 80 }
  ]) {
    contents.emit("login", event, { firstAuthAttempt: true }, authInfo, callback);
    assert.deepEqual(callback.mock.calls.at(-1)!.arguments, []);
  }
  contents.emit("login", event, { firstAuthAttempt: false }, challenge, callback);
  assert.deepEqual(callback.mock.calls.at(-1)!.arguments, []);
  const before = callback.mock.callCount();
  contents.emit("login", event, {}, { ...challenge, isProxy: false }, callback);
  assert.equal(callback.mock.callCount(), before);
  clearInterval(managed.proxyHeartbeatTimer);
});

test("asset navigation is unrestricted by default and matches exact sites only when configured", () => {
  for (const allowed of [undefined, []]) {
    const permits = webProxyNavigationPolicy("https://asset.test/login", allowed);
    assert.equal(permits("https://other.test/"), true);
    assert.equal(permits("http://other.test:8080/path"), true);
    assert.equal(permits("file:///tmp"), false);
  }
  const permits = webProxyNavigationPolicy("https://asset.test/login", [
    "https://SSO.test:443/",
    "http://localhost:8080"
  ]);
  for (const url of ["https://asset.test/dashboard", "https://sso.test/login?q=1", "http://localhost:8080/path"])
    assert.equal(permits(url), true, url);
  for (const url of [
    "http://asset.test",
    "https://asset.test:8443",
    "https://sso.test.evil.test",
    "https://sub.sso.test",
    "https://sso.test@evil.test",
    "https://user:pass@sso.test",
    "javascript:alert(1)"
  ])
    assert.equal(permits(url), false, url);
  for (const value of [
    null,
    "*",
    ["*"],
    ["https://sso.test/path"],
    ["file:///tmp"],
    Array(101).fill("https://sso.test")
  ])
    assert.throws(() => webProxyNavigationPolicy("https://asset.test", value));
});

test("configured asset allowlist blocks links, redirects and popups while preserving page resources", async () => {
  const { contents, state } = await setupNavigation(false, ["https://sso.test"]);
  for (const name of ["will-navigate", "will-redirect"]) {
    for (const [url, isMainFrame, denied] of [
      ["https://example.test/dashboard", true, false],
      ["https://sso.test/login", true, false],
      ["https://outside.test", true, true],
      ["https://outside.test/frame", false, false]
    ] as const) {
      const preventDefault = mock.fn();
      contents.emit(name, { url, isMainFrame, preventDefault });
      assert.equal(preventDefault.mock.callCount(), Number(denied), `${name}: ${url}`);
    }
  }
  const popup = contents.setWindowOpenHandler.mock.calls[0].arguments[0];
  popup({ url: "https://outside.test" });
  assert.equal(contents.loadURL.mock.callCount(), 1);
  assert.match(state.mock.calls.at(-1).arguments[1].navigationError, /白名单/);
  popup({ url: "https://sso.test/login" });
  assert.equal(contents.loadURL.mock.callCount(), 2);
});

test("login script open commands respect the same asset navigation allowlist", async () => {
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false, loadURL: mock.fn() });
  const runner = new WebProxyScript(
    contents,
    { steps: [{ step: 1, command: "open", url: "https://outside.test" }] },
    {
      active: () => true,
      canNavigate: webProxyNavigationPolicy("https://asset.test", ["https://sso.test"]),
      state() {},
      interaction() {},
      frame() {}
    }
  );
  await assert.rejects(runner.run(), /白名单/);
  assert.equal(contents.loadURL.mock.callCount(), 0);
});

test("safe mode blocks manual navigation and popups while allowing cross-origin links and redirects", async () => {
  const { contents, preferences, invoke } = await setupNavigation(true);
  assert.equal(preferences.devTools, false);
  await assert.rejects(invoke("navigate_web_proxy_view", { targetUrl: "https://example.test/dashboard" }), /手动输入/);
  for (const url of ["https://example.test/dashboard", "https://other.test/"]) {
    assert.deepEqual(contents.setWindowOpenHandler.mock.calls[0].arguments[0]({ url }), { action: "deny" });
  }
  assert.equal(contents.loadURL.mock.callCount(), 1); // Only the initial asset URL loaded.
  for (const name of ["will-navigate", "will-redirect"]) {
    for (const [url, blocked] of [
      ["https://example.test/dashboard", false],
      ["https://EXAMPLE.test:443/dashboard", false],
      ["https://other.test/", false],
      ["https://example.test.other.test/", false],
      ["http://example.test/", false],
      ["https://example.test:8443/", false],
      ["https://user:password@example.test/", true],
      ["javascript:alert(1)", true]
    ] as const) {
      const preventDefault = mock.fn();
      contents.emit(name, { url, isMainFrame: true, preventDefault });
      assert.equal(preventDefault.mock.callCount(), blocked ? 1 : 0, `${name}: ${url}`);
    }
  }
  await invoke("reload_web_proxy_view");
  await invoke("history_web_proxy_view", { direction: "back" });
  await invoke("history_web_proxy_view", { direction: "forward" });
  assert.equal(contents.reload.mock.callCount(), 1);
  assert.equal(contents.navigationHistory.goBack.mock.callCount(), 1);
  assert.equal(contents.navigationHistory.goForward.mock.callCount(), 1);
});

test("safe mode blocks right-click and browser entry shortcuts without blocking ordinary page input", async () => {
  for (const safeMode of [true, false]) {
    const { contents } = await setupNavigation(safeMode);
    for (const [name, input, restricted] of [
      ["before-mouse-event", { button: "right", type: "mouseDown" }, true],
      ["before-mouse-event", { type: "contextMenu" }, true],
      ["before-mouse-event", { button: "left", type: "mouseDown" }, false],
      ["context-menu", {}, true],
      ["before-input-event", { key: "ContextMenu" }, true],
      ["before-input-event", { key: "F10", shift: true }, true],
      ["before-input-event", { key: "L", control: true }, true],
      ["before-input-event", { key: "t", meta: true }, true],
      ["before-input-event", { key: "c", control: true }, false],
      ["before-input-event", { key: "n" }, false]
    ] as const) {
      const preventDefault = mock.fn();
      contents.emit(name, { preventDefault }, input);
      assert.equal(
        preventDefault.mock.callCount(),
        safeMode && restricted ? 1 : 0,
        `${safeMode}: ${JSON.stringify(input)}`
      );
    }
  }
});

test("manual navigation remains disabled outside safe mode while page navigation keeps working", async () => {
  for (const safeMode of [false, undefined]) {
    const { contents, preferences, invoke } = await setupNavigation(safeMode);
    assert.equal(preferences.devTools, true);
    for (const targetUrl of ["https://example.test/dashboard", "https://other.test/"]) {
      await assert.rejects(invoke("navigate_web_proxy_view", { targetUrl }), /手动输入/);
    }
    contents.setWindowOpenHandler.mock.calls[0].arguments[0]({ url: "https://other.test/popup" });
    assert.equal(contents.loadURL.mock.callCount(), 2);
    for (const name of ["will-navigate", "will-redirect"]) {
      const preventDefault = mock.fn();
      contents.emit(name, { url: "https://other.test/", isMainFrame: true, preventDefault });
      assert.equal(preventDefault.mock.callCount(), 0);
    }
  }
  await assert.rejects(setupNavigation("false"), /invalid Web Proxy safe mode/);
});

test("standalone browser navigation accepts only HTTP pages without unlocking managed sessions", async () => {
  const { contents, state, invoke } = await setupNavigation(false, [], true);
  await invoke("navigate_web_proxy_view", { targetUrl: "https://docs.jumpserver.org/guide/" });
  assert.equal(contents.loadURL.mock.calls.at(-1).arguments[0], "https://docs.jumpserver.org/guide/");
  assert.equal(state.mock.calls.at(-1).arguments[1].navigationError, "");
  for (const targetUrl of ["file:///tmp", "javascript:alert(1)", "https://user:secret@example.test/"])
    await assert.rejects(invoke("navigate_web_proxy_view", { targetUrl }));

  const restricted = await setupNavigation(false, ["https://sso.test"], true);
  await assert.rejects(restricted.invoke("navigate_web_proxy_view", { targetUrl: "https://outside.test/" }), /白名单/);
});

test("script supports explicit SSO origins without an asset allowlist and validates terminal success", () => {
  const origin = "https://app.example.test";
  const sso = "https://sso.example.test";
  const steps = validateWebScript(
    [
      { step: 3, command: "success", target: "id=dashboard" },
      { step: 1, command: "type", target: "id=password", value: "{SECRET}", origin: sso },
      { step: 2, command: "interactive", target: "id=mfa", origin: sso }
    ],
    origin
  );
  assert.deepEqual(
    steps.map((step) => step.command),
    ["type", "interactive", "success"]
  );
  assert.equal(steps.at(-1).origin, origin);
  assert.equal(steps[0].origin, sso);
  assert.equal(validateWebScript([{ step: 1, command: "open", value: `${sso}/login` }], origin)[0].url, `${sso}/login`);
  for (const value of [
    "https://*.example.test",
    "https://sso.example.test/path",
    "https://sso.example.test/a/..",
    "https://u@example.test",
    "https://example.test#",
    "https://example.test:99999"
  ])
    assert.throws(() => exactWebOrigin(value));
  for (const command of ["select_frame", "javascript"])
    assert.throws(() => validateWebScript([{ step: 1, command, target: "id=frame" }], origin), /不支持/);
  assert.throws(() => validateWebScript([{ step: 1, command: "open", value: "file:///tmp" }], origin), /origin/);
  assert.throws(() => validateWebScript([{ step: 1, command: "open", value: `${sso}/{SECRET}` }], origin), /凭据/);
  assert.throws(
    () =>
      validateWebScript(
        [
          { step: 1, command: "success", target: "id=x" },
          { step: 2, command: "click", target: "id=y" }
        ],
        origin
      ),
    /最后一步/
  );
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test("interactive optional accepts only booleans and preserves required verification", () => {
  const step = { step: 1, command: "interactive", target: "id=mfa" };
  const origin = "https://example.test";
  for (const optional of [true, false]) {
    assert.equal(validateWebScript([{ ...step, optional }], origin)[0].optional, optional);
  }
  for (const optional of ["true", "false", 0, 1, null]) {
    assert.throws(() => validateWebScript([{ ...step, optional }], origin), /optional/);
  }
  assert.throws(() => validateWebScript([{ ...step, command: "success", optional: true }], origin), /optional/);
});

test("optional script verification skips absent or hidden targets on a ready page without waiting", async () => {
  const origin = "https://example.test";
  for (const page of ["missing", "hidden", "other-origin"]) {
    class Element {
      isConnected = true;
      getClientRects() {
        return [];
      }
    }
    const interaction = mock.fn();
    let followingStep = false;
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      getURL: () => (page === "other-origin" ? "https://sso.example.test/login" : `${origin}/login`),
      executeJavaScriptInIsolatedWorld: async (_world, [{ code }]) => {
        if (code.includes('findElement("id=mfa")'))
          return runInNewContext(code, {
            location: { origin: new URL(contents.getURL()).origin },
            document: { readyState: "complete", getElementById: () => (page === "hidden" ? new Element() : null) },
            Element,
            addEventListener() {}
          });
        if (code.includes('findElement("id=next")')) followingStep = true;
        return true;
      }
    });
    const runner = new WebProxyScript(
      contents,
      {
        accessToken: "once",
        steps: validateWebScript(
          [
            {
              step: 1,
              command: "interactive",
              target: "id=mfa",
              ...(page === "hidden" ? { optional: true, timeout: 180 } : {})
            },
            { step: 2, command: "check", target: "id=next", origin: new URL(contents.getURL()).origin }
          ],
          origin
        )
      },
      { active: () => true, state: () => {}, interaction, frame: () => {} }
    );
    const timer = setTimeout(() => runner.cancel(new Error("Missing verification blocked the following step")), 1000);
    try {
      assert.equal(await runner.run(), "submitted", page);
      assert.equal(followingStep, true, page);
      assert.equal(interaction.mock.callCount(), 0, page);
      assert.equal(contents.listenerCount("did-start-navigation"), 0);
    } finally {
      clearTimeout(timer);
    }
  }
});

test("required script conditions still time out and cancelling optional verification still aborts", async () => {
  const origin = "https://example.test";
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => `${origin}/login`,
    executeJavaScriptInIsolatedWorld: async () => null
  });
  const runnerFor = (command, optional?) =>
    new WebProxyScript(
      contents,
      {
        accessToken: "once",
        steps: validateWebScript([{ step: 1, command, target: "id=missing", timeout: 1, optional }], origin)
      },
      { active: () => true, state: () => {}, interaction: () => {}, frame: () => {} }
    );
  for (const command of ["code", "check", "success"]) {
    await assert.rejects(runnerFor(command).run(), new RegExp(`（${command}）超时`));
  }
  await assert.rejects(runnerFor("interactive", false).run(), /（interactive）超时/);
  const cancelled = runnerFor("interactive");
  const result = cancelled.run();
  const reason = new Error("connection closed");
  cancelled.cancel(reason);
  await assert.rejects(result, (error) => error === reason);
  assert.equal(contents.listenerCount("did-start-navigation"), 0);
});

test("optional verification still requires completion once its target has appeared", async () => {
  const origin = "https://example.test";
  const interaction = mock.fn();
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => `${origin}/login`,
    executeJavaScriptInIsolatedWorld: async (_world, [{ code }]) =>
      code.includes('findElement("id=mfa")') ? "document-id" : null
  });
  const runner = new WebProxyScript(
    contents,
    {
      accessToken: "once",
      steps: validateWebScript([{ step: 1, command: "interactive", target: "id=mfa", timeout: 1 }], origin)
    },
    { active: () => true, state: () => {}, interaction, frame: () => {} }
  );
  await assert.rejects(runner.run(), /人工验证超时/);
  assert.ok(interaction.mock.calls[0].arguments[0] instanceof WebProxyInteraction);
  assert.deepEqual(interaction.mock.calls.at(-1).arguments, [null, false]);
});

async function setupAutofill() {
  // Exercise the main-process lifecycle with a fake native view, without starting
  // Electron or connecting to an asset. Keep the production functions as the SUT.
  const main = await readFile(new URL("../../packages/web-proxy/src/manager.ts", import.meta.url), "utf8");
  const source = main.slice(
    main.indexOf("function emitWebProxyState("),
    main.indexOf("async function captureWebProxyFrame(")
  );
  const events: Array<{ name: string; state: any }> = [];
  const image = { isEmpty: () => false, getSize: () => ({ width: 800 }), toJPEG: () => Buffer.from("safe preview") };
  const webContents = {
    getURL: () => "https://example.test/login",
    getTitle: () => "Login",
    isLoading: () => false,
    isDestroyed: () => false,
    focus: mock.fn(),
    stop: mock.fn(),
    capturePage: mock.fn(async (_rect?: unknown, _options?: { stayHidden: boolean }) => image),
    executeJavaScriptInIsolatedWorld: mock.fn(async () => {}),
    executeJavaScript: mock.fn(async (script: string) => script !== "success")
  };
  const shield = {
    setVisible: mock.fn((_visible: boolean) => {}),
    webContents: { focus: mock.fn(), close: mock.fn() }
  };
  const managed: Record<string, any> = {
    label: "web-proxy-test",
    view: { webContents, setVisible: mock.fn() },
    inputShield: shield,
    host: { contentView: { removeChildView: mock.fn() } },
    active: true,
    autofillPending: true,
    autofillStartedAt: Date.now(),
    autofillPreviewFrozen: false,
    autofillProbeId: 0,
    autofillFailure: "",
    autofillVisibilityBlocked: true,
    credentialSession: { origin: "https://example.test", selectors: { success: "" } },
    recording: { setPaused: mock.fn() }
  };
  const release = mock.fn(async () => ({ username: "managed-user", password: "secret" }));
  const buildScript = mock.fn(() => "fill");
  const views = new Map([[managed.label, managed]]);
  const scriptFinished = deferred<string>();
  const scriptStarted = deferred<void>();
  const script = { hooks: null as any, cancel: mock.fn(), completeVerification: mock.fn(async () => true) };
  const scope = {
    webProxyViews: views,
    emitDesktopEvent: (name, state) => events.push({ name, state }),
    normalizedWebOrigin,
    buildLoginSuccessProbeScript: () => "success",
    buildAutofillProbeScript: () => "probe",
    buildAutofillScript: buildScript,
    WebProxyScript: class {
      cancel = script.cancel;
      completeVerification = script.completeVerification;
      constructor(_contents, _session, hooks) {
        script.hooks = hooks;
      }
      run() {
        scriptStarted.resolve();
        return scriptFinished.promise;
      }
    },
    INTERACTION_WORLD: 1007,
    buildInteractionGuardScript: () => "guard",
    WebProxyInteraction: class {
      dispose = mock.fn(async () => {});
      complete = mock.fn(async (_requireNoVerification = false) => true);
      advanceLogin = mock.fn(async () => "interactive");
      submit = mock.fn(async () => true);
      constructor(_contents, _selectors, _origin, _active, _emit, ready) {
        managed.verificationReady = ready;
      }
    },
    releaseCredentials: release,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  const api = new Function(
    ...Object.keys(scope),
    `${source}\nreturn { startWebProxyAutofillWait, captureWebProxyPreview, tryWebProxyAutofill, finishWebProxyAutofill, checkWebProxyLoginSuccess, completeWebProxyVerification, emitWebProxyState, syncWebProxyVisibility };`
  )(...Object.values(scope));
  return {
    api,
    managed,
    webContents,
    shield,
    release,
    buildScript,
    events,
    image,
    views,
    script,
    scriptStarted,
    scriptFinished
  };
}

test("script login retains the hidden page and paused recording until all steps complete", async () => {
  const { api, managed, release, script, scriptStarted, scriptFinished } = await setupAutofill();
  managed.credentialSession = { mode: "script" };
  const running = api.tryWebProxyAutofill(managed);
  await scriptStarted.promise;
  assert.equal(managed.autofillPending, true);
  assert.equal(managed.autofillPreviewFrozen, true);
  assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], false);
  assert.equal(release.mock.callCount(), 0, "the basic autofill path must not reclaim script credentials");
  const interaction = { dispose: mock.fn(async () => {}) };
  script.hooks.interaction(interaction, true);
  assert.equal(managed.interactiveStarted, true);
  assert.equal(await api.completeWebProxyVerification(managed), true);
  assert.equal(script.completeVerification.mock.callCount(), 1);
  assert.equal(managed.autofillPending, true, "manual verification must only continue the script");
  script.hooks.interaction(null, false);
  scriptFinished.resolve("success");
  await running;
  assert.equal(managed.autofillPending, false);
  assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], true);
  assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], false);
});

test("shows the input shield with the live page and hides both in inactive tabs", async () => {
  const { api, managed, shield } = await setupAutofill();
  api.syncWebProxyVisibility(managed);
  assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], true);
  assert.equal(shield.setVisible.mock.calls.at(-1).arguments[0], true);
  assert.equal(shield.webContents.focus.mock.callCount(), 1);
  managed.active = false;
  api.syncWebProxyVisibility(managed);
  assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], false);
  assert.equal(shield.setVisible.mock.calls.at(-1).arguments[0], false);
});

test("ends a stalled login even before form detection starts and retains the timeout error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { api, managed, webContents, events } = await setupAutofill();
  api.startWebProxyAutofillWait(managed);
  assert.equal(events.at(-1).state.loading, false);
  assert.equal(events.at(-1).state.autofillPending, true);
  t.mock.timers.tick(60_000);
  assert.equal(managed.autofillPending, false);
  assert.equal(managed.credentialSession, null);
  assert.equal(webContents.stop.mock.callCount(), 1);
  api.emitWebProxyState(managed, { loading: true });
  assert.equal(events.at(-1).state.loading, false);
  assert.match(events.at(-1).state.error, /60 秒/);
  assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], false);
  api.finishWebProxyAutofill(managed, "success", "late success");
  assert.match(managed.autofillFailure, /60 秒/);
});

test("waits for the safe preview before releasing credentials, then hides the live page", async () => {
  const { api, managed, webContents, shield, release, events, image } = await setupAutofill();
  const capture = deferred<typeof image>();
  const released = deferred<void>();
  webContents.capturePage.mock.mockImplementation(() => capture.promise);
  release.mock.mockImplementation(async () => {
    assert.equal(managed.autofillPreviewFrozen, true);
    assert.equal(managed.view.setVisible.mock.calls.at(-1).arguments[0], false);
    assert.equal(shield.webContents.close.mock.callCount(), 1);
    released.resolve();
    return { username: "managed-user", password: "secret" };
  });
  const preview = api.captureWebProxyPreview(managed);
  const filling = api.tryWebProxyAutofill(managed);
  assert.equal(release.mock.callCount(), 0);
  capture.resolve(image);
  await preview;
  await released.promise;
  await filling;
  const count = webContents.capturePage.mock.callCount();
  await api.captureWebProxyPreview(managed);
  assert.equal(webContents.capturePage.mock.callCount(), count);
  assert.equal(webContents.capturePage.mock.calls[0].arguments[1].stayHidden, true);
  assert.ok(events.some(({ state }) => state.preview?.startsWith("data:image/jpeg;base64,")));
  assert.equal(managed.autofillVisibilityBlocked, false);
  assert.equal(managed.autofillPending, false);
});

test("discards credentials arriving after timeout and keeps recording paused", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { api, managed, release, buildScript } = await setupAutofill();
  const response = deferred<{ username: string; password: string }>();
  const requested = deferred<void>();
  release.mock.mockImplementation(() => {
    requested.resolve();
    return response.promise;
  });
  api.startWebProxyAutofillWait(managed);
  const filling = api.tryWebProxyAutofill(managed);
  await requested.promise;
  t.mock.timers.tick(60_000);
  const credentials = { username: "managed-user", password: "secret" };
  response.resolve(credentials);
  await filling;
  assert.equal(buildScript.mock.callCount(), 0);
  assert.deepEqual(credentials, { username: "", password: "" });
  assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], true);
  assert.equal(managed.autofillVisibilityBlocked, true);
});

test("does not send a late preview to a closed session", async () => {
  const { api, managed, webContents, events, image, views } = await setupAutofill();
  const capture = deferred<typeof image>();
  webContents.capturePage.mock.mockImplementation(() => capture.promise);
  const preview = api.captureWebProxyPreview(managed);
  views.delete(managed.label);
  capture.resolve(image);
  await preview;
  assert.equal(events.length, 0);
});

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  return address.port;
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("validates Web Proxy trust-boundary values", () => {
  assert.equal(normalizedWebOrigin("HTTPS://Example.com:443/login"), "https://example.com");
  assert.equal(validateWebSelector("css=input[type=password]"), "css=input[type=password]");
  assert.throws(() => validateWebSelector("javascript=alert(1)"));
  assert.throws(() => normalizedWebOrigin("file:///etc/passwd"));
});

test("decrypts the Koko-compatible one-time credential envelope", async () => {
  const { privateKey: serverPrivateKey, publicKey: serverPublicKey } = generateKeyPairSync("x25519");
  let clientPublicKey: ReturnType<typeof createPublicKey> | undefined;
  let requestCount = 0;
  let proxyUrl = "";
  const server = createServer((request, response) => {
    requestCount += 1;
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      assert.equal(
        request.url,
        requestCount === 1 ? "/_jumpserver/web-sessions/" : "/_jumpserver/web-sessions/session-id/credentials"
      );
      const body = Buffer.concat(chunks).toString("utf8");
      if (requestCount === 1) {
        const payload = JSON.parse(body);
        assert.equal(request.headers["x-koko-connect-ticket"], "ticket-value");
        clientPublicKey = createPublicKey({
          key: Buffer.from(payload.client_public_key, "base64"),
          type: "spki",
          format: "der"
        });
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            session_id: "62a7496e-369d-4f3d-b3f9-a20b61a33980",
            id: "session-id",
            access_token: "once",
            proxy_auth: "connect_ticket",
            target_url: "https://example.com/login",
            origin: "https://example.com",
            autofill_available: true,
            username_selector: "id=username",
            password_selector: "id=password",
            submit_selector: "id=submit",
            server_public_key: serverPublicKey.export({ type: "spki", format: "der" }).toString("base64")
          })
        );
        return;
      }

      assert.equal(request.headers.authorization, "Bearer once");
      assert.ok(clientPublicKey);
      const sharedSecret = diffieHellman({ privateKey: serverPrivateKey, publicKey: clientPublicKey });
      const key = Buffer.from(
        hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from("jumpserver-web-autofill-v1"), 32)
      );
      const nonce = Buffer.alloc(12, 3);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from("session-id\nhttps://example.com"));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({ username: "managed-user", password: "managed-password" })),
        cipher.final(),
        cipher.getAuthTag()
      ]);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64") }));
    });
  });
  const port = await listen(server);
  proxyUrl = `http://127.0.0.1:${port}`;

  try {
    for (const [successSelector, interactiveSelector] of [
      ["", ""],
      ["css=.dashboard", ""],
      ["", "id=mfa"],
      ["css=.dashboard", "id=mfa"]
    ]) {
      requestCount = 0;
      const session = await createCredentialSession(
        proxyUrl,
        "https://example.com/login",
        "token-id",
        "token-value",
        successSelector,
        interactiveSelector,
        "ticket-value"
      );
      assert.equal(session.sessionId, "62a7496e-369d-4f3d-b3f9-a20b61a33980");
      assert.equal(session.selectors.success, successSelector);
      assert.equal(session.selectors.interactive, interactiveSelector);
      const credentials = await releaseCredentials(session, "https://example.com/login");
      assert.deepEqual(credentials, { username: "managed-user", password: "managed-password" });
      assert.equal(session.accessToken, "");
    }
  } finally {
    await close(server);
  }
});

test("builds a login-success probe from the configured selector", () => {
  const script = buildLoginSuccessProbeScript('css=[data-state="authenticated"]');
  assert.ok(script.includes('findElement("css=[data-state=\\"authenticated\\"]")'));
});

test("skips login-success detection when no selector is configured", () => {
  assert.equal(runInNewContext(buildLoginSuccessProbeScript("")), false);
});

test("supports empty control responses returned through the Web Proxy", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const port = await listen(server);
  try {
    const response = await requestWebProxyControl(
      `http://127.0.0.1:${port}`,
      "/_jumpserver/web-recordings/session-id",
      { method: "DELETE" }
    );
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  } finally {
    await close(server);
  }
});

test("filters similar recording frames while retaining meaningful changes", () => {
  const previous = Buffer.alloc(160 * 90, 128);
  const tinyChange = Buffer.from(previous);
  tinyChange.fill(255, 0, 30);
  const meaningfulChange = Buffer.from(previous);
  meaningfulChange.fill(255, 0, 120);
  assert.equal(signaturesDiffer(previous, previous), false);
  assert.equal(signaturesDiffer(previous, tinyChange), false);
  assert.equal(signaturesDiffer(previous, meaningfulChange), true);
});

test("imports replay archives into scoped, decompressed offline entries", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jms-electron-offline-"));
  const storageRoot = path.join(temporaryRoot, "storage");
  const archivePath = path.join(temporaryRoot, "session.replay.tar");
  const pack = createTarPack();
  const chunks = [];
  pack.on("data", (chunk) => chunks.push(chunk));
  const packed = new Promise((resolve, reject) => {
    pack.on("end", resolve);
    pack.on("error", reject);
  });
  pack.entry(
    { name: "metadata/session.replay.json" },
    JSON.stringify({
      id: "session-id",
      user: "operator",
      files: [
        { name: "session.0.part.gz", start: 100, end: 200, duration: 100 },
        { name: "session.1.part.gz", start: 200, end: 400, duration: 200 }
      ]
    })
  );
  pack.entry({ name: "nested/session.1.part.gz" }, gzipSync("second-frame"));
  pack.entry({ name: "nested/session.0.part.gz" }, gzipSync("first-frame"));
  pack.finalize();
  await packed;
  await writeFile(archivePath, Buffer.concat(chunks));

  try {
    const store = new OfflineRecordingStore(storageRoot);
    await store.initialize();
    const manifest = await store.importRecording(archivePath);
    assert.equal(manifest.label, "session");
    assert.equal(manifest.metadata.source_id, "session-id");
    assert.equal(manifest.entries.length, 2);
    assert.deepEqual(
      manifest.entries.map((entry) => [entry.source_name, entry.part_index, entry.part_total, entry.start_ms]),
      [
        ["session.0.part.gz", 0, 2, 100],
        ["session.1.part.gz", 1, 2, 200]
      ]
    );
    const firstPath = await store.resolveEntry(manifest.recording_id, manifest.entries[0].entry_id);
    assert.equal(await readFile(firstPath, "utf8"), "first-frame");
    await assert.rejects(() => store.resolveEntry("../escape", "entry-00000000"));
    await store.removeRecording(manifest.recording_id);
    await assert.rejects(() => store.resolveEntry(manifest.recording_id, manifest.entries[0].entry_id));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("interactive verification replaces both automatic login deadlines without exposing the page", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { api, managed, webContents } = await setupAutofill();
  managed.credentialSession.selectors = { success: "id=success", interactive: "id=mfa" };
  api.startWebProxyAutofillWait(managed);
  await api.tryWebProxyAutofill(managed);
  const interaction = managed.interaction;
  managed.verificationReady();
  t.mock.timers.tick(60_000);
  assert.equal(managed.autofillPending, true);
  assert.equal(managed.interactiveStarted, true);
  assert.equal(managed.autofillVisibilityBlocked, true);
  assert.equal(webContents.stop.mock.callCount(), 0);
  assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], true);
  // A frame or a failed OTP must not continually extend the human deadline.
  managed.verificationReady();
  t.mock.timers.tick(120_000);
  assert.equal(managed.autofillPending, false);
  assert.match(managed.autofillFailure, /3 分钟/);
  assert.equal(interaction.dispose.mock.callCount(), 1);
  assert.equal(managed.autofillVisibilityBlocked, true);
});

test("interactive verification is torn down before the final successful session is exposed", async () => {
  const { api, managed, webContents } = await setupAutofill();
  managed.credentialSession.selectors = { success: "id=success", interactive: "id=mfa" };
  await api.tryWebProxyAutofill(managed);
  await Promise.resolve();
  const interaction = managed.interaction;
  managed.verificationReady();
  const teardown = deferred<boolean>();
  interaction.complete.mock.mockImplementation(() => teardown.promise);
  webContents.executeJavaScript.mock.mockImplementation(async () => true);
  const checked = api.checkWebProxyLoginSuccess(managed);
  await Promise.resolve();
  assert.equal(managed.autofillPending, true);
  assert.equal(managed.autofillVisibilityBlocked, true);
  teardown.resolve(true);
  await checked;
  assert.equal(interaction.complete.mock.callCount(), 1);
  assert.equal(managed.autofillPending, false);
  assert.equal(managed.interactiveStarted, false);
  assert.equal(managed.interaction, null);
  assert.equal(managed.autofillVisibilityBlocked, false);
  assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], false);
});

for (const success of ["", "id=success"]) {
  test(`optional verification allows a normal login without any verification frame (success selector: ${success || "empty"})`, async () => {
    const { api, managed, events, webContents, release } = await setupAutofill();
    managed.credentialSession.selectors = { success, interactive: "id=mfa" };
    await api.tryWebProxyAutofill(managed);
    const interaction = managed.interaction;
    // Drain the initial asynchronous page probe before simulating submission.
    await Promise.resolve();
    interaction.advanceLogin.mock.mockImplementation(async () => "submitted");
    await api.checkWebProxyLoginSuccess(managed);
    assert.equal(managed.interactiveStarted, undefined);
    assert.ok(events.some(({ state }) => state.status === "submitted"));
    assert.equal(managed.autofillPending, true);
    interaction.advanceLogin.mock.mockImplementation(async () => "complete");
    if (success) webContents.executeJavaScript.mock.mockImplementation(async () => true);
    await api.checkWebProxyLoginSuccess(managed);
    assert.equal(managed.autofillPending, false);
    assert.equal(managed.autofillFailure, "");
    assert.equal(interaction.complete.mock.calls[0].arguments[0], success ? undefined : true);
    assert.equal(release.mock.callCount(), 1);
  });

  test(`verification appearing after submission pauses the same login (success selector: ${success || "empty"})`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const { api, managed, release } = await setupAutofill();
    managed.credentialSession.selectors = { success, interactive: "id=mfa" };
    await api.tryWebProxyAutofill(managed);
    await Promise.resolve();
    const interaction = managed.interaction;
    interaction.advanceLogin.mock.mockImplementation(async () => "submitted");
    await api.checkWebProxyLoginSuccess(managed);
    managed.verificationReady();
    t.mock.timers.tick(20_000);
    assert.equal(managed.autofillPending, true);
    assert.equal(managed.interactiveStarted, true);
    assert.equal(interaction.complete.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 1);
    assert.equal(await api.completeWebProxyVerification(managed), true);
    assert.equal(interaction.submit.mock.callCount(), 1);
    api.finishWebProxyAutofill(managed, "error", "test ended");
  });

  test(`verification submits before continuing the session (success selector: ${success || "empty"})`, async () => {
    const { api, managed, events, webContents } = await setupAutofill();
    managed.credentialSession.selectors = { success, interactive: "id=mfa" };
    await api.tryWebProxyAutofill(managed);
    const interaction = managed.interaction;
    assert.equal(await api.completeWebProxyVerification(managed), false);
    managed.verificationReady();
    assert.equal(events.at(-1).state.interactiveCanComplete, true);
    await api.checkWebProxyLoginSuccess(managed);
    assert.equal(managed.autofillPending, true);
    interaction.submit.mock.mockImplementation(async () => false);
    assert.equal(await api.completeWebProxyVerification(managed), false);
    assert.ok(!events.some(({ state }) => state.status === "submitted"));
    assert.equal(interaction.complete.mock.callCount(), 0);
    assert.equal(managed.autofillVisibilityBlocked, true);
    interaction.submit.mock.mockImplementation(async () => true);
    if (success) {
      assert.equal(await api.completeWebProxyVerification(managed), true);
      assert.equal(events.at(-1).state.status, "submitted");
      assert.equal(managed.autofillPending, true);
      assert.equal(interaction.complete.mock.callCount(), 0);
      // A failed verification can be edited and submitted again without refilling.
      assert.equal(await api.completeWebProxyVerification(managed), true);
      assert.equal(managed.autofillVisibilityBlocked, true);
      webContents.executeJavaScript.mock.mockImplementation(async () => true);
      await api.checkWebProxyLoginSuccess(managed);
      assert.equal(managed.autofillPending, false);
      assert.equal(interaction.complete.mock.callCount(), 1);
      return;
    }
    interaction.complete.mock.mockImplementation(async () => false);
    assert.equal(await api.completeWebProxyVerification(managed), false);
    assert.equal(managed.autofillVisibilityBlocked, true);
    const cleared = deferred<boolean>();
    interaction.complete.mock.mockImplementation(() => cleared.promise);
    const completed = api.completeWebProxyVerification(managed);
    assert.equal(managed.autofillPending, true);
    assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], true);
    cleared.resolve(true);
    assert.equal(await completed, true);
    assert.equal(managed.autofillPending, false);
    assert.equal(managed.autofillVisibilityBlocked, false);
    assert.equal(managed.recording.setPaused.mock.calls.at(-1).arguments[1], false);
    assert.equal(events.at(-1).state.interactiveCanComplete, false);
    assert.ok(events.some(({ state }) => state.status === "submitted"));
  });

  test(`late manual completion does not unlock a timed-out page (success selector: ${success || "empty"})`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const { api, managed } = await setupAutofill();
    managed.credentialSession.selectors = { success, interactive: "id=mfa" };
    await api.tryWebProxyAutofill(managed);
    managed.verificationReady();
    const cleared = deferred<boolean>();
    managed.interaction.submit.mock.mockImplementation(() => cleared.promise);
    const completed = api.completeWebProxyVerification(managed);
    t.mock.timers.tick(180_000);
    cleared.resolve(true);
    assert.equal(await completed, false);
    assert.equal(managed.autofillVisibilityBlocked, true);
    assert.match(managed.autofillFailure, /3 分钟/);
  });
}

test("concurrent completion paths both wait for the input guard to be removed", async () => {
  const teardown = deferred<void>();
  const contents = {
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: mock.fn(() => teardown.promise)
  };
  const interaction = new WebProxyInteraction(
    contents,
    {},
    "https://example.test",
    () => false,
    () => {},
    () => {}
  );
  const first = interaction.dispose();
  const second = interaction.dispose();
  assert.equal(first, second);
  let completed = false;
  void second.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(contents.executeJavaScriptInIsolatedWorld.mock.callCount(), 1);
  teardown.resolve();
  await Promise.all([first, second]);
  assert.equal(completed, true);
});
