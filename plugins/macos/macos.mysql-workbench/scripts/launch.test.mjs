import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prepareConnection } from "./launch.mjs";

test("MySQL Workbench uses the existing stdin script interface", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const index = await readJson("../../index.json");
  const defaults = await readJson("../../plugins-state.defaults.json");
  const id = "macos.mysql-workbench";
  assert.equal(index.plugins.find((plugin) => plugin.id === id)?.category, "databases");
  const { launch } = await readJson("../connect.json");
  const icon = await readFile(new URL("../icon.png", import.meta.url));
  assert.equal(icon.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(launch.type, "script");
  assert.equal(launch.interpreter, "node");
  assert.equal(launch.input, "stdin");
  assert.equal(launch.serialize, true);
  assert.ok(!Object.values(defaults.selections).includes(id));
});

test("Workbench uses the MySQL gateway and validates its endpoint", () => {
  const input = {
    protocol: "mysql",
    host: "[2001:db8::10]",
    port: 5500,
    dbname: "demo",
    username: "token-id",
    value: "token-secret"
  };
  const connection = prepareConnection(input);
  assert.equal(connection.host, "2001:db8::10");
  assert.equal(connection.port, "5500");
  assert.equal(connection.database, "demo");
  assert.equal(connection.password, input.value);
  assert.throws(() => prepareConnection({ ...input, protocol: "postgresql" }), /Unsupported Workbench protocol/);
  assert.throws(() => prepareConnection({ ...input, port: 65536 }), /Invalid database connection/);
});
