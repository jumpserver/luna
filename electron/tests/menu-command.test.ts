import assert from "node:assert/strict";
import test from "node:test";
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
