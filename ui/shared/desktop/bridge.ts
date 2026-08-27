import { getName, getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Event, UnlistenFn } from "@tauri-apps/api/event";
import { emit, listen } from "@tauri-apps/api/event";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Theme } from "@tauri-apps/api/window";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { OpenDialogOptions, SaveDialogOptions } from "@tauri-apps/plugin-dialog";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readFile,
  remove,
  rename,
  startAccessingSecurityScopedResource,
  stat,
  stopAccessingSecurityScopedResource,
  writeFile
} from "@tauri-apps/plugin-fs";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import { Store } from "@tauri-apps/plugin-store";
import { desktopDir, dirname, downloadDir, homeDir, join } from "@tauri-apps/api/path";
import { getDesktopRuntime, isDesktopRuntime } from "~/utils/runtime";

interface ElectronSubscription {
  eventId: number;
  callbackId: number;
}

type DesktopWindowOptions = ConstructorParameters<typeof WebviewWindow>[1];

interface ElectronDesktopApi {
  runtime: "electron";
  windowLabel: string;
  platform: string;
  invoke<T>(command: string, args?: unknown, options?: unknown): Promise<T>;
  listen<T>(event: string, handler: (event: Event<T>) => void): Promise<ElectronSubscription>;
  unlisten(subscription: ElectronSubscription): Promise<void>;
  emit<T>(event: string, payload?: T): Promise<void>;
  convertFileSrc(filePath: string, protocol?: string): string;
}

const electronApi = () => (globalThis as typeof globalThis & { __JMS_DESKTOP__?: ElectronDesktopApi }).__JMS_DESKTOP__;

const requireDesktop = () => {
  if (!isDesktopRuntime()) throw new Error("Desktop Bridge is unavailable in the web runtime");
};

export const desktopRuntime = getDesktopRuntime;
export const hasDesktopBridge = isDesktopRuntime;

export async function desktopInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  requireDesktop();
  const electron = electronApi();
  return electron ? electron.invoke<T>(command, args) : invoke<T>(command, args);
}

export async function desktopListen<T>(event: string, handler: (event: Event<T>) => void): Promise<UnlistenFn> {
  requireDesktop();
  const electron = electronApi();
  if (!electron) return listen<T>(event, handler);

  const subscription = await electron.listen(event, handler);
  return () => electron.unlisten(subscription);
}

export async function desktopEmit<T>(event: string, payload?: T): Promise<void> {
  if (!isDesktopRuntime()) return;
  const electron = electronApi();
  if (electron) return electron.emit(event, payload);
  await emit(event, payload);
}

export const desktopWindow = {
  label() {
    const electron = electronApi();
    return electron?.windowLabel || getCurrentWebviewWindow().label;
  },
  isMaximized() {
    const electron = electronApi();
    return electron
      ? electron.invoke<boolean>("plugin:window|is_maximized", { label: electron.windowLabel })
      : getCurrentWindow().isMaximized();
  },
  onResized(handler: () => void) {
    const electron = electronApi();
    return electron ? desktopListen("tauri://resize", handler) : getCurrentWindow().onResized(handler);
  },
  async toggleFullscreen() {
    const electron = electronApi();
    if (electron) {
      const fullscreen = await electron.invoke<boolean>("plugin:window|is_fullscreen", { label: electron.windowLabel });
      await electron.invoke("plugin:window|set_fullscreen", { label: electron.windowLabel, fullscreen: !fullscreen });
      return;
    }

    const currentWindow = getCurrentWindow();
    await currentWindow.setFullscreen(!(await currentWindow.isFullscreen()));
  },
  setFullscreen(fullscreen: boolean) {
    const electron = electronApi();
    return electron
      ? electron.invoke<void>("plugin:window|set_fullscreen", { label: electron.windowLabel, fullscreen })
      : getCurrentWindow().setFullscreen(fullscreen);
  },
  setTitle(title: string) {
    const electron = electronApi();
    return electron
      ? electron.invoke<void>("plugin:window|set_title", { label: electron.windowLabel, title })
      : getCurrentWindow().setTitle(title);
  },
  startDragging() {
    const electron = electronApi();
    return electron
      ? electron.invoke<void>("plugin:window|start_dragging", { label: electron.windowLabel })
      : getCurrentWindow().startDragging();
  },
  async open(label: string, options: DesktopWindowOptions) {
    const electron = electronApi();
    if (electron) {
      await electron.invoke("plugin:webview|create_webview_window", { options: { ...options, label } });
      return { label };
    }
    return new WebviewWindow(label, options);
  },
  theme(): Promise<Theme | null> {
    const electron = electronApi();
    return electron
      ? electron.invoke<Theme>("plugin:window|theme", { label: electron.windowLabel })
      : getCurrentWindow().theme();
  },
  onThemeChanged(handler: (event: Event<Theme>) => void) {
    return electronApi()
      ? desktopListen<Theme>("tauri://theme-changed", handler)
      : getCurrentWindow().onThemeChanged(handler);
  }
};

