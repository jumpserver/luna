import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveExecutablePath } from "../src/desktop/executable-path.ts";

test("resolves absolute executable paths and rejects relative ones", () => {
  assert.equal(resolveExecutablePath(process.execPath), path.resolve(process.execPath));
  assert.throws(() => resolveExecutablePath("wezterm.exe"), /absolute/);
  assert.throws(() => resolveExecutablePath(""), /absolute/);
  assert.throws(() => resolveExecutablePath("  "), /absolute/);
});
