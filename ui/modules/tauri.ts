import * as tauriApp from "@tauri-apps/api/app";
import * as tauriCore from "@tauri-apps/api/core";
import * as tauriEvent from "@tauri-apps/api/event";
import * as tauriPath from "@tauri-apps/api/path";
import * as tauriWebviewWindow from "@tauri-apps/api/webviewWindow";
import * as tauriWindow from "@tauri-apps/api/window";
import * as tauriClipboardManager from "@tauri-apps/plugin-clipboard-manager";
import * as tauriNotification from "@tauri-apps/plugin-notification";
import * as tauriOs from "@tauri-apps/plugin-os";
import * as tauriShell from "@tauri-apps/plugin-shell";
import * as tauriStore from "@tauri-apps/plugin-store";
import * as tauriProgress from "@tauri-apps/plugin-process";
import * as tauriDialog from "@tauri-apps/plugin-dialog";
import { addImports, defineNuxtModule } from "nuxt/kit";

declare interface ModuleOptions {
  prefix: false | string;
}

const capitalize = (name: string) => {
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const tauriModules = [
  { module: tauriApp, prefix: "App", importPath: "@tauri-apps/api/app" },
  {
    module: tauriWindow,
    prefix: "Window",
    importPath: "@tauri-apps/api/window"
  },
  {
    module: tauriWebviewWindow,
    prefix: "WebviewWindow",
    importPath: "@tauri-apps/api/webviewWindow"
  },
  {
    module: tauriClipboardManager,
    prefix: "ClipboardManager",
    importPath: "@tauri-apps/plugin-clipboard-manager"
  },
  {
    module: tauriEvent,
    prefix: "Event",
    importPath: "@tauri-apps/api/event"
  },
  {
    module: tauriCore,
    prefix: "Core",
    importPath: "@tauri-apps/api/core"
  },
  {
    module: tauriShell,
    prefix: "Shell",
    importPath: "@tauri-apps/plugin-shell"
  },
  {
    module: tauriProgress,
    prefix: "Process",
    importPath: "@tauri-apps/plugin-process"
  },
  { module: tauriOs, prefix: "Os", importPath: "@tauri-apps/plugin-os" },
  {
    module: tauriNotification,
    prefix: "Notification",
    importPath: "@tauri-apps/plugin-notification"
  },
  {
    module: tauriDialog,
    prefix: "Dialog",
    importPath: "@tauri-apps/plugin-dialog"
  },
  {
    module: tauriStore,
    prefix: "Store",
    importPath: "@tauri-apps/plugin-store"
  },
  { module: tauriPath, prefix: "Path", importPath: "@tauri-apps/api/path" }
];

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "nuxt-tauri",
    configKey: "tauri"
  },
  defaults: {
    prefix: "useTauri"
  },
  setup(options) {
    tauriModules.forEach(({ module, prefix, importPath }) => {
      Object.keys(module)
        .filter((name) => name !== "default")
        .forEach((name) => {
          const prefixedName = `${options.prefix}${prefix}` || "";
          const as = prefixedName ? prefixedName + capitalize(name) : name;
          addImports({ from: importPath, name, as });
        });
    });
  }
});
