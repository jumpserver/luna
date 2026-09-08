import { WebContentsView, session as electronSession } from "electron";
import {
  buildAutofillProbeScript,
  buildAutofillScript,
  buildLoginSuccessProbeScript,
  createCredentialSession,
  normalizedWebOrigin,
  releaseCredentials
} from "./credentials";
import { WebProxyInteraction, buildInteractionGuardScript, INTERACTION_WORLD } from "./interaction";
import { WebProxyScript, installWebProxyNavigationGuard } from "./script";
import { WebProxyRecording } from "./recording";
const parseUrl = (value) => new URL(value);

interface ManagerOptions {
  emit: (name: string, payload: any, hostLabel?: string) => void;
  labelForWindow: (window: any) => string;
  log?: Pick<Console, "info" | "warn" | "error">;
  requireRecording?: boolean;
  direct?: boolean;
  createSession?: () => Promise<any>;
}
export function createWebProxyManager({
  emit: emitDesktopEvent,
  labelForWindow,
  log: electronLog = console,
  requireRecording = false,
  direct = false,
  createSession
}: ManagerOptions) {
  const webProxyViews = new Map();
  function parseWebProxyUrl(rawUrl, schemes, description) {
    const url = parseUrl(rawUrl);
    if (!schemes.includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error(`${description} must use ${schemes.join("/")} and must not contain credentials`);
    }
    return url;
  }

  function validateWebProxyLabel(label) {
    if (!/^web-proxy-[\w/:-]+$/.test(label)) throw new Error("invalid Web Proxy view label");
  }

  function webProxyView(event, label) {
    validateWebProxyLabel(label);
    const managed = webProxyViews.get(label);
    if (!managed || managed.hostWebContentsId !== event.sender.id) throw new Error("Web Proxy view not found");
    return managed;
  }

  function emitWebProxyState(managed, overrides = {}) {
    const url = managed.view.webContents.getURL() || managed.targetUrl;
    const state = {
      label: managed.label,
      url,
      title: managed.view.webContents.getTitle(),
      loading: managed.view.webContents.isLoading(),
      error: managed.autofillFailure,
      autofillPending: managed.autofillPending,
      autofillStartedAt: managed.autofillStartedAt,
      autofillPreviewFrozen: managed.autofillPreviewFrozen,
      interactivePending: Boolean(managed.interactiveStarted && managed.autofillPending),
      interactiveCanComplete: Boolean(managed.interactiveStarted && managed.autofillPending),
      ...overrides
    };
    if (state.error) state.loading = false;
    emitDesktopEvent("web-proxy-state", state, managed.hostLabel);
  }

  async function captureWebProxyPreview(managed) {
    if (
      !managed.autofillPending ||
      managed.autofillPreviewFrozen ||
      !managed.active ||
      managed.view.webContents.isDestroyed()
    )
      return;
    if (managed.autofillPreviewPending) return managed.autofillPreviewPending;
    // Capture the visible, input-shielded page before releasing any credentials.
    managed.autofillPreviewPending = (async () => {
      try {
        let image = await managed.view.webContents.capturePage(undefined, { stayHidden: true });
        if (
          !managed.autofillPending ||
          managed.autofillPreviewFrozen ||
          webProxyViews.get(managed.label) !== managed ||
          image.isEmpty()
        )
          return;
        if (image.getSize().width > 1280) image = image.resize({ width: 1280 });
        emitWebProxyState(managed, { preview: `data:image/jpeg;base64,${image.toJPEG(65).toString("base64")}` });
      } catch {
        // A navigation can invalidate a capture. Keep the last safe preview.
      }
    })();
    try {
      await managed.autofillPreviewPending;
    } finally {
      managed.autofillPreviewPending = null;
    }
  }

  function clearWebProxyAutofillWait(managed) {
    clearAutofillTimeout(managed);
    clearTimeout(managed.autofillDeadline);
    managed.autofillDeadline = null;
  }

  function startWebProxyAutofillWait(managed) {
    managed.autofillDeadline = setTimeout(() => {
      finishWebProxyAutofill(managed, "error", "安全登录超时（60 秒），请检查网络或登录配置后重新连接");
    }, 60_000);
    emitWebProxyAutofillState(managed, "ready", "正在建立安全登录会话");
    emitWebProxyState(managed);
  }

  function syncWebProxyVisibility(managed) {
    const previewing = managed.autofillPending && !managed.autofillPreviewFrozen;
    const visible = managed.active && (!managed.autofillVisibilityBlocked || previewing);
    managed.view.setVisible(visible);
    managed.inputShield?.setVisible(managed.active && previewing);
    if (visible) (previewing ? managed.inputShield : managed.view)?.webContents.focus();
  }

  function removeWebProxyInputShield(managed) {
    if (!managed.inputShield) return;
    managed.host.contentView.removeChildView(managed.inputShield);
    managed.inputShield.webContents.close();
    managed.inputShield = null;
  }

  function emitWebProxyAutofillState(managed, status, message) {
    emitDesktopEvent("web-proxy-autofill-state", { label: managed.label, status, message }, managed.hostLabel);
  }

  function emitWebProxyRecordingState(managed, state) {
    emitDesktopEvent("web-proxy-recording-state", state, managed.hostLabel);
  }

  function setWebProxyRecordingPaused(managed, reason, paused, message) {
    managed.recording?.setPaused(reason, paused, message);
  }

  function clearAutofillTimeout(managed) {
    clearTimeout(managed.autofillTimeout);
    managed.autofillTimeout = null;
    clearInterval(managed.autofillProbeTimer);
    managed.autofillProbeTimer = null;
  }

  function finishWebProxyAutofill(managed, status, message) {
    if (!managed.autofillPending) return;
    managed.autofillScript?.cancel();
    managed.autofillScript = null;
    clearWebProxyAutofillWait(managed);
    void managed.interaction?.dispose();
    managed.interaction = null;
    managed.interactiveStarted = false;
    managed.autofillPending = false;
    managed.autofillProbeId += 1;
    managed.credentialSession?.dispose?.();
    managed.credentialSession = null;
    managed.autofillInProgress = false;
    managed.autofillFailure = status === "error" ? message : "";
    managed.autofillVisibilityBlocked = status === "error";
    setWebProxyRecordingPaused(
      managed,
      "autofill",
      status === "error" && managed.autofillPreviewFrozen,
      status === "error" ? "账号代填登录失败" : "账号代填完成，继续录像"
    );
    if (status === "error") managed.view.webContents.stop();
    emitWebProxyAutofillState(managed, status, message);
    emitWebProxyState(managed);
    syncWebProxyVisibility(managed);
    removeWebProxyInputShield(managed);
  }

  async function completeWebProxyVerification(managed) {
    if (managed.autofillScript) return managed.autofillScript.completeVerification();
    const interaction = managed.interaction;
    if (!managed.active || !managed.autofillPending || !managed.interactiveStarted || !interaction) return false;
    if (!(await interaction.submit()) || !managed.autofillPending || managed.interaction !== interaction) return false;
    emitWebProxyAutofillState(managed, "submitted", "已提交登录，正在等待登录结果");
    if (managed.autofillSuccessSelector) {
      void checkWebProxyLoginSuccess(managed);
      return true;
    }
    if (!(await interaction.complete()) || !managed.autofillPending || managed.interaction !== interaction)
      return false;
    finishWebProxyAutofill(managed, "submitted", "已完成验证并提交登录");
    return true;
  }

  async function checkWebProxyLoginSuccess(managed) {
    if (
      !managed.autofillPending ||
      !managed.autofillInProgress ||
      managed.autofillScript ||
      (!managed.autofillSuccessSelector && !managed.interaction) ||
      managed.autofillSuccessProbePending ||
      managed.view.webContents.isDestroyed()
    ) {
      return;
    }
    managed.autofillSuccessProbePending = true;
    try {
      const interaction = managed.interaction;
      if (interaction && !managed.interactiveStarted) {
        const phase = await interaction.advanceLogin();
        if (!managed.autofillPending || managed.interaction !== interaction) return;
        if (phase === "submitted") emitWebProxyAutofillState(managed, "submitted", "已提交登录，正在等待登录结果");
        if (phase === "complete" && !managed.autofillSuccessSelector && !managed.interactiveStarted) {
          if (!(await interaction.complete(true)) || !managed.autofillPending || managed.interaction !== interaction)
            return;
          finishWebProxyAutofill(managed, "submitted", "已提交登录，登录页面已结束");
          return;
        }
      }
      if (!managed.autofillSuccessSelector) return;
      const success = await managed.view.webContents.executeJavaScript(
        buildLoginSuccessProbeScript(managed.autofillSuccessSelector, true),
        true
      );
      if (success) {
        if (managed.interaction && !(await managed.interaction.complete())) return;
        // Await credential cleanup and guard teardown before exposing the session.
        finishWebProxyAutofill(managed, "success", "已检测到登录成功标记");
      }
    } catch {
      // A full-page login redirects while this probe is running. The timer retries
      // against the new document until the success marker appears or times out.
    } finally {
      managed.autofillSuccessProbePending = false;
    }
  }

  async function tryWebProxyAutofill(managed) {
    const session = managed.credentialSession;
    if (!session || !managed.autofillPending || managed.autofillInProgress || managed.view.webContents.isDestroyed())
      return;
    if (session.mode === "script") {
      managed.autofillInProgress = true;
      await captureWebProxyPreview(managed);
      if (!managed.autofillPending || managed.view.webContents.isDestroyed()) return;
      managed.autofillPreviewFrozen = true;
      syncWebProxyVisibility(managed);
      removeWebProxyInputShield(managed);
      setWebProxyRecordingPaused(managed, "autofill", true, "登录脚本执行期间暂停录像");
      emitWebProxyState(managed);
      const runner = new WebProxyScript(managed.view.webContents, session, {
        active: () => managed.active && managed.autofillPending,
        state: (status, message) => emitWebProxyAutofillState(managed, status, message),
        frame: (frame) => emitDesktopEvent("web-proxy-interaction", { label: managed.label, frame }, managed.hostLabel),
        interaction: (interaction, ready) => {
          managed.interaction = interaction;
          managed.interactiveStarted = ready;
          if (managed.autofillPending && !managed.view.webContents.isDestroyed()) emitWebProxyState(managed);
        }
      });
      managed.autofillScript = runner;
      try {
        if (managed.recording?.capturePending) await managed.recording.capturePending.catch(() => undefined);
        if (!managed.autofillPending) return;
        clearWebProxyAutofillWait(managed);
        const status = await runner.run();
        finishWebProxyAutofill(managed, status, status === "success" ? "已检测到登录成功标记" : "登录脚本已执行完成");
      } catch (error) {
        if (managed.autofillPending)
          finishWebProxyAutofill(managed, "error", error instanceof Error ? error.message : "登录脚本执行失败");
      }
      return;
    }
    let currentOrigin;
    try {
      currentOrigin = normalizedWebOrigin(managed.view.webContents.getURL());
    } catch {
      return;
    }
    if (currentOrigin !== session.origin) return;

    const probeId = ++managed.autofillProbeId;
    const isCurrent = () =>
      managed.autofillPending && probeId === managed.autofillProbeId && !managed.view.webContents.isDestroyed();
    try {
      const alreadyLoggedIn = await managed.view.webContents.executeJavaScript(
        buildLoginSuccessProbeScript(session.selectors.success, true),
        true
      );
      if (alreadyLoggedIn && isCurrent() && managed.credentialSession === session) {
        managed.autofillInProgress = true;
        finishWebProxyAutofill(managed, "success", "已检测到登录成功标记");
        return;
      }
    } catch {
      return;
    }
    if (!isCurrent()) return;

    emitWebProxyAutofillState(managed, "ready", "等待登录表单");
    let ready = false;
    try {
      ready = await managed.view.webContents.executeJavaScript(buildAutofillProbeScript(session.selectors), true);
    } catch {
      return;
    }
    if (!isCurrent() || managed.credentialSession !== session) return;
    if (!ready) {
      managed.autofillInProgress = true;
      finishWebProxyAutofill(managed, "error", "登录失败：15 秒内未找到登录元素");
      return;
    }

    managed.autofillInProgress = true;
    await captureWebProxyPreview(managed);
    if (!isCurrent()) return;
    // ponytail: submission uses the last safe frame; showing live submission would
    // require a trusted native compositor that redacts credentials in every frame.
    managed.autofillPreviewFrozen = true;
    syncWebProxyVisibility(managed);
    removeWebProxyInputShield(managed);
    emitWebProxyState(managed);
    setWebProxyRecordingPaused(managed, "autofill", true, "账号代填期间暂停录像");
    emitWebProxyAutofillState(
      managed,
      "filling",
      session.selectors.interactive ? "正在安全代填账号密码" : "正在安全代填并提交"
    );
    if (managed.recording?.capturePending) await managed.recording.capturePending.catch(() => undefined);

    let credentials;
    try {
      if (!isCurrent()) return;
      if (session.selectors.interactive) {
        // Retain the original credential nodes before the site's submit handler can
        // rename or replace them. User input is still blocked by the hidden view.
        await managed.view.webContents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [
          {
            code: buildInteractionGuardScript(session.selectors, session.origin, false)
          }
        ]);
        if (!isCurrent()) return;
      }
      credentials = await releaseCredentials(session, managed.view.webContents.getURL());
      if (!isCurrent()) return;
      const script = buildAutofillScript(session.selectors, credentials);
      credentials.username = "";
      credentials.password = "";
      const filled = await managed.view.webContents.executeJavaScript(script, true);
      if (!isCurrent()) return;
      if (!filled) throw new Error("登录元素在代填前发生变化");
      if (!session.selectors.success && !session.selectors.interactive) {
        finishWebProxyAutofill(managed, "submitted", "已代填并提交登录");
        return;
      }
      managed.autofillSuccessSelector = session.selectors.success;
      emitWebProxyAutofillState(
        managed,
        "filling",
        session.selectors.interactive ? "已代填账号密码，正在检查登录页面" : "已提交登录，正在验证登录结果"
      );
      clearAutofillTimeout(managed);
      managed.autofillTimeout = setTimeout(() => {
        finishWebProxyAutofill(
          managed,
          "error",
          session.selectors.success ? "登录失败：20 秒内未检测到登录成功标记" : "登录失败：20 秒内未检测到登录完成"
        );
      }, 20_000);
      if (session.selectors.interactive) {
        managed.interaction = new WebProxyInteraction(
          managed.view.webContents,
          session.selectors,
          session.origin,
          () => managed.active && managed.autofillPending,
          (frame) => emitDesktopEvent("web-proxy-interaction", { label: managed.label, frame }, managed.hostLabel),
          () => {
            if (!managed.autofillPending || managed.interactiveStarted) return;
            managed.interactiveStarted = true;
            clearTimeout(managed.autofillDeadline);
            clearTimeout(managed.autofillTimeout);
            managed.autofillStartedAt = Date.now();
            managed.autofillTimeout = setTimeout(() => {
              finishWebProxyAutofill(managed, "error", "人工验证超时（3 分钟），请重新连接");
            }, 180_000);
            emitWebProxyAutofillState(managed, "interactive", "请完成验证，然后点击“完成交互”提交登录");
            emitWebProxyState(managed);
          }
        );
      }
      managed.autofillProbeTimer = setInterval(() => void checkWebProxyLoginSuccess(managed), 250);
      void checkWebProxyLoginSuccess(managed);
    } catch (error) {
      if (isCurrent()) finishWebProxyAutofill(managed, "error", String(error instanceof Error ? error.message : error));
    } finally {
      if (credentials) {
        credentials.username = "";
        credentials.password = "";
      }
    }
  }

  async function captureWebProxyFrame(managed) {
    if (managed.view.webContents.isDestroyed()) throw new Error("Web Proxy 视图已关闭");
    const image = await managed.view.webContents.capturePage(undefined, { stayHidden: true });
    if (image.isEmpty()) throw new Error("Web Proxy 截图为空");
    const jpeg = image.toJPEG(70);
    const bitmap = image.resize({ width: 160, height: 90, quality: "good" }).toBitmap();
    const signature = Buffer.allocUnsafe(160 * 90);
    for (let pixel = 0; pixel < signature.length; pixel += 1) {
      const offset = pixel * 4;
      signature[pixel] = Math.round(bitmap[offset + 2] * 0.299 + bitmap[offset + 1] * 0.587 + bitmap[offset] * 0.114);
    }
    return { jpeg, signature };
  }

  async function createWebProxyView(event, win, args) {
    const label = String(args.label || "");
    validateWebProxyLabel(label);
    if (webProxyViews.has(label)) throw new Error("Web Proxy view label already exists");
    const target = parseWebProxyUrl(args.targetUrl, ["http:", "https:"], "Website URL");
    const proxy = direct ? null : parseWebProxyUrl(args.proxyUrl, ["http:", "socks5:"], "Koko Web Proxy URL");
    if (args.safeMode !== undefined && typeof args.safeMode !== "boolean")
      throw new Error("invalid Web Proxy safe mode");
    const safeMode = args.safeMode === true;
    const proxySession = electronSession.fromPartition(`web-proxy:${label}`, { cache: false });
    if (proxy) {
      const proxyRules =
        proxy.protocol === "socks5:" ? `socks5://${proxy.host}` : `http=${proxy.host};https=${proxy.host}`;
      await proxySession.setProxy({ mode: "fixed_servers", proxyRules });
    } else {
      await proxySession.setProxy({ mode: "direct" });
    }

    const view = new WebContentsView({
      webPreferences: {
        session: proxySession,
        devTools: !safeMode,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    // A separate native surface catches mouse and keyboard input above the target.
    // Unlike a DOM overlay injected into the target, the website cannot remove it.
    const inputShield = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    inputShield.setBackgroundColor("#00000000");
    inputShield.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    inputShield.webContents.on("will-navigate", (event) => event.preventDefault());
    const managed = {
      label,
      view,
      inputShield,
      webContents: view.webContents,
      host: win,
      hostLabel: labelForWindow(win),
      hostWebContentsId: event.sender.id,
      targetUrl: target.toString(),
      proxyUrl: proxy?.toString() || "",
      safeMode,
      credentialSession: null,
      autofillScript: null,
      autofillPending: true,
      autofillStartedAt: Date.now(),
      autofillDeadline: null,
      autofillPreviewPending: null,
      autofillPreviewFrozen: false,
      autofillInProgress: false,
      interaction: null,
      interactiveStarted: false,
      autofillProbeId: 0,
      autofillTimeout: null,
      autofillProbeTimer: null,
      autofillSuccessProbePending: false,
      autofillSuccessSelector: "",
      autofillFailure: "",
      autofillVisibilityBlocked: true,
      active: false,
      recording: null,
      webSessionPromise: null,
      webSessionError: null
    };
    webProxyViews.set(label, managed);
    electronLog.info(`web proxy open ${label} ${target.origin}`);
    view.setVisible(false);
    inputShield.setVisible(false);
    win.contentView.addChildView(view);
    win.contentView.addChildView(inputShield);
    view.setBounds({
      x: Math.max(0, Math.round(Number(args.x) || 0)),
      y: Math.max(0, Math.round(Number(args.y) || 0)),
      width: Math.max(1, Math.round(Number(args.width) || 1)),
      height: Math.max(1, Math.round(Number(args.height) || 1))
    });
    inputShield.setBounds(view.getBounds());
    // Keep the shield transparent; progress and actions live in the Nuxt toolbar.
    void inputShield.webContents.loadURL("data:text/html,<html style='background:transparent'></html>").catch(() => {
      if (!view.webContents.isDestroyed()) finishWebProxyAutofill(managed, "error", "无法显示安全登录遮罩，请重新连接");
    });
    view.webContents.on("before-input-event", (event) => {
      if (managed.autofillVisibilityBlocked && !managed.interaction) event.preventDefault();
    });
    view.webContents.on("focus", () => {
      if (managed.autofillVisibilityBlocked && managed.active) {
        (managed.inputShield?.webContents || managed.host.webContents).focus();
      }
    });
    syncWebProxyVisibility(managed);
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Separate popup login windows need their own guarded session ownership.
      if (managed.safeMode || managed.autofillPending) return { action: "deny" };
      try {
        const next = parseWebProxyUrl(url, ["http:", "https:"], "Website URL");
        void view.webContents.loadURL(next.toString());
      } catch {
        // Invalid external URLs remain blocked by the deny response below.
      }
      return { action: "deny" };
    });
    installWebProxyNavigationGuard(view.webContents, (message) => {
      if (managed.autofillPending) finishWebProxyAutofill(managed, "error", message);
    });
    view.webContents.on("before-mouse-event", (inputEvent, mouse) => {
      if (managed.safeMode && (mouse.button === "right" || mouse.type === "contextMenu")) {
        inputEvent.preventDefault();
      }
    });
    view.webContents.on("context-menu", (contextEvent) => {
      if (managed.safeMode) contextEvent.preventDefault();
    });
    view.webContents.on("before-input-event", (inputEvent, input) => {
      if (!managed.safeMode) return;
      const key = input.key.toLowerCase();
      if (
        key === "contextmenu" ||
        (input.shift && key === "f10") ||
        ((input.control || input.meta) && ["l", "o", "t", "n"].includes(key))
      ) {
        inputEvent.preventDefault();
      }
    });
    view.webContents.on("did-start-navigation", (navigation) => {
      if (navigation.isMainFrame) managed.interaction?.invalidate();
    });
    view.webContents.on("did-start-loading", () => emitWebProxyState(managed, { loading: true }));
    view.webContents.on("did-stop-loading", () => emitWebProxyState(managed, { loading: false }));
    view.webContents.on("dom-ready", () => {
      if (managed.credentialSession) void tryWebProxyAutofill(managed);
    });
    view.webContents.on("did-finish-load", () => {
      if (managed.autofillInProgress) void checkWebProxyLoginSuccess(managed);
      else void tryWebProxyAutofill(managed);
    });
    view.webContents.on("page-title-updated", () => emitWebProxyState(managed, { loading: false }));
    view.webContents.on("did-fail-load", (_loadEvent, code, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      electronLog.warn(`web proxy load failed ${label}: ${description}`);
      if (managed.autofillPending) {
        finishWebProxyAutofill(managed, "error", `登录页面加载失败：${description}`);
        return;
      }
      emitWebProxyState(managed, { url: validatedUrl, loading: false, error: description });
    });
    startWebProxyAutofillWait(managed);
    managed.webSessionPromise = (
      createSession
        ? createSession()
        : createCredentialSession(
            proxy,
            target,
            String(args.tokenId || ""),
            String(args.tokenValue || ""),
            String(args.successSelector || ""),
            String(args.interactiveSelector || "")
          )
    )
      .then(async (session) => {
        if (!managed.autofillPending || view.webContents.isDestroyed() || webProxyViews.get(label) !== managed) return;
        managed.credentialSession = session?.autofillAvailable ? session : null;
        if (managed.credentialSession) {
          emitWebProxyAutofillState(managed, "ready", "正在加载登录页面");
        } else {
          finishWebProxyAutofill(managed, "unavailable", "资产未启用账号代填");
        }
        if (requireRecording) {
          managed.recording = await WebProxyRecording.start({
            label,
            sessionId: session.sessionId,
            targetUrl: target.toString(),
            proxyUrl: proxy?.toString() || "",
            width: view.getBounds().width,
            height: view.getBounds().height,
            capture: () => captureWebProxyFrame(managed),
            emit: (state) => emitWebProxyRecordingState(managed, state)
          });
          managed.recording.setPaused("inactive", !managed.active, "等待显示 Web 窗口");
          if (managed.autofillFailure || view.webContents.isDestroyed() || webProxyViews.get(label) !== managed) {
            managed.recording.setPaused("closed", true, "会话已结束");
            await managed.recording.finish();
            managed.recording.dispose();
            return session;
          }
        }
        // Prepare the login session before loading; the first response may
        // immediately redirect to the SSO page used by the script.
        void view.webContents.loadURL(target.toString()).catch((error) => {
          if (managed.autofillPending)
            finishWebProxyAutofill(managed, "error", String(error instanceof Error ? error.message : error));
        });
        return session;
      })
      .catch((error) => {
        managed.webSessionError = error;
        electronLog.warn(`web proxy autofill failed ${label}`, error);
        if (!view.webContents.isDestroyed()) {
          const message = String(error instanceof Error ? error.message : error);
          if (requireRecording) managed.autofillPending = true;
          finishWebProxyAutofill(managed, "error", message);
        }
        return null;
      });
    return { label, url: target.toString(), title: "", loading: true, error: "" };
  }

  async function closeWebProxyView(event, label) {
    const managed = webProxyView(event, label);
    electronLog.info(`web proxy close ${label}`);
    webProxyViews.delete(label);
    managed.autofillPending = false;
    managed.autofillProbeId += 1;
    managed.autofillScript?.cancel();
    await managed.interaction?.dispose();
    clearWebProxyAutofillWait(managed);
    managed.view.setVisible(false);
    removeWebProxyInputShield(managed);
    try {
      await managed.recording?.finish();
    } catch (error) {
      electronLog.warn(`failed to finish Web recording for ${label}`, error);
    }
    managed.recording?.dispose();
    managed.credentialSession?.dispose?.();
    managed.credentialSession = null;
    managed.host.contentView.removeChildView(managed.view);
    managed.view.webContents.close();
  }

  async function invoke(command, event, win, args) {
    if (command === "create_web_proxy_view") return createWebProxyView(event, win, args);
    if (command === "set_web_proxy_view_active") {
      const managed = webProxyView(event, args.label);
      const active = Boolean(args.active);
      managed.active = active;
      if (!active) managed.interaction?.invalidate();
      syncWebProxyVisibility(managed);
      setWebProxyRecordingPaused(
        managed,
        "inactive",
        !active,
        active ? "Website 标签已激活，继续录像" : "Website 标签在后台，暂停录像"
      );
      return null;
    }
    if (command === "set_web_proxy_view_bounds") {
      const managed = webProxyView(event, args.label);
      const bounds = {
        x: Math.max(0, Math.round(Number(args.x) || 0)),
        y: Math.max(0, Math.round(Number(args.y) || 0)),
        width: Math.max(1, Math.round(Number(args.width) || 1)),
        height: Math.max(1, Math.round(Number(args.height) || 1))
      };
      managed.interaction?.invalidate();
      // Grow the shield before the target, so resizing cannot expose an input edge.
      managed.inputShield?.setBounds(bounds);
      managed.view.setBounds(bounds);
      return null;
    }
    if (command === "navigate_web_proxy_view") {
      webProxyView(event, args.label);
      throw new Error("当前不支持手动输入地址，请通过页面内链接访问");
    }
    if (command === "reload_web_proxy_view") {
      const managed = webProxyView(event, args.label);
      if (managed.autofillVisibilityBlocked) throw new Error("安全登录期间无法刷新，请等待或重新连接");
      return managed.view.webContents.reload();
    }
    if (command === "history_web_proxy_view") {
      const managed = webProxyView(event, args.label);
      if (managed.autofillVisibilityBlocked) throw new Error("安全登录期间无法导航，请等待或重新连接");
      const history = managed.view.webContents.navigationHistory;
      if (args.direction === "back" && history.canGoBack()) history.goBack();
      else if (args.direction === "forward" && history.canGoForward()) history.goForward();
      else if (!["back", "forward"].includes(args.direction)) throw new Error("invalid history direction");
      return null;
    }
    if (command === "complete_web_proxy_verification") {
      return completeWebProxyVerification(webProxyView(event, args.label));
    }
    if (command === "web_proxy_interaction_input") {
      const managed = webProxyView(event, args.label);
      if (!managed.active || !managed.autofillPending || !managed.interaction) return false;
      return managed.interaction.input(args.input);
    }
    if (command === "start_web_proxy_recording") {
      if (direct) throw new Error("Applet Web 录像未启用");
      const managed = webProxyView(event, args.label);
      if (managed.recording) {
        if (requireRecording) return managed.recording.state("recording", "Web 录像已准备");
        throw new Error("当前 Website 标签已在录像");
      }
      const target = parseWebProxyUrl(args.targetUrl, ["http:", "https:"], "Website URL");
      const proxy = parseWebProxyUrl(args.proxyUrl, ["http:"], "Koko Web Proxy URL");
      if (target.toString() !== managed.targetUrl || proxy.toString() !== managed.proxyUrl) {
        throw new Error("Web 录像参数与当前 Website 会话不匹配");
      }
      try {
        const webSession = await managed.webSessionPromise;
        if (!webSession?.sessionId) {
          throw managed.webSessionError || new Error("Koko Web 会话尚未建立");
        }
        if (webProxyViews.get(managed.label) !== managed) return;
        if (requireRecording && managed.recording) {
          return managed.recording.state(
            managed.recording.pauseReasons.size ? "paused" : "recording",
            "Web 录像已准备"
          );
        }
        const recording = await WebProxyRecording.start({
          label: managed.label,
          sessionId: webSession.sessionId,
          targetUrl: target.toString(),
          proxyUrl: proxy?.toString() || "",
          width: Math.round(Number(args.width)),
          height: Math.round(Number(args.height)),
          capture: () => captureWebProxyFrame(managed),
          emit: (state) => emitWebProxyRecordingState(managed, state)
        });
        if (webProxyViews.get(managed.label) !== managed) {
          recording.setPaused("inactive", true, "Website 标签已关闭");
          try {
            await recording.finish();
          } finally {
            recording.dispose();
          }
          return;
        }
        managed.recording = recording;
        if (!managed.active) {
          managed.recording.setPaused("inactive", true, "Website 标签在后台，暂停录像");
        }
        if (managed.autofillPreviewFrozen && managed.autofillVisibilityBlocked) {
          managed.recording.setPaused("autofill", true, "账号代填期间暂停录像");
        }
        electronLog.info(`web proxy recording start ${managed.label}`);
        return managed.recording.state(managed.recording.pauseReasons.size ? "paused" : "recording", "Web 录像已开始");
      } catch (error) {
        electronLog.error(`web proxy recording start failed ${managed.label}`, error);
        emitWebProxyRecordingState(managed, {
          label: managed.label,
          status: "error",
          frameCount: 0,
          message: String(error instanceof Error ? error.message : error),
          path: ""
        });
        throw error;
      }
    }
    if (command === "stop_web_proxy_recording") {
      const managed = webProxyView(event, args.label);
      if (!managed.recording) return null;
      try {
        electronLog.info(`web proxy recording stop ${managed.label}`);
        return await managed.recording.finish();
      } catch (error) {
        electronLog.error(`web proxy recording stop failed ${managed.label}`, error);
        emitWebProxyRecordingState(managed, {
          label: managed.label,
          status: "error",
          frameCount: managed.recording.frameCount,
          message: String(error instanceof Error ? error.message : error),
          path: ""
        });
        throw error;
      } finally {
        managed.recording.dispose();
        managed.recording = null;
      }
    }
    if (command === "close_web_proxy_view") return closeWebProxyView(event, args.label);

    throw new Error("Unsupported Web Proxy command");
  }
  function disposeHost(windowWebContentsId) {
    for (const [viewLabel, managed] of webProxyViews) {
      if (managed.hostWebContentsId !== windowWebContentsId) continue;
      webProxyViews.delete(viewLabel);
      managed.credentialSession?.dispose?.();
      managed.autofillScript?.cancel();
      void managed.interaction?.dispose();
      managed.autofillPending = false;
      managed.autofillProbeId += 1;
      clearWebProxyAutofillWait(managed);
      if (managed.inputShield && !managed.inputShield.webContents.isDestroyed())
        managed.inputShield.webContents.close();
      void managed.recording?.finish().catch((error) => {
        electronLog.warn(`failed to finish Web recording for ${viewLabel}`, error);
      });
      if (!managed.webContents.isDestroyed()) managed.webContents.close();
    }
  }
  return { invoke, disposeHost, views: webProxyViews };
}
