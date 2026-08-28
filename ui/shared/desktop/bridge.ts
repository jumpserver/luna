import { getDesktopRuntime, isElectronRuntime } from "~/utils/runtime";

export interface DesktopEvent<T> {
  event?: string;
  id?: number;
  payload: T;
}

export type DesktopUnlistenFn = () => void;
export type DesktopTheme = "light" | "dark";

export interface DesktopWindowOptions {
  url?: string;
  title?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  center?: boolean;
  resizable?: boolean;
  fullscreen?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  visible?: boolean;
  [key: string]: unknown;
}

export interface DesktopDialogFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenDialogOptions {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: DesktopDialogFilter[];
}

export interface DesktopSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DesktopDialogFilter[];
}

export interface DesktopFileEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface DesktopFileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
}

interface ElectronSubscription {
  eventId: number;
  callbackId: number;
}

interface ElectronDesktopApi {
  runtime: "electron";
  windowLabel: string;
  platform: string;
  invoke<T>(command: string, args?: unknown, options?: unknown): Promise<T>;
  listen<T>(event: string, handler: (event: DesktopEvent<T>) => void): Promise<ElectronSubscription>;
  unlisten(subscription: ElectronSubscription): Promise<void>;
  emit<T>(event: string, payload?: T): Promise<void>;
  convertFileSrc(filePath: string, protocol?: string): string;
}

const electronApi = () => (globalThis as typeof globalThis & { __JMS_DESKTOP__?: ElectronDesktopApi }).__JMS_DESKTOP__;

const requireElectron = () => {
  const electron = electronApi();
  if (!electron) throw new Error("Electron bridge is unavailable in the web runtime");
  return electron;
};

export const desktopRuntime = getDesktopRuntime;
export const hasDesktopBridge = isElectronRuntime;

export async function desktopInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return requireElectron().invoke<T>(command, args);
}

export async function desktopListen<T>(
  event: string,
  handler: (event: DesktopEvent<T>) => void
): Promise<DesktopUnlistenFn> {
  const electron = requireElectron();
  const subscription = await electron.listen(event, handler);
  return () => void electron.unlisten(subscription);
}

export async function desktopEmit<T>(event: string, payload?: T): Promise<void> {
  if (!isElectronRuntime()) return;
  await requireElectron().emit(event, payload);
}

export const desktopWindow = {
  label: () => electronApi()?.windowLabel || "main",
  isMaximized: () => {
    const electron = requireElectron();
    return electron.invoke<boolean>("plugin:window|is_maximized", { label: electron.windowLabel });
  },
  onResized: (handler: () => void) => desktopListen("desktop://resize", handler),
  async toggleFullscreen() {
    const electron = requireElectron();
    const fullscreen = await electron.invoke<boolean>("plugin:window|is_fullscreen", {
      label: electron.windowLabel
    });
    await electron.invoke("plugin:window|set_fullscreen", { label: electron.windowLabel, fullscreen: !fullscreen });
  },
  setFullscreen(fullscreen: boolean) {
    const electron = requireElectron();
    return electron.invoke<void>("plugin:window|set_fullscreen", { label: electron.windowLabel, fullscreen });
  },
  setTitle(title: string) {
    const electron = requireElectron();
    return electron.invoke<void>("plugin:window|set_title", { label: electron.windowLabel, title });
  },
  startDragging() {
    const electron = requireElectron();
    return electron.invoke<void>("plugin:window|start_dragging", { label: electron.windowLabel });
  },
  async open(label: string, options: DesktopWindowOptions) {
    await requireElectron().invoke("plugin:webview|create_webview_window", { options: { ...options, label } });
    return { label };
  },
  theme(): Promise<DesktopTheme | null> {
    const electron = requireElectron();
    return electron.invoke<DesktopTheme>("plugin:window|theme", { label: electron.windowLabel });
  },
  onThemeChanged(handler: (event: DesktopEvent<DesktopTheme>) => void) {
    return desktopListen<DesktopTheme>("desktop://theme-changed", handler);
  }
};

export const desktopApp = {
  getVersion: () => requireElectron().invoke<string>("plugin:app|version"),
  getName: () => requireElectron().invoke<string>("plugin:app|name")
};

export const desktopOs = {
  platform: () => Promise.resolve(requireElectron().platform),
  locale: () => requireElectron().invoke<string | null>("plugin:os|locale")
};

export const desktopClipboard = {
  readText: () => requireElectron().invoke<string>("plugin:clipboard-manager|read_text"),
  writeText: (text: string) => requireElectron().invoke<void>("plugin:clipboard-manager|write_text", { text }),
  writeImage: (rgba: Uint8Array, width: number, height: number) =>
    requireElectron().invoke<void>("desktop_clipboard_write_image", { rgba, width, height })
};

