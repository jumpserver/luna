import type { MenuItemConstructorOptions } from "electron";
import { createReadStream, constants as fsConstants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  session as electronSession,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  protocol,
  shell,
  Tray,
  WebContentsView
} from "electron";
import * as pty from "node-pty";
import runtimePackage from "../../package.json";
import { ApplicationConfigService } from "../apps/application-config";
import { LocalApplicationLauncher } from "../apps/local-app-launcher";
import { listSystemFonts } from "../apps/system-fonts";
import { DesktopAuthService } from "../auth/service";
import { FfmpegPluginManager } from "../replay/ffmpeg-plugin";
import { OfflineRecordingStore } from "../replay/offline-recordings";
import { ReplayTranscoder } from "../replay/transcoder";
import { readableToWebBody } from "../shared/bytes";
import {
  activateDebugLogService,
  DebugLogService,
  electronLog,
  parsePersistedDebugLogEnabled
} from "../shared/debug-log";
import { parseUrl, toFetchUrl } from "../shared/url";
import {
  buildAutofillProbeScript,
  buildAutofillScript,
  createCredentialSession,
  normalizedWebOrigin,
  releaseCredentials
} from "../web-proxy/credentials";
import { WebProxyRecording } from "../web-proxy/recording";

const electronDir = __dirname;
const appRoot = app.getAppPath();
const rendererUrl = process.env.JMS_ELECTRON_RENDERER_URL || "http://localhost:3000/luna/";
const isDevelopment = process.env.JMS_ELECTRON_DEV === "1" || !app.isPackaged;
const projectRoot = isDevelopment ? path.resolve(appRoot, "..") : process.resourcesPath;
const macDockIconSize = 512;
const macDockIconInset = 48;
const trayIconSize = 16;
const defaultProductName = "JumpServer";
const productName = String(runtimePackage.productName || defaultProductName);
app.setName(productName);
if (isDevelopment) console.info(`[electron] ${app.getName()} ${app.getVersion()}`);
const windows = new Map();
const subscriptions = new Map();
const stores = new Map();
const localShellSessions = new Map();
const apiStreams = new Map();
const webProxyViews = new Map();
const allowedChenOrigins = new Set();
const allowedKokoOrigins = new Set();
const configuredConnectorSessions = new WeakSet();
const allowedPaths = new Set([os.homedir(), app.getPath("userData"), process.resourcesPath]);
let nextSubscriptionId = 1;
let nextStoreId = 1;
let tray;
let applicationConfig;
let authService;
let localApplicationLauncher;
let offlineRecordings;
let replayTranscoder;
let ffmpegPlugin;
let debugLogService;
let appIcon;

protocol.registerSchemesAsPrivileged([
  { scheme: "jms-app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  {
    scheme: "jms-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
]);

function isAllowedSender(frame) {
  if (!frame?.url) return false;
  try {
    const url = parseUrl(frame.url);
    if (url.protocol === "jms-app:") return true;
    return isDevelopment && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizedHttpOrigin(value, label) {
  const url = parseUrl(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error(`${label} must be an HTTP/HTTPS origin without credentials`);
  }
  return url.origin;
}

async function resolveChenEndpoint() {
  const configured = String(process.env.JMS_CHEN_DESKTOP_URL || process.env.JMS_CHEN_DEV_URL || "").trim();
  if (configured) {
    const origin = normalizedHttpOrigin(configured, "Chen endpoint");
    allowedChenOrigins.add(origin);
    electronLog.info(`chen endpoint ${origin}`);
    return origin;
  }

  const siteOrigin = normalizedHttpOrigin(authService.currentSession().origin, "JumpServer site");
  const site = parseUrl(siteOrigin);
  if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) {
    const localChen = parseUrl(siteOrigin);
    localChen.protocol = "http:";
    localChen.port = "8082";
    try {
      const response = await net.fetch(parseUrl("/chen/healthy", localChen).toString(), {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.ok && (await response.text()).trim() === "ok") {
        allowedChenOrigins.add(localChen.origin);
        electronLog.info(`chen endpoint ${localChen.origin}`);
        return localChen.origin;
      }
    } catch {
      // Fall back to the JumpServer-hosted Chen endpoint.
    }
  }

  allowedChenOrigins.add(siteOrigin);
  electronLog.info(`chen endpoint ${siteOrigin}`);
  return siteOrigin;
}

async function resolveKokoEndpoint() {
  const configured = String(process.env.JMS_KOKO_DESKTOP_URL || process.env.JMS_KOKO_DEV_URL || "").trim();
  if (configured) {
    const origin = normalizedHttpOrigin(configured, "Koko endpoint");
    allowedKokoOrigins.add(origin);
    electronLog.info(`koko endpoint ${origin}`);
    return origin;
  }

  const siteOrigin = normalizedHttpOrigin(authService.currentSession().origin, "JumpServer site");
  const site = parseUrl(siteOrigin);
  if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) {
    const localKoko = parseUrl(siteOrigin);
    localKoko.protocol = "http:";
    localKoko.port = "5050";
    try {
      const response = await net.fetch(parseUrl("/koko/health/", localKoko).toString(), {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.ok) {
        allowedKokoOrigins.add(localKoko.origin);
        electronLog.info(`koko endpoint ${localKoko.origin}`);
        return localKoko.origin;
      }
    } catch {
      // Fall back to the JumpServer-hosted Koko endpoint.
    }
  }

  allowedKokoOrigins.add(siteOrigin);
  electronLog.info(`koko endpoint ${siteOrigin}`);
  return siteOrigin;
}

function installConnectorSessionHooks(targetSession) {
  if (configuredConnectorSessions.has(targetSession)) return;
  configuredConnectorSessions.add(targetSession);
  const socketPatterns = ["ws", "wss"].map((scheme) => `${scheme}://*/*`);
  targetSession.webRequest.onBeforeSendHeaders({ urls: socketPatterns }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    void (async () => {
      try {
        const target = parseUrl(details.url);
        const httpOrigin = `${target.protocol === "wss:" ? "https:" : "http:"}//${target.host}`;
        const isChenSocket = target.pathname.startsWith("/chen/ws/") && allowedChenOrigins.has(httpOrigin);
        const isKokoSocket = target.pathname.startsWith("/koko/ws/") && allowedKokoOrigins.has(httpOrigin);
        if (isChenSocket || isKokoSocket) {
          const originHeader = Object.keys(requestHeaders).find((name) => name.toLowerCase() === "origin") || "Origin";
          requestHeaders[originHeader] = httpOrigin;

          // Chromium treats the custom renderer origin as cross-site and omits
          // Chen's HTTP-session cookie. Reattach the target URL's own cookies;
          // Chen requires both this session and the WebSocket subprotocol token.
          if (isChenSocket) {
            const cookies = await targetSession.cookies.get({ url: `${httpOrigin}${target.pathname}` });
            if (cookies.length) {
              const cookieHeader =
                Object.keys(requestHeaders).find((name) => name.toLowerCase() === "cookie") || "Cookie";
              requestHeaders[cookieHeader] = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
            }
          }
        }
      } catch {
        // Leave headers untouched when the connector URL is malformed.
      }
      callback({ requestHeaders });
    })();
  });
}

async function proxyChenRequest(request, url) {
  const endpoint = url.searchParams.get("__jms_chen_endpoint") || "";
  url.searchParams.delete("__jms_chen_endpoint");
  if (!allowedChenOrigins.has(endpoint)) return new Response("Forbidden Chen endpoint", { status: 403 });

  const target = parseUrl(`${url.pathname}${url.search}`, endpoint);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name === "origin" || name === "referer" || name === "host" || name.startsWith("sec-fetch-")) {
      headers.delete(name);
    }
  }
  const method = request.method.toUpperCase();
  const proxied = new Request(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    credentials: "include",
    redirect: "manual"
  });
  // Chen binds its WebSocket token to the HTTP session created by /api/auth.
  // Use the renderer's shared Electron session so Set-Cookie is persisted and
  // automatically attached to the subsequent direct WebSocket handshake.
  return electronSession.defaultSession.fetch(proxied);
}

