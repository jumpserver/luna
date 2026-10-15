import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { rm } from "node:fs/promises";
import { createReadStream, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isatty } from "node:tty";
import { createWebProxyManager } from "@jumpserver/web-proxy/manager";
import { formatWebProxyMessage, webProxyMessages } from "@jumpserver/web-proxy/i18n";
import { readLaunch } from "./launch";

let startupStage = "初始化运行环境";
let reportingFailure = false;

async function reportFailure(stage: string, error: any) {
  if (reportingFailure) return;
  reportingFailure = true;
  await app.whenReady();
  // JSON parser errors may include the launch payload, including account secrets.
  const reason =
    error?.name === "SyntaxError"
      ? "数据格式无效，请检查连接配置；原始数据已隐藏。"
      : typeof error?.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : "未知错误";
  const message = formatWebProxyMessage(reason, (key, params) => {
    const template = (webProxyMessages.zh.WebProxy as Record<string, string>)[key.slice("WebProxy.".length)] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => String(params?.[name] ?? match));
  });
  const type = `${error?.name || "Error"}${error?.code ? ` (${error.code})` : ""}`;
  const detail = `失败阶段：${stage}\n错误类型：${type}\n原因：${message}\n\n请将以上错误信息提供给管理员，检查连接配置或发布机环境。`;
  console.error(`WebLite 发生错误\n${detail}`);
  dialog.showErrorBox("JumpServer WebLite 发生错误", detail);
  app.exit(1);
}

process.on("uncaughtException", (error) => void reportFailure("主进程运行", error));
process.on("unhandledRejection", (error) => void reportFailure("主进程异步任务", error));

async function start() {
  // Electron may become ready while Tinker is still writing the launch pipe.
  // Isolate both app data and Chromium's session before the first await.
  const profile = mkdtempSync(path.join(os.tmpdir(), "weblite-applet-"));
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  app.setName("JumpServer WebLite");
  // Electron replaces process.stdin with an EOF-only stream on Windows.
  // Read the inherited descriptor directly so AppletArgs survives native launches.
  const input =
    process.platform === "win32" && !isatty(0) ? createReadStream("", { fd: 0, autoClose: false }) : process.stdin;
  startupStage = "读取并校验连接配置（尚未打开资产页面）";
  const launch = await readLaunch(input).catch(async (error) => {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    throw error;
  });
  startupStage = "等待浏览器运行环境就绪";
  await app.whenReady();
  Menu.setApplicationMenu(null);
  startupStage = "创建浏览器窗口";
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    title: "JumpServer WebLite",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  });
  let closing = false;
  let created = false;
  const manager = createWebProxyManager({
    labelForWindow: () => "applet",
    direct: true,
    allowManualNavigation: launch.standalone,
    createSession: async () => {
      const session = launch.localSession;
      launch.localSession = null;
      return session;
    },
    emit: (name, payload) => {
      if (!win.webContents.isDestroyed()) win.webContents.send("web-proxy:event", { name, payload });
    }
  });
  async function close() {
    if (closing) return;
    closing = true;
    for (const [label] of manager.views) {
      const event = { sender: win.webContents };
      await manager.invoke("set_web_proxy_view_active", event, win, { label, active: false }).catch(() => {});
      await manager.invoke("close_web_proxy_view", event, win, { label }).catch(() => {});
    }
    win.destroy();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    app.quit();
  }
  win.on("close", (event) => {
    event.preventDefault();
    void close();
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    if (!closing)
      void reportFailure("浏览器界面进程退出", new Error(`${details.reason} (exitCode: ${details.exitCode})`));
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ipcMain.handle("web-proxy:invoke", async (event, command, args = {}) => {
    if (closing || event.senderFrame !== win.webContents.mainFrame) throw new Error("无效的 Web applet 调用");
    if (command === "report_error") {
      if (typeof args.message !== "string" || !args.message || args.message.length > 4096)
        throw new Error("无效的 WebLite 错误信息");
      void reportFailure("浏览器界面初始化或运行", new Error(args.message));
      return;
    }
    if (command === "bootstrap")
      return {
        language: launch.language?.trim() || app.getLocale(),
        targetUrl: launch.targetUrl,
        proxyUrl: "",
        safeMode: launch.safeMode,
        // The shared surface also serves the desktop proxy; applets use RDP recording.
        recordingEnabled: false,
        allowedUrls: launch.allowedUrls,
        standalone: launch.standalone
      };
    if (command === "create_web_proxy_view") {
      if (created) throw new Error("请关闭当前窗口后重新连接");
      created = true;
      args = {
        ...args,
        targetUrl: launch.targetUrl,
        proxyUrl: "",
        safeMode: launch.safeMode,
        allowedUrls: launch.allowedUrls
      };
    }
    return manager.invoke(command, event, win, args);
  });
  startupStage = "加载浏览器界面";
  await win.loadFile(path.join(__dirname, "renderer/index.html"));
  win.maximize();
  win.show();
}

void start().catch((error) => reportFailure(startupStage, error));