export const desktopOpener = {
  openUrl: (url: string) => requireElectron().invoke<void>("plugin:opener|open_url", { url }),
  openPath: (path: string) => requireElectron().invoke<string>("plugin:opener|open_path", { path }),
  revealItemInDir: (path: string) =>
    requireElectron().invoke<void>("plugin:opener|reveal_item_in_dir", { paths: [path] })
};

let lastOpenedAuthUrl = "";
let lastOpenedAuthAt = 0;

export function openDesktopAuthUrl(url: string) {
  if (!url || !isElectronRuntime()) return;
  const now = Date.now();
  if (url === lastOpenedAuthUrl && now - lastOpenedAuthAt < 3000) return;
  lastOpenedAuthUrl = url;
  lastOpenedAuthAt = now;
  void desktopOpener.openUrl(url);
}

export const desktopDialog = {
  open: (options?: DesktopOpenDialogOptions) =>
    requireElectron().invoke<string | string[] | null>("plugin:dialog|open", { options }),
  save: (options?: DesktopSaveDialogOptions) =>
    requireElectron().invoke<string | null>("plugin:dialog|save", { options })
};

export const desktopFs = {
  isAvailable: hasDesktopBridge,
  homeDir: () => requireElectron().invoke<string>("plugin:path|resolve_directory", { directory: 21 }),
  desktopDir: () => requireElectron().invoke<string>("plugin:path|resolve_directory", { directory: 18 }),
  downloadDir: () => requireElectron().invoke<string>("plugin:path|resolve_directory", { directory: 7 }),
  join: (...paths: string[]) => requireElectron().invoke<string>("plugin:path|join", { paths }),
  dirname: (path: string) => requireElectron().invoke<string>("plugin:path|dirname", { path }),
  readDir: (path: string) => requireElectron().invoke<DesktopFileEntry[]>("plugin:fs|read_dir", { path }),
  stat: (path: string) => requireElectron().invoke<DesktopFileInfo>("plugin:fs|stat", { path }),
  async readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const data = await requireElectron().invoke<Uint8Array>("plugin:fs|read_file", { path });
    return Uint8Array.from(data);
  },
  writeFile: (path: string, data: Uint8Array) =>
    requireElectron().invoke<void>("plugin:fs|write_file", data, {
      headers: { path: encodeURIComponent(path) }
    }),
  exists: (path: string) => requireElectron().invoke<boolean>("plugin:fs|exists", { path }),
  mkdir: (path: string, options?: { recursive?: boolean }) =>
    requireElectron().invoke<void>("plugin:fs|mkdir", { path, options }),
  rename: (oldPath: string, newPath: string) =>
    requireElectron().invoke<void>("plugin:fs|rename", { oldPath, newPath }),
  remove: (path: string, options?: { recursive?: boolean }) =>
    requireElectron().invoke<void>("plugin:fs|remove", { path, options }),
  startAccessingSecurityScopedResource: (path: string) =>
    requireElectron().invoke<void>("plugin:fs|start_accessing_security_scoped_resource", { path }),
  stopAccessingSecurityScopedResource: (path: string) =>
    requireElectron().invoke<void>("plugin:fs|stop_accessing_security_scoped_resource", { path }),
  chooseFolder: (title: string) => desktopDialog.open({ directory: true, multiple: false, title }),
  revealItemInDir: desktopOpener.revealItemInDir
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
  onOutput: (handler: (event: DesktopEvent<DesktopLocalShellOutput>) => void) =>
    desktopListen("local-shell-output", handler),
  onExit: (handler: (event: DesktopEvent<DesktopLocalShellExit>) => void) => desktopListen("local-shell-exit", handler)
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
  onState: <T>(handler: (event: DesktopEvent<T>) => void) => desktopListen<T>("web-proxy-state", handler),
  onAutofillState: <T>(handler: (event: DesktopEvent<T>) => void) =>
    desktopListen<T>("web-proxy-autofill-state", handler),
  onRecordingState: <T>(handler: (event: DesktopEvent<T>) => void) =>
    desktopListen<T>("web-proxy-recording-state", handler)
};

export interface DesktopStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
  onChange(handler: (key: string, value: unknown) => void): Promise<DesktopUnlistenFn>;
}

export const desktopStore = {
  async load(path: string, defaults: Record<string, unknown>): Promise<DesktopStore> {
    const electron = requireElectron();
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
  return electronApi()?.convertFileSrc(filePath, protocol) || filePath;
}