function normalizePath(candidate) {
  const resolved = path.resolve(String(candidate));
  const allowed = [...allowedPaths].some(
    (root) => resolved === root || resolved.startsWith(`${path.resolve(root)}${path.sep}`)
  );
  if (!allowed) throw new Error(`Path is outside the desktop file scope: ${resolved}`);
  return resolved;
}

function windowForEvent(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error("Desktop window is no longer available");
  return win;
}

function labelForWindow(win) {
  for (const [label, candidate] of windows) {
    if (candidate === win) return label;
  }
  return "main";
}

function sendCallback(webContents, callbackId, payload) {
  if (!webContents.isDestroyed()) webContents.send("jms:callback", callbackId, payload);
}

function emitDesktopEvent(name: string, payload: unknown, targetLabel?: string) {
  for (const [id, subscription] of subscriptions) {
    if (subscription.name !== name) continue;
    if (targetLabel && subscription.label && subscription.label !== targetLabel) continue;
    sendCallback(subscription.webContents, subscription.callbackId, { event: name, id, payload });
  }
}

function startApiStream(event, win, args) {
  const streamId = String(args.streamId || "").trim();
  if (!streamId) throw new Error("api stream id is required");
  if (apiStreams.has(streamId)) throw new Error("api stream already exists");

  const controller = new AbortController();
  const owner = { controller, webContentsId: event.sender.id };
  apiStreams.set(streamId, owner);
  const label = labelForWindow(win);
  void authService
    .apiStreamRequest(args.request, {
      signal: controller.signal,
      onChunk: (chunk) => emitDesktopEvent("api-stream", { streamId, type: "chunk", chunk }, label)
    })
    .then(() => emitDesktopEvent("api-stream", { streamId, type: "done" }, label))
    .catch((error) => {
      if (controller.signal.aborted) return;
      emitDesktopEvent(
        "api-stream",
        { streamId, type: "error", error: error instanceof Error ? error.message : String(error) },
        label
      );
    })
    .finally(() => {
      if (apiStreams.get(streamId) === owner) apiStreams.delete(streamId);
    });
  return null;
}

function cancelApiStream(event, args) {
  const streamId = String(args.streamId || "").trim();
  const stream = apiStreams.get(streamId);
  if (!stream || stream.webContentsId !== event.sender.id) return false;
  apiStreams.delete(streamId);
  stream.controller.abort();
  return true;
}

function shellCommand() {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "powershell.exe";
    return { shell, args: /powershell|pwsh/i.test(shell) ? ["-NoLogo"] : [] };
  }

  const shell = process.env.SHELL || "/bin/bash";
  const name = path.basename(shell).toLowerCase();
  return { shell, args: ["bash", "zsh", "fish", "ksh"].includes(name) ? ["-l"] : [] };
}

function localShellSession(event, sessionId) {
  const session = localShellSessions.get(sessionId);
  if (!session || session.webContentsId !== event.sender.id) throw new Error("local shell session not found");
  return session;
}

function startLocalShell(event, win, args) {
  const sessionId = String(args.sessionId || "").trim();
  if (!sessionId) throw new Error("local shell session id is required");
  if (localShellSessions.has(sessionId)) throw new Error("local shell session already exists");

  const command = shellCommand();
  const env = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"));
  const processHandle = pty.spawn(command.shell, command.args, {
    name: "xterm-256color",
    cols: Math.max(1, Number(args.cols) || 80),
    rows: Math.max(1, Number(args.rows) || 24),
    cwd: os.homedir(),
    env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" }
  });
  const session = {
    process: processHandle,
    label: labelForWindow(win),
    webContentsId: event.sender.id
  };
  localShellSessions.set(sessionId, session);
  electronLog.info(`local shell start ${sessionId} ${command.shell}`);
  processHandle.onData((data) => {
    emitDesktopEvent("local-shell-output", { sessionId, data: [...Buffer.from(data, "utf8")] }, session.label);
  });
  processHandle.onExit(() => {
    if (localShellSessions.get(sessionId)?.process === processHandle) localShellSessions.delete(sessionId);
    electronLog.info(`local shell exit ${sessionId}`);
    emitDesktopEvent("local-shell-exit", { sessionId }, session.label);
  });
  return { shell: command.shell };
}

function closeLocalShell(event, sessionId) {
  const session = localShellSession(event, sessionId);
  localShellSessions.delete(sessionId);
  session.process.kill();
  electronLog.info(`local shell close ${sessionId}`);
}

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
  emitDesktopEvent(
    "web-proxy-state",
    {
      label: managed.label,
      url,
      title: managed.view.webContents.getTitle(),
      loading: managed.view.webContents.isLoading(),
      error: "",
      ...overrides
    },
    managed.hostLabel
  );
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
}

async function tryWebProxyAutofill(managed) {
  const session = managed.credentialSession;
  if (!session || managed.autofillInProgress || managed.view.webContents.isDestroyed()) return;
  let currentOrigin;
  try {
    currentOrigin = normalizedWebOrigin(managed.view.webContents.getURL());
  } catch {
    return;
  }
  if (currentOrigin !== session.origin) return;

  const probeId = ++managed.autofillProbeId;
  let ready = false;
  try {
    ready = await managed.view.webContents.executeJavaScript(buildAutofillProbeScript(session.selectors), true);
  } catch {
    return;
  }
  if (!ready || probeId !== managed.autofillProbeId || managed.credentialSession !== session) return;

  managed.credentialSession = null;
  managed.autofillInProgress = true;
  setWebProxyRecordingPaused(managed, "autofill", true, "账号代填期间暂停录像");
  emitWebProxyAutofillState(managed, "filling", "正在安全代填并提交");
  if (managed.recording?.capturePending) await managed.recording.capturePending.catch(() => undefined);

  let credentials;
  try {
    credentials = await releaseCredentials(session, managed.view.webContents.getURL());
    const script = buildAutofillScript(session.selectors, credentials);
    credentials.username = "";
    credentials.password = "";
    const submitted = await managed.view.webContents.executeJavaScript(script, true);
    if (!submitted) throw new Error("登录元素在代填前发生变化");
    emitWebProxyAutofillState(managed, "submitted", "已触发页面的登录提交动作");
    clearAutofillTimeout(managed);
    managed.autofillTimeout = setTimeout(() => {
      if (!managed.autofillInProgress) return;
      managed.autofillInProgress = false;
      setWebProxyRecordingPaused(managed, "autofill", false, "账号代填已结束，继续录像");
      emitWebProxyAutofillState(managed, "error", "已触发登录，但页面在 20 秒内没有离开密码阶段");
    }, 20_000);
  } catch (error) {
    if (credentials) {
      credentials.username = "";
      credentials.password = "";
    }
    managed.autofillInProgress = false;
    setWebProxyRecordingPaused(managed, "autofill", false, "账号代填失败，继续录像");
    emitWebProxyAutofillState(managed, "error", String(error instanceof Error ? error.message : error));
  }
}