export const desktopApp = {
  getVersion: () => electronApi()?.invoke<string>("plugin:app|version") ?? getVersion(),
  getName: () => electronApi()?.invoke<string>("plugin:app|name") ?? getName()
};

export const desktopOs = {
  platform: () => {
    const electron = electronApi();
    return electron ? Promise.resolve(electron.platform) : platform();
  },
  locale: () =>
    electronApi()?.invoke<string | null>("plugin:os|locale") ??
    import("@tauri-apps/plugin-os").then((os) => os.locale())
};

export const desktopClipboard = {
  readText: () => electronApi()?.invoke<string>("plugin:clipboard-manager|read_text") ?? readText(),
  writeText: (text: string) =>
    electronApi()?.invoke<void>("plugin:clipboard-manager|write_text", { text }) ?? writeText(text),
  async writeImage(rgba: Uint8Array, width: number, height: number) {
    const electron = electronApi();
    if (electron) {
      await electron.invoke("desktop_clipboard_write_image", { rgba, width, height });
      return;
    }

    const image = await TauriImage.new(rgba, width, height);
    try {
      await writeImage(image);
    } finally {
      await image.close();
    }
  }
};

export const desktopOpener = {
  openUrl: (url: string) => electronApi()?.invoke<void>("plugin:opener|open_url", { url }) ?? openUrl(url),
  openPath: (path: string) => electronApi()?.invoke<string>("plugin:opener|open_path", { path }) ?? openPath(path)
};

export const desktopDialog = {
  open: (options?: OpenDialogOptions) =>
    electronApi()?.invoke<string | string[] | null>("plugin:dialog|open", { options }) ?? open(options),
  save: (options?: SaveDialogOptions) =>
    electronApi()?.invoke<string | null>("plugin:dialog|save", { options }) ?? save(options)
};

export const desktopFs = {
  isAvailable: hasDesktopBridge,
  homeDir: () => electronApi()?.invoke<string>("plugin:path|resolve_directory", { directory: 21 }) ?? homeDir(),
  desktopDir: () => electronApi()?.invoke<string>("plugin:path|resolve_directory", { directory: 18 }) ?? desktopDir(),
  downloadDir: () => electronApi()?.invoke<string>("plugin:path|resolve_directory", { directory: 7 }) ?? downloadDir(),
  join: (...paths: string[]) => electronApi()?.invoke<string>("plugin:path|join", { paths }) ?? join(...paths),
  dirname: (path: string) => electronApi()?.invoke<string>("plugin:path|dirname", { path }) ?? dirname(path),
  readDir: (path: string) =>
    electronApi()?.invoke<Awaited<ReturnType<typeof readDir>>>("plugin:fs|read_dir", { path }) ?? readDir(path),
  stat: (path: string) =>
    electronApi()?.invoke<Awaited<ReturnType<typeof stat>>>("plugin:fs|stat", { path }) ?? stat(path),
  async readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const electron = electronApi();
    const data = electron ? await electron.invoke<Uint8Array>("plugin:fs|read_file", { path }) : await readFile(path);
    return Uint8Array.from(data);
  },
  writeFile: (path: string, data: Uint8Array) => {
    const electron = electronApi();
    return electron
      ? electron.invoke<void>("plugin:fs|write_file", data, { headers: { path: encodeURIComponent(path) } })
      : writeFile(path, data);
  },
  exists: (path: string) => electronApi()?.invoke<boolean>("plugin:fs|exists", { path }) ?? exists(path),
  mkdir: (path: string, options?: { recursive?: boolean }) =>
    electronApi()?.invoke<void>("plugin:fs|mkdir", { path, options }) ?? mkdir(path, options),
  rename: (oldPath: string, newPath: string) =>
    electronApi()?.invoke<void>("plugin:fs|rename", { oldPath, newPath }) ?? rename(oldPath, newPath),
  remove: (path: string, options?: { recursive?: boolean }) =>
    electronApi()?.invoke<void>("plugin:fs|remove", { path, options }) ?? remove(path, options),
  startAccessingSecurityScopedResource: (path: string) =>
    electronApi()?.invoke<void>("plugin:fs|start_accessing_security_scoped_resource", { path }) ??
    startAccessingSecurityScopedResource(path),
  stopAccessingSecurityScopedResource: (path: string) =>
    electronApi()?.invoke<void>("plugin:fs|stop_accessing_security_scoped_resource", { path }) ??
    stopAccessingSecurityScopedResource(path),
  chooseFolder: (title: string) => desktopDialog.open({ directory: true, multiple: false, title }),
  revealItemInDir: (path: string) =>
    electronApi()?.invoke<void>("plugin:opener|reveal_item_in_dir", { paths: [path] }) ?? revealItemInDir(path)
};

