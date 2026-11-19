import { ipcMain, session, WebContentsView } from "electron";
import type { BrowserWindow } from "electron";
import type { ClientNoticeSnapshot } from "../../../ui/types/index";

interface NoticeLayer {
  host: BrowserWindow;
  view: WebContentsView;
  snapshot: ClientNoticeSnapshot;
  width: number;
  height: number;
  bottom: number;
  ready: boolean;
  sentAppearance?: ClientNoticeSnapshot["appearance"];
}

export class ClientPolicyNoticeLayers {
  private layers = new Map<number, NoticeLayer>();
  private overlaySession: Electron.Session | undefined;

  constructor(
    private options: {
      url: () => string;
      preload: string;
      serveApp: (request: Request) => Promise<Response>;
      dismiss: (host: BrowserWindow, id: string) => void;
    }
  ) {
    ipcMain.on("jms:client-notices-ready", (event) => {
      const layer = [...this.layers.values()].find((item) => item.view.webContents === event.sender);
      if (!layer || event.senderFrame !== event.sender.mainFrame) return;
      layer.ready = true;
      layer.sentAppearance = undefined;
      this.sync(layer);
    });
    ipcMain.on("jms:client-notices-dismiss", (event, id) => {
      const layer = [...this.layers.values()].find((item) => item.view.webContents === event.sender);
      if (
        !layer ||
        event.senderFrame !== event.sender.mainFrame ||
        !layer.snapshot.notices.some((item) => item.id === id)
      )
        return;
      this.options.dismiss(layer.host, id);
    });
  }

  update(host: BrowserWindow, snapshot: ClientNoticeSnapshot, width: number, height: number, bottom = 16) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
    if (!Number.isFinite(bottom) || bottom < 16) return false;
    let layer = this.layers.get(host.id);
    if (!snapshot.notices.length) {
      this.hide(host);
      return false;
    }
    if (!layer) {
      if (!this.overlaySession) {
        // No account storage, cookies or ordinary desktop IPC are available to the overlay.
        this.overlaySession = session.fromPartition("client-policy-notices");
        this.overlaySession.protocol.handle("jms-app", this.options.serveApp);
        this.overlaySession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      }
      const view = new WebContentsView({
        webPreferences: {
          session: this.overlaySession,
          preload: this.options.preload,
          additionalArguments: ["--jms-client-notices"],
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: false
        }
      });
      view.setBackgroundColor("#00000000");
      view.setVisible(false);
      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      view.webContents.on("will-navigate", (event) => event.preventDefault());
      view.webContents.on("will-redirect", (event) => event.preventDefault());
      view.webContents.on("before-input-event", (event, input) =>
        host.webContents.emit("before-input-event", event, input)
      );
      layer = { host, view, snapshot, width, height, bottom, ready: false };
      this.layers.set(host.id, layer);
      host.contentView.addChildView(view);
      host.on("resize", () => {
        if (layer) this.position(layer);
      });
      host.once("closed", () => {
        this.layers.delete(host.id);
        if (!view.webContents.isDestroyed()) view.webContents.close();
      });
      void view.webContents
        .loadURL(this.options.url())
        .catch((error) => console.warn("Client notice overlay failed to load", error));
    }
    layer.snapshot = { ...snapshot, appearance: snapshot.appearance || layer.snapshot.appearance };
    layer.width = width;
    layer.height = height;
    layer.bottom = bottom;
    this.sync(layer);
    return true;
  }

  hide(host: BrowserWindow) {
    const layer = this.layers.get(host.id);
    if (!layer) return;
    layer.snapshot = { ...layer.snapshot, notices: [] };
    layer.view.setVisible(false);
  }

  raise(host: BrowserWindow) {
    const layer = this.layers.get(host.id);
    if (layer?.ready && layer.snapshot.notices.length) host.contentView.addChildView(layer.view);
  }

  private position(layer: NoticeLayer) {
    const [hostWidth, hostHeight] = layer.host.getContentSize();
    const width = Math.min(Math.ceil(layer.width), Math.max(1, hostWidth - 32));
    const bottom = Math.min(Math.ceil(layer.bottom), Math.max(16, hostHeight - 17));
    const height = Math.min(Math.ceil(layer.height), Math.max(1, hostHeight - bottom - 16));
    const bounds = {
      x: Math.max(0, hostWidth - width - 16),
      y: Math.max(0, hostHeight - height - bottom),
      width,
      height
    };
    if (JSON.stringify(layer.view.getBounds()) !== JSON.stringify(bounds)) layer.view.setBounds(bounds);
  }

  private sync(layer: NoticeLayer) {
    this.position(layer);
    if (!layer.ready) return;
    const { appearance, ...snapshot } = layer.snapshot;
    layer.view.webContents.send("jms:client-notices", {
      ...snapshot,
      ...(appearance !== layer.sentAppearance ? { appearance } : {})
    });
    layer.sentAppearance = appearance;
    layer.view.setVisible(layer.snapshot.notices.length > 0);
    this.raise(layer.host);
  }
}
