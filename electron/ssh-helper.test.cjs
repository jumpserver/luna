const assert = require("node:assert/strict");
const test = require("node:test");
const { parseOptions } = require("./ssh-helper.cjs");

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

test("uses the short Electron bootstrap command in packaged builds", async () => {
  const { LocalApplicationLauncher } = await import("./local-app-launcher.mjs");
  const launcher = new LocalApplicationLauncher({ isPackaged: true }, "", null, null);
  const command = launcher.helperCommand();

  assert.match(command, / --ssh-helper$/);
  assert.doesNotMatch(command, /ELECTRON_RUN_AS_NODE|ssh-helper\.cjs/);
});

test("uses the development helper command in the branded macOS wrapper", async () => {
  const { LocalApplicationLauncher } = await import("./local-app-launcher.mjs");
  const launcher = new LocalApplicationLauncher({ isPackaged: true, getAppPath: () => "/app" }, "", null, null, false);
  const command = launcher.helperCommand();

  assert.match(command, /ELECTRON_RUN_AS_NODE|set "ELECTRON_RUN_AS_NODE=1"/);
  assert.match(command, /ssh-helper\.cjs/);
  assert.doesNotMatch(command, / --ssh-helper$/);
});