async function captureWebProxyFrame(managed) {
  if (managed.view.webContents.isDestroyed()) throw new Error("Web Proxy 视图已关闭");
  const image = await managed.view.webContents.capturePage();
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
  const proxy = parseWebProxyUrl(args.proxyUrl, ["http:", "socks5:"], "Koko Web Proxy URL");
  const proxySession = electronSession.fromPartition(`web-proxy:${label}`, { cache: false });
  const proxyRules = proxy.protocol === "socks5:" ? `socks5://${proxy.host}` : `http=${proxy.host};https=${proxy.host}`;
  await proxySession.setProxy({ mode: "fixed_servers", proxyRules });

  const view = new WebContentsView({
    webPreferences: {
      session: proxySession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const managed = {
    label,
    view,
    webContents: view.webContents,
    host: win,
    hostLabel: labelForWindow(win),
    hostWebContentsId: event.sender.id,
    targetUrl: target.toString(),
    proxyUrl: proxy.toString(),
    credentialSession: null,
    autofillInProgress: false,
    autofillProbeId: 0,
    autofillTimeout: null,
    active: true,
    recording: null
  };
  webProxyViews.set(label, managed);
  electronLog.info(`web proxy open ${label} ${target.origin}`);
  win.contentView.addChildView(view);
  view.setBounds({
    x: Math.max(0, Math.round(Number(args.x) || 0)),
    y: Math.max(0, Math.round(Number(args.y) || 0)),
    width: Math.max(1, Math.round(Number(args.width) || 1)),
    height: Math.max(1, Math.round(Number(args.height) || 1))
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const next = parseWebProxyUrl(url, ["http:", "https:"], "Website URL");
      void view.webContents.loadURL(next.toString());
    } catch {
      // Invalid external URLs remain blocked by the deny response below.
    }
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (navigationEvent, url) => {
    try {
      parseWebProxyUrl(url, ["http:", "https:"], "Website URL");
    } catch {
      navigationEvent.preventDefault();
    }
  });
  view.webContents.on("did-start-navigation", (_navigationEvent, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame || !managed.autofillInProgress) return;
    try {
      parseWebProxyUrl(url, ["http:", "https:"], "Website URL");
    } catch {
      return;
    }
    clearAutofillTimeout(managed);
    managed.autofillInProgress = false;
    setWebProxyRecordingPaused(managed, "autofill", false, "页面已离开密码阶段，继续录像");
  });
  view.webContents.on("did-start-loading", () => emitWebProxyState(managed, { loading: true }));
  view.webContents.on("did-stop-loading", () => emitWebProxyState(managed, { loading: false }));
  view.webContents.on("did-finish-load", () => void tryWebProxyAutofill(managed));
  view.webContents.on("page-title-updated", () => emitWebProxyState(managed, { loading: false }));
  view.webContents.on("did-fail-load", (_loadEvent, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    electronLog.warn(`web proxy load failed ${label}: ${description}`);
    emitWebProxyState(managed, { url: validatedUrl, loading: false, error: description });
  });
  void createCredentialSession(proxy, target, String(args.tokenId || ""), String(args.tokenValue || ""))
    .then((session) => {
      if (view.webContents.isDestroyed() || webProxyViews.get(label) !== managed) return;
      managed.credentialSession = session;
      if (session) {
        emitWebProxyAutofillState(managed, "ready", "等待登录元素");
        void tryWebProxyAutofill(managed);
      } else {
        emitWebProxyAutofillState(managed, "unavailable", "资产未启用账号代填");
      }
    })
    .catch((error) => {
      electronLog.warn(`web proxy autofill failed ${label}`, error);
      if (!view.webContents.isDestroyed()) {
        emitWebProxyAutofillState(managed, "error", String(error instanceof Error ? error.message : error));
      }
    });
  void view.webContents.loadURL(target.toString()).catch((error) => {
    if (!view.webContents.isDestroyed()) {
      emitWebProxyState(managed, { loading: false, error: String(error instanceof Error ? error.message : error) });
    }
  });
  return { label, url: target.toString(), title: "", loading: true, error: "" };
}

async function closeWebProxyView(event, label) {
  const managed = webProxyView(event, label);
  electronLog.info(`web proxy close ${label}`);
  webProxyViews.delete(label);
  managed.autofillProbeId += 1;
  clearAutofillTimeout(managed);
  try {
    await managed.recording?.finish();
  } catch (error) {
    electronLog.warn(`failed to finish Web recording for ${label}`, error);
  }
  managed.recording?.dispose();
  managed.credentialSession = null;
  managed.host.contentView.removeChildView(managed.view);
  managed.view.webContents.close();
}

function rendererTarget(target = "/luna/") {
  if (isDevelopment) return parseUrl(target, rendererUrl).toString();
  const desktopTarget = target === "/luna" ? "/" : target.replace(/^\/luna\//, "/");
  const normalized = desktopTarget.startsWith("/") ? desktopTarget : `/${desktopTarget}`;
  return `jms-app://app${normalized}`;
}

function createInsetIcon(iconPath, size, inset) {
  const source = nativeImage.createFromPath(iconPath);
  if (source.isEmpty()) return undefined;

  const contentSize = size - inset * 2;
  const content = source.resize({ width: contentSize, height: contentSize, quality: "best" });
  const contentBitmap = content.toBitmap();
  const canvasBitmap = Buffer.alloc(size * size * 4);
  for (let row = 0; row < contentSize; row += 1) {
    const sourceStart = row * contentSize * 4;
    const targetStart = ((row + inset) * size + inset) * 4;
    contentBitmap.copy(canvasBitmap, targetStart, sourceStart, sourceStart + contentSize * 4);
  }
  return nativeImage.createFromBitmap(canvasBitmap, { width: size, height: size });
}

function loadAppIcon() {
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconPath = isDevelopment
    ? path.join(projectRoot, "electron/assets/icons", iconName)
    : path.join(process.resourcesPath, "icons", iconName);
  appIcon ??=
    process.platform === "darwin"
      ? createInsetIcon(iconPath, macDockIconSize, macDockIconInset)
      : nativeImage.createFromPath(iconPath);
  if (appIcon.isEmpty()) appIcon = undefined;
  return appIcon;
}

function installNavigationGuard(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    const current = parseUrl(win.webContents.getURL());
    const next = parseUrl(target);
    if (current.origin === next.origin || (current.protocol === "jms-app:" && next.protocol === "jms-app:")) return;
    event.preventDefault();
    if (["http:", "https:"].includes(next.protocol)) void shell.openExternal(next.toString());
  });
}

function safeExternalUrl(rawUrl) {
  const url = parseUrl(rawUrl);
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw new Error(`External URL scheme is not allowed: ${url.protocol}`);
  }
  return url.toString();
}