export interface DesktopLocalShellOutput {
  sessionId: string;
  data: number[];
}

export interface DesktopLocalShellExit {
  sessionId: string;
}

export const desktopLocalShell = {
  start: (sessionId: string, cols: number, rows: number) =>
    desktopInvoke<{ shell: string }>("start_local_shell", { sessionId, cols, rows }),
  write: (sessionId: string, data: string) =>
    desktopInvoke<void>("write_local_shell", {
      sessionId,
      data: Array.from(new TextEncoder().encode(data))
    }),
  resize: (sessionId: string, cols: number, rows: number) =>
    desktopInvoke<void>("resize_local_shell", { sessionId, cols, rows }),
  close: (sessionId: string) => desktopInvoke<void>("close_local_shell", { sessionId }),
  onOutput: (handler: (event: Event<DesktopLocalShellOutput>) => void) => desktopListen("local-shell-output", handler),
  onExit: (handler: (event: Event<DesktopLocalShellExit>) => void) => desktopListen("local-shell-exit", handler)
};

export const desktopWebProxy = {
  create: (request: Record<string, unknown>) => desktopInvoke("create_web_proxy_view", request),
  setActive: (label: string, active: boolean) => desktopInvoke<void>("set_web_proxy_view_active", { label, active }),
  setBounds: (label: string, bounds: { x: number; y: number; width: number; height: number }) =>
    desktopInvoke<void>("set_web_proxy_view_bounds", { label, ...bounds }),
  navigate: (label: string, targetUrl: string) => desktopInvoke<void>("navigate_web_proxy_view", { label, targetUrl }),
  history: (label: string, direction: "back" | "forward") =>
    desktopInvoke<void>("history_web_proxy_view", { label, direction }),
  reload: (label: string) => desktopInvoke<void>("reload_web_proxy_view", { label }),
  startRecording: (request: Record<string, unknown>) => desktopInvoke("start_web_proxy_recording", request),
  stopRecording: (label: string) => desktopInvoke("stop_web_proxy_recording", { label }),
  close: (label: string) => desktopInvoke<void>("close_web_proxy_view", { label }),
  onState: <T>(handler: (event: Event<T>) => void) => desktopListen<T>("web-proxy-state", handler),
  onAutofillState: <T>(handler: (event: Event<T>) => void) => desktopListen<T>("web-proxy-autofill-state", handler),
  onRecordingState: <T>(handler: (event: Event<T>) => void) => desktopListen<T>("web-proxy-recording-state", handler)
};

export interface DesktopStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
  onChange(handler: (key: string, value: unknown) => void): Promise<UnlistenFn>;
}

export const desktopStore = {
  async load(path: string, defaults: Record<string, unknown>): Promise<DesktopStore> {
    const electron = electronApi();
    if (!electron) return Store.load(path, { defaults });

    const rid = await electron.invoke<number>("plugin:store|load", { path, options: { defaults } });
    return {
      async get<T>(key: string) {
        const result = await electron.invoke<[T | null, boolean]>("plugin:store|get", { rid, key });
        return result[1] ? result[0] : null;
      },
      set: (key, value) => {
        const plainValue = value === undefined ? null : JSON.parse(JSON.stringify(value));
        return electron.invoke("plugin:store|set", { rid, key, value: plainValue });
      },
      save: () => electron.invoke("plugin:store|save", { rid }),
      onChange: (handler) =>
        desktopListen<{ resourceId: number; key: string; value: unknown }>("store://change", ({ payload }) => {
          if (payload.resourceId === rid) handler(payload.key, payload.value);
        })
    };
  }
};

export function desktopConvertFileSrc(filePath: string, protocol?: string) {
  return electronApi()?.convertFileSrc(filePath, protocol) ?? convertFileSrc(filePath, protocol);
}
