import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isatty } from "node:tty";
import { createWebProxyManager } from "@jumpserver/web-proxy/manager";
import { readLaunch } from "./launch";

async function start() {
  // Electron replaces process.stdin with an EOF-only stream on Windows.
  // Read the inherited descriptor directly so AppletArgs survives native launches.
  const input =
    process.platform === "win32" && !isatty(0) ? createReadStream("", { fd: 0, autoClose: false }) : process.stdin;
  const launch = await readLaunch(input);
  const profile = await mkdtemp(path.join(os.tmpdir(), "weblite-applet-"));
  app.setPath("userData", profile);
  app.setName("JumpServer WebLite");
  await app.whenReady();
  Menu.setApplicationMenu(null);
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
  async function close(message = "") {
    if (closing) return;
    closing = true;
    for (const [label] of manager.views) {
      const event = { sender: win.webContents };
      await manager.invoke("set_web_proxy_view_active", event, win, { label, active: false }).catch(() => {});
      await manager.invoke("close_web_proxy_view", event, win, { label }).catch(() => {});
    }
    if (message && !win.isDestroyed()) await dialog.showMessageBox(win, { type: "error", message });
    win.destroy();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    app.quit();
  }
  win.on("close", (event) => {
    event.preventDefault();
    void close();
  });
  win.webContents.on("render-process-gone", () => void close("Web 窗口异常退出"));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ipcMain.handle("web-proxy:invoke", async (event, command, args = {}) => {
    if (closing || event.senderFrame !== win.webContents.mainFrame) throw new Error("无效的 Web applet 调用");
    if (command === "bootstrap")
      return {
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
  await win.loadFile(path.join(__dirname, "renderer/index.html"));
  win.maximize();
  win.show();
}

void start().catch(async () => {
  await app.whenReady();
  dialog.showErrorBox("JumpServer WebLite", "WebLite 启动失败，请重试；如从 JumpServer 连接，请检查发布机配置。");
  app.exit(1);
});
