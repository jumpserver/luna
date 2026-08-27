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
