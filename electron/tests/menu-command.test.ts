import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { MenuItemConstructorOptions } from "electron";
import ts from "typescript";
import {
  matchesShortcut,
  normalizeShortcutOverrides,
  shortcutAccelerator,
  shortcutBindings,
  shortcutDefinitions
} from "../../ui/shared/shortcuts.ts";
import { editCopyAccelerator, menuCommandTargetLabel } from "../src/shared/menu-command.ts";

test("copy stays Cmd+C on macOS and does not steal Ctrl+C elsewhere", () => {
  assert.equal(editCopyAccelerator("darwin"), "Cmd+C");
  assert.equal(editCopyAccelerator("win32"), "Ctrl+Shift+C");
  assert.equal(editCopyAccelerator("linux"), "Ctrl+Shift+C");
});

test("menu commands target the focused window and fall back to main", () => {
  assert.equal(menuCommandTargetLabel("asset-1"), "asset-1");
  assert.equal(menuCommandTargetLabel("main"), "main");
  assert.equal(menuCommandTargetLabel(""), "main");
  assert.equal(menuCommandTargetLabel(null), "main");
  assert.equal(menuCommandTargetLabel(undefined), "main");
});

test("the native close-tab shortcut targets the focused workspace without closing its window", () => {
  const source = readFileSync(new URL("../src/desktop/main.ts", import.meta.url), "utf8");
  const functions = ["menuLabels", "sendMenuCommand", "buildMenu"].map((name) => {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `Missing ${name}`);
    return match[0];
  });
  const { outputText } = ts.transpileModule(`${functions.join("\n")}\nbuildMenu();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  });

  for (const platform of ["darwin", "win32", "linux"]) {
    let focusedLabel: string | null = "main";
    let template: MenuItemConstructorOptions[] = [];
    const events: unknown[][] = [];
    runInNewContext(outputText, {
      process: { platform },
      productName: "JumpServer",
      prefersZh: () => false,
      editCopyAccelerator,
      shortcutAccelerator,
      shortcutOverrides: {},
      shortcutEnvironment: { mac: platform === "darwin", desktop: true },
      menuCommandTargetLabel,
      openAboutWindow() {},
      openSettingsWindow() {},
      sendMainWindowEvent: () => assert.fail("Closing a tab must not activate the main window"),
      BrowserWindow: {
        getFocusedWindow: () => (focusedLabel ? { label: focusedLabel, isDestroyed: () => false } : null)
      },
      labelForWindow: (window: { label: string }) => window.label,
      emitDesktopEvent: (...args: unknown[]) => events.push(args),
      Menu: {
        buildFromTemplate: (items: MenuItemConstructorOptions[]) => items,
        setApplicationMenu: (items: MenuItemConstructorOptions[]) => (template = items)
      }
    });
    const items = template.flatMap((menu) => menu.submenu as MenuItemConstructorOptions[]);
    const closeTabs = items.filter((item) => item.accelerator === "CmdOrCtrl+W");
    assert.equal(closeTabs.length, 1);
    assert.equal(closeTabs[0].label, "Close Current Tab");
    assert.equal(closeTabs[0].role, undefined);
    assert.ok(closeTabs[0].click);
    for (const label of ["main", "asset-1", null]) {
      focusedLabel = label;
      closeTabs[0].click(undefined, undefined, undefined);
      assert.deepEqual(events.pop(), ["desktop-menu-command", "close-current-tab", label || "main"]);
    }
    const closeWindows = items.filter((item) => item.role === "close");
    assert.ok(closeWindows.length > 0);
    assert.ok(closeWindows.every((item) => item.accelerator === "CmdOrCtrl+Shift+W"));
    assert.ok(items.some((item) => item.role === "quit" && item.accelerator === "CmdOrCtrl+Q"));
  }
});

test("custom and disabled accelerators update native menus without disabling menu actions", () => {
  const source = readFileSync(new URL("../src/desktop/main.ts", import.meta.url), "utf8");
  const functions = ["menuLabels", "buildMenu"].map(
    (name) => source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))![0]
  );
  const { outputText } = ts.transpileModule(`${functions.join("\n")}\nbuildMenu();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  });
  let template: MenuItemConstructorOptions[] = [];
  const commands: string[] = [];
  runInNewContext(outputText, {
    process: { platform: "darwin" },
    productName: "JumpServer",
    prefersZh: () => false,
    editCopyAccelerator,
    shortcutAccelerator,
    shortcutOverrides: { closeTab: "Mod+Shift+KeyE", localShell: null, focus: null, fullscreen: "Mod+Alt+KeyF" },
    shortcutEnvironment: { mac: true, desktop: true },
    openAboutWindow() {},
    openSettingsWindow() {},
    sendMenuCommand: (command: string) => commands.push(command),
    Menu: {
      buildFromTemplate: (items: MenuItemConstructorOptions[]) => items,
      setApplicationMenu: (items: MenuItemConstructorOptions[]) => {
        template = items;
      }
    }
  });
  const items = template.flatMap((menu) => menu.submenu as MenuItemConstructorOptions[]);
  assert.ok(
    !items.some((item) =>
      ["CmdOrCtrl+W", "CmdOrCtrl+T", "CmdOrCtrl+Shift+P", "CmdOrCtrl+Shift+F"].includes(item.accelerator as string)
    )
  );
  const close = items.find((item) => item.accelerator === "CmdOrCtrl+Shift+E")!;
  assert.ok(close);
  close.click!(undefined, undefined, undefined);
  assert.deepEqual(commands, ["close-current-tab"]);
  assert.ok(items.some((item) => item.accelerator === "CmdOrCtrl+Alt+F"));
  const focus = items.find((item) => item.label === "Focus Mode")!;
  assert.equal(focus.accelerator, undefined);
  assert.ok(focus.click);
});