function resolveBaseDirectory(directory) {
  const home = os.homedir();
  const paths = {
    1: app.getPath("music"),
    2: path.join(app.getPath("userData"), "Cache"),
    3: app.getPath("appData"),
    4: app.getPath("appData"),
    5: app.getPath("userData"),
    6: app.getPath("documents"),
    7: app.getPath("downloads"),
    8: app.getPath("pictures"),
    9: path.join(home, "Public"),
    10: app.getPath("videos"),
    11: process.resourcesPath,
    12: app.getPath("temp"),
    13: app.getPath("userData"),
    14: app.getPath("userData"),
    15: app.getPath("userData"),
    16: path.join(app.getPath("userData"), "Cache"),
    17: app.getPath("logs"),
    18: app.getPath("desktop"),
    19: path.dirname(process.execPath),
    20:
      process.platform === "win32"
        ? path.join(process.env.WINDIR || "C:\\Windows", "Fonts")
        : process.platform === "darwin"
          ? "/Library/Fonts"
          : "/usr/share/fonts",
    21: home,
    22: app.getPath("temp"),
    23: path.join(home, "Templates")
  };
  const resolved = paths[directory];
  if (!resolved) throw new Error(`Unsupported desktop base directory: ${directory}`);
  allowedPaths.add(resolved);
  return resolved;
}

interface CreateWindowOptions {
  title?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  url?: string;
}

