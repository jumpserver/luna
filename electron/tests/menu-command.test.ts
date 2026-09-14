import assert from "node:assert/strict";
import test from "node:test";
import { menuCommandTargetLabel } from "../src/shared/menu-command.ts";

test("menu commands target the focused window and fall back to main", () => {
  assert.equal(menuCommandTargetLabel("asset-1"), "asset-1");
  assert.equal(menuCommandTargetLabel("main"), "main");
  assert.equal(menuCommandTargetLabel(""), "main");
  assert.equal(menuCommandTargetLabel(null), "main");
  assert.equal(menuCommandTargetLabel(undefined), "main");
});