test("native keyboard routing leaves scope resolution to the renderer and suspends menus while recording", () => {
  const source = readFileSync(new URL("../src/desktop/main.ts", import.meta.url), "utf8");
  const callback = source.match(/^ {2}windowWebContents.on\("before-input-event", [^]*?^ {2}\}\);/m)![0];
  const { outputText } = ts.transpileModule(callback, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  let listener: (event: unknown, input: unknown) => void;
  let ignoreMenu = false;
  const webContents = {
    on: (_name, callback) => {
      listener = callback;
    },
    setIgnoreMenuShortcuts: (value) => {
      ignoreMenu = value;
    }
  };
  const overrides = { closeTab: "Mod+Shift+KeyE" as string | null };
  const recorders = new WeakSet();
  runInNewContext(outputText, {
    windowWebContents: webContents,
    shortcutOverrides: overrides,
    shortcutEnvironment: { mac: false, desktop: true },
    shortcutRecorders: recorders,
    matchesShortcut,
    shortcutBindings,
    shortcutDefinitions
  });
  const input = (code: string, properties = {}) =>
    listener!({}, { code, control: true, meta: false, alt: false, shift: false, ...properties });
  input("KeyE", { shift: true });
  assert.equal(ignoreMenu, true);
  input("KeyW");
  assert.equal(ignoreMenu, false);
  input("KeyW", { control: false, alt: true, shift: true });
  assert.equal(ignoreMenu, false);
  overrides.closeTab = null;
  input("KeyE", { shift: true });
  assert.equal(ignoreMenu, false);
  recorders.add(webContents);
  input("KeyQ");
  assert.equal(ignoreMenu, true);
});

test("shortcut settings and subscriptions update every loaded window store", async () => {
  const source = readFileSync(new URL("../src/desktop/main.ts", import.meta.url), "utf8");
  const handler = source.match(/^async function handleStore\([^]*?^}/m)![0];
  const { outputText } = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  const stores = new Map([
    [1, { path: "/settings/user-setting.json", data: { state: {} } }],
    [2, { path: "/settings/user-setting.json", data: { state: {} } }],
    [3, { path: "/settings/other.json", data: { state: {} } }]
  ]);
  const events: unknown[][] = [];
  let menuBuilds = 0;
  const handle = runInNewContext(`${outputText}; handleStore;`, {
    stores,
    normalizeShortcutOverrides,
    shortcutOverrides: {},
    path: { basename: (value: string) => value.split("/").at(-1) },
    buildMenu: () => {
      menuBuilds++;
    },
    emitDesktopEvent: (...event: unknown[]) => events.push(event)
  });
  const state = { shortcutOverrides: { focus: null, closeTab: "Mod+Shift+KeyE" }, language: "zh" };
  await handle("plugin:store|set", { rid: 1, key: "state", value: state });
  assert.equal(stores.get(2)!.data.state, state);
  assert.notEqual(stores.get(3)!.data.state, state);
  assert.equal(events.length, 2);
  assert.equal(menuBuilds, 1);
});
