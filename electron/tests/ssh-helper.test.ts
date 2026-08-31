import assert from "node:assert/strict";
import test from "node:test";
import { LocalApplicationLauncher } from "../src/apps/local-app-launcher.ts";
import { parseOptions } from "../src/apps/ssh-helper.ts";

test("parses the terminal SSH helper arguments", () => {
  assert.deepEqual(parseOptions(["ssh", "JMS-id@localhost", "-p", "2222", "-P", "secret"]), {
    username: "JMS-id",
    host: "localhost",
    port: 2222,
    password: "secret"
  });
});

test("rejects malformed SSH helper arguments", () => {
  assert.throws(() => parseOptions(["user@host", "-p", "70000"]), /invalid SSH port/);
  assert.throws(() => parseOptions(["user@host", "--unknown"]), /unsupported SSH helper argument/);
});

test("uses the Electron bootstrap helper flag", () => {
  const launcher = new LocalApplicationLauncher({ isPackaged: true }, "", null, null);
  const command = launcher.helperCommand();

  assert.match(command, / --ssh-helper$/);
  assert.doesNotMatch(command, /ELECTRON_RUN_AS_NODE|ssh-helper\.(?:cjs|ts)/);
});
