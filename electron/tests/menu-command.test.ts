import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { MenuItemConstructorOptions } from "electron";
import ts from "typescript";
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