function createWindow(label = "main", options: CreateWindowOptions = {}) {
  const existing = windows.get(label);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    electronLog.info(`window focus ${label}`);
    return existing;
  }
  electronLog.info(`window open ${label}`);

  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    title: options.title || "JumpServer",
    icon: loadAppIcon(),
    width: options.width || 1300,
    height: options.height || 780,
    minWidth: options.minWidth || 800,
    minHeight: options.minHeight || 480,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 10, y: 13 } : undefined,
    vibrancy: isMac ? "fullscreen-ui" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    backgroundMaterial: process.platform === "win32" ? "mica" : undefined,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(electronDir, "preload.js"),
      additionalArguments: [`--jms-window-label=${label}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });
  installConnectorSessionHooks(win.webContents.session);
  const windowWebContents = win.webContents;
  const windowWebContentsId = windowWebContents.id;

  windowWebContents.on("before-input-event", (event, input) => {
    const closeCurrentTab =
      input.type === "keyDown" &&
      !input.isAutoRepeat &&
      input.alt &&
      input.shift &&
      !input.control &&
      !input.meta &&
      (input.code === "KeyW" || input.key.toLowerCase() === "w");
    if (!closeCurrentTab) return;

    event.preventDefault();
    emitDesktopEvent("desktop-menu-command", "close-current-tab", label);
  });

  if (isDevelopment) {
    windowWebContents.on("context-menu", () => {
      Menu.buildFromTemplate([
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => windowWebContents.reload() },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => windowWebContents.reloadIgnoringCache()
        },
        { type: "separator" },
        { label: "Toggle Developer Tools", click: () => windowWebContents.toggleDevTools() }
      ]).popup({ window: win });
    });
  }

  windows.set(label, win);
  installNavigationGuard(win);
  win.once("ready-to-show", () => win.show());
  win.on("resize", () => {
    const [width, height] = win.getContentSize();
    emitDesktopEvent("desktop://resize", { width, height }, label);
  });
  win.on("closed", () => {
    electronLog.info(`window closed ${label}`);
    windows.delete(label);
    for (const [sessionId, session] of localShellSessions) {
      if (session.webContentsId !== windowWebContentsId) continue;
      localShellSessions.delete(sessionId);
      session.process.kill();
    }
    for (const [streamId, stream] of apiStreams) {
      if (stream.webContentsId !== windowWebContentsId) continue;
      apiStreams.delete(streamId);
      stream.controller.abort();
    }
    for (const [viewLabel, managed] of webProxyViews) {
      if (managed.hostWebContentsId !== windowWebContentsId) continue;
      webProxyViews.delete(viewLabel);
      clearAutofillTimeout(managed);
      void managed.recording?.finish().catch((error) => {
        electronLog.warn(`failed to finish Web recording for ${viewLabel}`, error);
      });
      if (!managed.webContents.isDestroyed()) managed.webContents.close();
    }
    for (const [id, subscription] of subscriptions) {
      if (subscription.webContents === windowWebContents) subscriptions.delete(id);
    }
  });
  void win.loadURL(rendererTarget(options.url || "/luna/"));
  return win;
}

function prefersZh() {
  return (app.getLocale() || process.env.LANG || "").toLowerCase().startsWith("zh");
}

function menuLabels() {
  const appName = productName;
  if (prefersZh()) {
    return {
      about: `关于 ${appName}`,
      settings: "设置…",
      tools: "我的工具",
      file: "文件",
      edit: "编辑",
      view: "视图",
      window: "窗口",
      help: "帮助",
      undo: "撤销",
      redo: "重做",
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      selectAll: "全选",
      focusMode: "纯净模式",
      leftPanel: "左侧面板",
      rightPanel: "右侧面板",
      statusBar: "底部状态栏",
      batchCommand: "批量命令",
      close: "关闭窗口",
      minimize: "最小化窗口",
      zoom: "缩放",
      fullscreen: "进入全屏幕",
      hide: `隐藏 ${appName}`,
      hideOthers: "隐藏其他窗口",
      showAll: "显示所有窗口",
      showMain: "显示主窗口",
      quit: "退出"
    };
  }

  return {
    about: `About ${appName}`,
    settings: "Settings…",
    tools: "My tools",
    file: "File",
    edit: "Edit",
    view: "View",
    window: "Window",
    help: "Help",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    focusMode: "Focus Mode",
    leftPanel: "Left Panel",
    rightPanel: "Right Panel",
    statusBar: "Bottom Status Bar",
    batchCommand: "Batch Command",
    close: "Close Window",
    minimize: "Minimize Window",
    zoom: "Zoom",
    fullscreen: "Enter Full Screen",
    hide: `Hide ${appName}`,
    hideOthers: "Hide Others",
    showAll: "Show All",
    showMain: "Show Main Window",
    quit: "Quit"
  };
}

function showMainWindow() {
  const win = createWindow("main");
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

function openSettingsWindow() {
  const existing = windows.get("main");
  const win = showMainWindow();
  const navigate = () => emitDesktopEvent("settings-navigate", "/setting/general", "main");
  if (!existing || existing.isDestroyed() || win.webContents.isLoadingMainFrame()) {
    win.webContents.once("did-finish-load", navigate);
  } else {
    navigate();
  }
}

function openAboutWindow() {
  const label = "about-window";
  const existing = windows.get(label);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const appName = productName;
  const query = new URLSearchParams({
    name: appName,
    version: app.getVersion(),
    custom: appName === defaultProductName ? "0" : "1"
  });
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    title: prefersZh() ? `关于 ${appName}` : `About ${appName}`,
    width: 320,
    height: 300,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    backgroundColor: "#2c2c2c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  windows.set(label, win);
  installNavigationGuard(win);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => windows.delete(label));
  void win.loadURL(rendererTarget(`/luna/about.html?${query}`));
  return win;
}

function sendMenuCommand(command) {
  showMainWindow();
  emitDesktopEvent("desktop-menu-command", command, "main");
}

function buildMenu() {
  const labels = menuLabels();
  const appSubmenu: MenuItemConstructorOptions[] = [
    { label: labels.about, click: openAboutWindow },
    { type: "separator" },
    { label: labels.settings, accelerator: "CmdOrCtrl+,", click: openSettingsWindow },
    { label: labels.tools, accelerator: "CmdOrCtrl+Shift+,", click: () => sendMenuCommand("open-tools") },
    { label: labels.close, accelerator: "CmdOrCtrl+W", role: "close" },
    { label: labels.minimize, accelerator: "CmdOrCtrl+M", role: "minimize" }
  ];
  if (process.platform === "darwin") {
    appSubmenu.push(
      { type: "separator" },
      { label: labels.hide, accelerator: "CmdOrCtrl+H", role: "hide" },
      { label: labels.hideOthers, accelerator: "CmdOrCtrl+Alt+H", role: "hideOthers" },
      { label: labels.showAll, role: "unhide" }
    );
  }
  appSubmenu.push({ type: "separator" }, { label: labels.quit, accelerator: "CmdOrCtrl+Q", role: "quit" });

  const template: MenuItemConstructorOptions[] = [
    { label: productName, submenu: appSubmenu },
    { label: labels.file, submenu: [{ label: labels.close, accelerator: "CmdOrCtrl+W", role: "close" }] },
    {
      label: labels.edit,
      submenu: [
        { label: labels.undo, role: "undo" },
        { label: labels.redo, role: "redo" },
        { type: "separator" },
        { label: labels.cut, role: "cut" },
        { label: labels.copy, role: "copy" },
        { label: labels.paste, role: "paste" },
        { label: labels.selectAll, role: "selectAll" }
      ]
    },
    {
      label: labels.view,
      submenu: [
        {
          label: labels.focusMode,
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => sendMenuCommand("toggle-focus-mode")
        },
        { label: labels.leftPanel, click: () => sendMenuCommand("toggle-left-panel") },
        { label: labels.rightPanel, click: () => sendMenuCommand("toggle-right-panel") },
        { label: labels.batchCommand, click: () => sendMenuCommand("toggle-batch-command") },
        { label: labels.statusBar, click: () => sendMenuCommand("toggle-status-bar") },
        { type: "separator" },
        {
          label: labels.fullscreen,
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => sendMenuCommand("toggle-fullscreen-mode")
        }
      ]
    },
    {
      label: labels.window,
      submenu: [
        { label: labels.minimize, role: "minimize" },
        { label: labels.zoom, role: "zoom" },
        { type: "separator" },
        { label: labels.close, role: "close" }
      ]
    },
    { label: labels.help, submenu: [] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupTray() {
  const labels = menuLabels();
  const iconName = process.platform === "darwin" ? "tray-mac.png" : "32x32.png";
  const iconPath = isDevelopment
    ? path.join(projectRoot, "electron/assets/icons", iconName)
    : path.join(process.resourcesPath, "icons", iconName);
  const icon = nativeImage.createFromPath(iconPath).resize({ height: trayIconSize, quality: "best" });
  if (icon.isEmpty()) return;
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(productName);
  const trayMenu = Menu.buildFromTemplate([
    { label: labels.showMain, click: showMainWindow },
    { label: labels.settings, click: openSettingsWindow },
    { label: labels.about, click: openAboutWindow },
    { type: "separator" },
    { label: labels.quit, click: () => app.quit() }
  ]);
  tray.setContextMenu(trayMenu);
  if (process.platform !== "darwin") tray.on("click", () => tray.popUpContextMenu(trayMenu));
}

async function statPayload(filePath) {
  const info = await stat(filePath);
  return {
    isFile: info.isFile(),
    isDirectory: info.isDirectory(),
    isSymlink: info.isSymbolicLink(),
    size: info.size,
    mtime: info.mtime,
    atime: info.atime,
    birthtime: info.birthtime,
    readonly: false,
    fileAttributes: null,
    nlink: info.nlink
  };
}

async function handleStore(command, args) {
  if (command === "plugin:store|load") {
    const storePath = path.join(app.getPath("userData"), path.basename(args.path));
    let data = { ...(args.options?.defaults || {}) };
    try {
      data = { ...data, ...JSON.parse(await readFile(storePath, "utf8")) };
    } catch {
      // Missing or invalid stores start from their configured defaults.
    }
    const rid = nextStoreId++;
    stores.set(rid, { path: storePath, data, defaults: structuredClone(data) });
    return rid;
  }
  const store = stores.get(args.rid);
  if (!store) throw new Error("Desktop store is not loaded");
  if (command === "plugin:store|set") {
    store.data[args.key] = args.value;
    emitDesktopEvent("store://change", { resourceId: args.rid, key: args.key, value: args.value, exists: true });
    return null;
  }
  if (command === "plugin:store|get") return [store.data[args.key], Object.hasOwn(store.data, args.key)];
  if (command === "plugin:store|has") return Object.hasOwn(store.data, args.key);
  if (command === "plugin:store|delete") return delete store.data[args.key];
  if (command === "plugin:store|clear") return void (store.data = {});
  if (command === "plugin:store|reset") return void (store.data = structuredClone(store.defaults));
  if (command === "plugin:store|keys") return Object.keys(store.data);
  if (command === "plugin:store|values") return Object.values(store.data);
  if (command === "plugin:store|entries") return Object.entries(store.data);
  if (command === "plugin:store|length") return Object.keys(store.data).length;
  if (command === "plugin:store|reload") return null;
  if (command === "plugin:store|save") {
    await mkdir(path.dirname(store.path), { recursive: true });
    await writeFile(store.path, `${JSON.stringify(store.data, null, 2)}\n`);
    return null;
  }
  throw new Error(`Unsupported Electron store command: ${command}`);
}

async function withIpcErrorLog(command, work) {
  try {
    return await work();
  } catch (error) {
    electronLog.error(`${command} failed:`, error);
    throw error;
  }
}

async function handleInvoke(event, request) {
  if (!isAllowedSender(event.senderFrame)) {
    electronLog.warn("rejected desktop IPC sender");
    throw new Error("Rejected desktop IPC sender");
  }
  const { command, args = {}, options = {} } = request || {};
  const win = windowForEvent(event);

  if (command.startsWith("plugin:store|")) return handleStore(command, args);
  if (command === "plugin:event|listen") {
    const id = nextSubscriptionId++;
    subscriptions.set(id, {
      name: args.event,
      callbackId: args.handler,
      webContents: event.sender,
      label: labelForWindow(win)
    });
    return id;
  }
  if (command === "plugin:event|unlisten") return subscriptions.delete(args.eventId);
  if (command === "plugin:event|emit" || command === "plugin:event|emit_to") {
    emitDesktopEvent(args.event, args.payload);
    return null;
  }

  if (["close_window", "plugin:window|close", "plugin:window|destroy"].includes(command)) return void win.close();
  if (["minimize_window", "plugin:window|minimize"].includes(command)) return void win.minimize();
  if (["toggle_maximize_window", "plugin:window|toggle_maximize"].includes(command))
    return void (win.isMaximized() ? win.unmaximize() : win.maximize());
  if (command === "plugin:window|maximize") return void win.maximize();
  if (command === "plugin:window|unmaximize") return void win.unmaximize();
  if (command === "plugin:window|is_maximized") return win.isMaximized();
  if (command === "plugin:window|is_minimized") return win.isMinimized();
  if (command === "plugin:window|is_fullscreen") return win.isFullScreen();
  if (command === "plugin:window|set_fullscreen") return void win.setFullScreen(Boolean(args.fullscreen));
  if (command === "plugin:window|set_title") return void win.setTitle(String(args.title || ""));
  if (command === "plugin:window|set_background_color") return void win.setBackgroundColor(args.color || "#00000000");
  if (command === "plugin:window|start_dragging") return null;
  if (command === "plugin:window|theme") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  if (command === "plugin:window|get_all_windows") return [...windows.keys()];
  if (command === "plugin:webview|create_webview_window") {
    createWindow(args.options.label, args.options);
    return null;
  }

  if (command === "plugin:app|version") return app.getVersion();
  if (command === "plugin:app|name") return productName;
  if (command === "plugin:os|locale") return app.getLocale();
  if (command === "plugin:os|hostname") return os.hostname();
  if (command === "plugin:path|resolve_directory") return resolveBaseDirectory(args.directory);
  if (command === "plugin:path|resolve") return path.resolve(...args.paths);
  if (command === "plugin:path|normalize") return path.normalize(args.path);
  if (command === "plugin:path|join") return path.join(...args.paths);
  if (command === "plugin:path|dirname") return path.dirname(args.path);
  if (command === "plugin:path|extname") return path.extname(args.path);
  if (command === "plugin:path|basename") return path.basename(args.path, args.ext);
  if (command === "plugin:path|is_absolute") return path.isAbsolute(args.path);
  if (command === "plugin:clipboard-manager|write_text") return void clipboard.writeText(args.text || "");
  if (command === "plugin:clipboard-manager|read_text") return clipboard.readText();
  if (command === "plugin:clipboard-manager|clear") return void clipboard.clear();
  if (command === "desktop_clipboard_write_image") {
    const image = nativeImage.createFromBitmap(Buffer.from(args.rgba), {
      width: Number(args.width),
      height: Number(args.height),
      scaleFactor: 1
    });
    if (image.isEmpty()) throw new Error("Unable to create Electron clipboard image");
    const png = new Uint8Array(image.toPNG());
    await clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]);
    return null;
  }
  if (command === "plugin:opener|open_url") return shell.openExternal(safeExternalUrl(args.url));
  if (command === "plugin:opener|open_path") return shell.openPath(normalizePath(args.path));
  if (command === "plugin:opener|reveal_item_in_dir") return void shell.showItemInFolder(normalizePath(args.paths[0]));

  if (command === "plugin:dialog|open") {
    const result = await dialog.showOpenDialog(win, {
      title: args.options?.title,
      defaultPath: args.options?.defaultPath,
      filters: args.options?.filters,
      properties: [
        args.options?.directory ? ("openDirectory" as const) : ("openFile" as const),
        ...(args.options?.multiple ? (["multiSelections"] as const) : [])
      ]
    });
    if (result.canceled) return null;
    result.filePaths.forEach((filePath) => allowedPaths.add(filePath));
    return args.options?.multiple ? result.filePaths : result.filePaths[0];
  }
  if (command === "plugin:dialog|save") {
    const result = await dialog.showSaveDialog(win, {
      title: args.options?.title,
      defaultPath: args.options?.defaultPath,
      filters: args.options?.filters
    });
    if (result.canceled || !result.filePath) return null;
    allowedPaths.add(result.filePath);
    return result.filePath;
  }
  if (command === "plugin:dialog|message") {
    const result = await dialog.showMessageBox(win, {
      title: args.title,
      message: String(args.message),
      type: args.kind || "info",
      buttons: ["OK"]
    });
    return result.response === 0 ? "Ok" : "Cancel";
  }

  if (command === "plugin:notification|is_permission_granted") return Notification.isSupported();
  if (command === "plugin:notification|notify") {
    if (Notification.isSupported()) new Notification(args.options || args).show();
    return null;
  }

  if (command === "plugin:fs|exists") {
    try {
      await access(normalizePath(args.path), fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
  if (
    command === "plugin:fs|start_accessing_security_scoped_resource" ||
    command === "plugin:fs|stop_accessing_security_scoped_resource"
  ) {
    return null;
  }
  if (command === "plugin:fs|read_file") return new Uint8Array(await readFile(normalizePath(args.path)));
  if (command === "plugin:fs|read_text_file") return readFile(normalizePath(args.path), "utf8");
  if (command === "plugin:fs|write_file") {
    const filePath = decodeURIComponent(options.headers?.path || "");
    await writeFile(normalizePath(filePath), new Uint8Array(args));
    return null;
  }
  if (command === "plugin:fs|mkdir")
    return mkdir(normalizePath(args.path), { recursive: Boolean(args.options?.recursive) });
  if (command === "plugin:fs|remove")
    return rm(normalizePath(args.path), { recursive: Boolean(args.options?.recursive), force: false });
  if (command === "plugin:fs|rename") return rename(normalizePath(args.oldPath), normalizePath(args.newPath));
  if (command === "plugin:fs|stat" || command === "plugin:fs|lstat") return statPayload(normalizePath(args.path));
  if (command === "plugin:fs|read_dir") {
    const directory = normalizePath(args.path);
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink()
    }));
  }

  if (command === "set_api_session") return authService.setSession(args);
  if (command === "set_api_org") return authService.setCurrentOrg(args.orgId);
  if (command === "get_version_message") return authService.getVersionMessage();
  if (command === "init_http_callback_server") return authService.startCallbackServer();
  if (command === "auth_login") return withIpcErrorLog("auth_login", () => authService.authLogin(args));
  if (command === "auth_cancel") return authService.cancelAuth();
  if (command === "bootstrap_auth_session")
    return withIpcErrorLog("bootstrap_auth_session", () => authService.bootstrapAuthSession(args));
  if (command === "api_request") return authService.apiRequest(args.request);
  if (command === "api_stream_start") return startApiStream(event, win, args);
  if (command === "api_stream_cancel") return cancelApiStream(event, args);
  if (command === "resolve_chen_endpoint") return resolveChenEndpoint();
  if (command === "resolve_koko_endpoint") return resolveKokoEndpoint();
  if (command === "create_koko_connect_ticket") return authService.createKokoConnectTicket(args);
  if (command === "import_offline_recording") return offlineRecordings.importRecording(normalizePath(args.filePath));
  if (command === "list_offline_recordings") return offlineRecordings.listRecordings();
  if (command === "remove_offline_recording") return offlineRecordings.removeRecording(args.recordingId);
  if (command === "get_offline_entry_url") {
    const entry = await offlineRecordings.resolveEntryDescriptor(args.recordingId, args.entryId);
    return `jms-asset://localhost/${encodeURIComponent(entry.path)}?mediaType=${entry.mediaType}`;
  }
  if (command === "start_local_shell") return startLocalShell(event, win, args);
  if (command === "write_local_shell") {
    localShellSession(event, args.sessionId).process.write(Buffer.from(args.data || []).toString("utf8"));
    return null;
  }
  if (command === "resize_local_shell") {
    localShellSession(event, args.sessionId).process.resize(
      Math.max(1, Number(args.cols) || 1),
      Math.max(1, Number(args.rows) || 1)
    );
    return null;
  }
  if (command === "close_local_shell") return closeLocalShell(event, args.sessionId);
  if (command === "create_web_proxy_view")
    return withIpcErrorLog("create_web_proxy_view", () => createWebProxyView(event, win, args));
  if (command === "set_web_proxy_view_active") {
    const managed = webProxyView(event, args.label);
    const active = Boolean(args.active);
    managed.active = active;
    managed.view.setVisible(active);
    setWebProxyRecordingPaused(
      managed,
      "inactive",
      !active,
      active ? "Website 标签已激活，继续录像" : "Website 标签在后台，暂停录像"
    );
    if (active) managed.view.webContents.focus();
    return null;
  }
  if (command === "set_web_proxy_view_bounds") {
    webProxyView(event, args.label).view.setBounds({
      x: Math.max(0, Math.round(Number(args.x) || 0)),
      y: Math.max(0, Math.round(Number(args.y) || 0)),
      width: Math.max(1, Math.round(Number(args.width) || 1)),
      height: Math.max(1, Math.round(Number(args.height) || 1))
    });
    return null;
  }
  if (command === "navigate_web_proxy_view") {
    const target = parseWebProxyUrl(args.targetUrl, ["http:", "https:"], "Website URL");
    return webProxyView(event, args.label).view.webContents.loadURL(target.toString());
  }
  if (command === "reload_web_proxy_view") return webProxyView(event, args.label).view.webContents.reload();
  if (command === "history_web_proxy_view") {
    const history = webProxyView(event, args.label).view.webContents.navigationHistory;
    if (args.direction === "back" && history.canGoBack()) history.goBack();
    else if (args.direction === "forward" && history.canGoForward()) history.goForward();
    else if (!["back", "forward"].includes(args.direction)) throw new Error("invalid history direction");
    return null;
  }
  if (command === "start_web_proxy_recording") {
    const managed = webProxyView(event, args.label);
    if (managed.recording) throw new Error("当前 Website 标签已在录像");
    const target = parseWebProxyUrl(args.targetUrl, ["http:", "https:"], "Website URL");
    const proxy = parseWebProxyUrl(args.proxyUrl, ["http:"], "Koko Web Proxy URL");
    if (target.toString() !== managed.targetUrl || proxy.toString() !== managed.proxyUrl) {
      throw new Error("Web 录像参数与当前 Website 会话不匹配");
    }
    try {
      managed.recording = await WebProxyRecording.start({
        label: managed.label,
        targetUrl: target.toString(),
        proxyUrl: proxy.toString(),
        width: Math.round(Number(args.width)),
        height: Math.round(Number(args.height)),
        capture: () => captureWebProxyFrame(managed),
        emit: (state) => emitWebProxyRecordingState(managed, state)
      });
      if (!managed.active) {
        managed.recording.setPaused("inactive", true, "Website 标签在后台，暂停录像");
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
  if (command === "logout") return withIpcErrorLog("logout", () => authService.logout(args));
  if (command === "open_settings_window") {
    emitDesktopEvent("settings-navigate", args.path || "/setting/general", labelForWindow(win));
    return null;
  }
  if (command === "get_config") return applicationConfig.getConfig();
  if (command === "list_plugins") return applicationConfig.listPlugins();
  if (command === "update_config_selection") {
    return applicationConfig.updateSelection({ ...args, ...(args.path ? { path: normalizePath(args.path) } : {}) });
  }
  if (command === "install_plugin")
    return withIpcErrorLog("install_plugin", () => applicationConfig.installPlugin({ path: normalizePath(args.path) }));
  if (command === "uninstall_plugin")
    return withIpcErrorLog("uninstall_plugin", () => applicationConfig.uninstallPlugin(args));
  if (command === "debug_log_set_enabled") {
    const enabled = Boolean(args.enabled);
    if (enabled) {
      debugLogService?.setEnabled(true);
      electronLog.info(`debug log enabled: ${debugLogService?.filePath || ""}`);
    } else {
      electronLog.info("debug log disabled");
      debugLogService?.setEnabled(false);
    }
    return null;
  }
  if (command === "debug_log_read") return debugLogService?.read() || "";
  if (command === "debug_log_clear") {
    await debugLogService?.clear();
    return null;
  }
  if (command === "get_ffmpeg_plugin_status") return ffmpegPlugin.status();
  if (command === "install_ffmpeg_plugin")
    return withIpcErrorLog("install_ffmpeg_plugin", () => ffmpegPlugin.install(labelForWindow(win)));
  if (command === "uninstall_ffmpeg_plugin")
    return withIpcErrorLog("uninstall_ffmpeg_plugin", () => ffmpegPlugin.uninstall());
  if (command === "create_custom_terminal") {
    return applicationConfig.createCustomTerminal({ ...args, path: normalizePath(args.path) });
  }
  if (command === "pull_up") return withIpcErrorLog("pull_up", () => localApplicationLauncher.launch(args.url));
  if (command === "list_system_fonts") return listSystemFonts();
  if (command === "transcode_replays") {
    const request = {
      tarPaths: (args.tarPaths || []).map((candidate) => normalizePath(candidate)),
      outputDir: normalizePath(args.outputDir),
      filenameStyle: args.filenameStyle,
      outputResolution: args.outputResolution,
      transcodePower: args.transcodePower
    };
    return withIpcErrorLog("transcode_replays", () => replayTranscoder.transcode(request, labelForWindow(win)));
  }

  electronLog.warn(`unmigrated desktop command ${command}`);
  throw new Error(`Electron bridge has not migrated command: ${command}`);
}

async function registerProtocols() {
  protocol.handle("jms-app", async (request) => {
    const url = parseUrl(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (relative.startsWith("chen/")) return proxyChenRequest(request, url);
    const root = path.join(projectRoot, "dist");
    let candidate = path.resolve(root, relative || "index.html");
    if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root)
      return new Response("Forbidden", { status: 403 });
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) candidate = path.join(candidate, "index.html");
    } catch {
      if (/^(?:api|chen|core|koko|lion|media|static|ws)(?:\/|$)/.test(relative)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      candidate = path.join(root, "index.html");
    }
    return net.fetch(pathToFileURL(candidate).toString());
  });
  protocol.handle("jms-asset", async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "Range"
        }
      });
    }
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    try {
      const url = parseUrl(request.url);
      const decodedPath = decodeURIComponent(url.pathname);
      const filePath = normalizePath(process.platform === "win32" ? decodedPath.replace(/^\/+/, "") : decodedPath);
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile()) return new Response("Not found", { status: 404 });
      const fileLength = fileInfo.size;
      const range = request.headers.get("range");
      let start = 0;
      let end = Math.max(0, fileLength - 1);
      let statusCode = 200;
      if (range) {
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        if (!match || fileLength === 0) {
          return new Response("Invalid byte range", {
            status: 416,
            headers: { "content-range": `bytes */${fileLength}`, "access-control-allow-origin": "*" }
          });
        }
        if (match[1]) {
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), fileLength - 1) : fileLength - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= fileLength) {
            return new Response("Invalid byte range", {
              status: 416,
              headers: { "content-range": `bytes */${fileLength}`, "access-control-allow-origin": "*" }
            });
          }
        } else {
          const suffixLength = Number(match[2]);
          if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return new Response("Invalid byte range", { status: 416 });
          }
          start = Math.max(0, fileLength - suffixLength);
        }
        statusCode = 206;
      }
      const mediaType = url.searchParams.get("mediaType");
      const contentType =
        mediaType === "mp4" || path.extname(filePath).toLowerCase() === ".mp4"
          ? "video/mp4"
          : mediaType && ["cast", "gua", "part"].includes(mediaType)
            ? "text/plain; charset=utf-8"
            : "application/octet-stream";
      const responseLength = fileLength === 0 ? 0 : end - start + 1;
      const headers = {
        "access-control-allow-origin": "*",
        "accept-ranges": "bytes",
        "content-length": String(responseLength),
        "content-type": contentType
      };
      if (statusCode === 206) headers["content-range"] = `bytes ${start}-${end}/${fileLength}`;
      const body =
        request.method === "HEAD" || fileLength === 0
          ? null
          : readableToWebBody(createReadStream(filePath, { start, end }));
      return new Response(body, { status: statusCode, headers });
    } catch {
      return new Response("Not found", { status: 404, headers: { "access-control-allow-origin": "*" } });
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

const pendingProtocolUrls: string[] = [];

function describeProtocolUrl(rawUrl) {
  const value = String(rawUrl || "");
  if (value.includes("auth/callback")) return "auth-callback";
  if (value.startsWith("jms2://")) return "jms2-launch";
  if (value.startsWith("jms://")) return "jms-launch";
  return "unknown";
}

function handleIncomingProtocolUrl(rawUrl) {
  const value = String(rawUrl || "");
  if (!value.startsWith("jms://") && !value.startsWith("jms2://")) return;
  electronLog.info(`protocol ${describeProtocolUrl(value)}`);
  if (!authService || !localApplicationLauncher) {
    pendingProtocolUrls.push(value);
    return;
  }
  if (authService.handleCallback(value) || authService.isOAuthCallbackUrl(value)) return;
  void localApplicationLauncher.launch(value).catch((error) => {
    electronLog.error("protocol launch failed", error);
  });
}

function drainPendingProtocolUrls() {
  for (const url of pendingProtocolUrls.splice(0)) handleIncomingProtocolUrl(url);
}

app.on("second-instance", (_event, commandLine) => {
  const protocolUrl = commandLine.find((argument) => argument.startsWith("jms://") || argument.startsWith("jms2://"));
  handleIncomingProtocolUrl(protocolUrl);
  const win = createWindow("main");
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleIncomingProtocolUrl(url);
  createWindow("main").focus();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => createWindow("main"));

for (const scheme of ["jms", "jms2"]) {
  if (isDevelopment && process.argv[1])
    app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(scheme);
}

app.whenReady().then(async () => {
  debugLogService = new DebugLogService({ logsDir: app.getPath("logs") });
  await debugLogService.initialize();
  const persistedSettings = await readFile(path.join(app.getPath("userData"), "user-setting.json"), "utf8").catch(
    () => ""
  );
  debugLogService.setEnabled(parsePersistedDebugLogEnabled(persistedSettings));
  activateDebugLogService(debugLogService);
  if (debugLogService.isEnabled) {
    electronLog.info(`debug log enabled: ${debugLogService.filePath}`);
  }
  electronLog.info(`${productName} ${app.getVersion()} ready platform=${process.platform} packaged=${app.isPackaged}`);
  await registerProtocols();
  applicationConfig = new ApplicationConfigService(app, projectRoot);
  await applicationConfig.initialize();
  localApplicationLauncher = new LocalApplicationLauncher(app, projectRoot, applicationConfig, shell, !isDevelopment);
  authService = new DesktopAuthService(emitDesktopEvent);
  await authService.initialize();
  drainPendingProtocolUrls();
  offlineRecordings = new OfflineRecordingStore(path.join(app.getPath("userData"), "offline-recordings"));
  await offlineRecordings.initialize();
  ffmpegPlugin = new FfmpegPluginManager(
    path.join(app.getPath("userData"), "plugins"),
    (url, options) => net.fetch(toFetchUrl(url), options),
    (payload, label) => emitDesktopEvent("ffmpeg-plugin-progress", payload, label)
  );
  replayTranscoder = new ReplayTranscoder(
    projectRoot,
    (payload, label) => emitDesktopEvent("transcode-progress", payload, label),
    ffmpegPlugin
  );
  ipcMain.handle("jms:invoke", handleInvoke);
  if (process.platform === "darwin") {
    const icon = loadAppIcon();
    if (icon) app.dock.setIcon(icon);
  }
  buildMenu();
  setupTray();
  nativeTheme.on("updated", () => {
    emitDesktopEvent("desktop://theme-changed", nativeTheme.shouldUseDarkColors ? "dark" : "light");
  });
  createWindow("main");
});
