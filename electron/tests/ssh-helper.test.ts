import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { LocalApplicationLauncher } from "../src/apps/local-app-launcher.ts";

test("uses the packaged Go SSH helper", () => {
  const launcher = new LocalApplicationLauncher({ isPackaged: true }, path.join("", "resources"), null, null);
  const command = launcher.helperCommand();

  assert.match(command, /resources.*bin.*jms-ssh(?:\.exe)?/);
  assert.doesNotMatch(command, /Electron|--ssh-helper/);
});

test("uses the staged Go SSH helper in development", () => {
  const launcher = new LocalApplicationLauncher({ isPackaged: false }, path.join("", "project"), null, null);

  assert.match(launcher.helperCommand(), /project.*\.electron-resources.*bin.*jms-ssh(?:\.exe)?/);
});
