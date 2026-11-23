import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prepareConnection } from "./launch.mjs";

const connection = {
  protocol: "postgresql",
  host: "proxy.example",
  port: 5500,
  dbname: "demo",
  username: "token-id",
  value: "token-secret"
};

test("DataGrip uses the existing stdin script interface", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const index = await readJson("../../index.json");
  const defaults = await readJson("../../plugins-state.defaults.json");
  const id = "macos.datagrip";
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

test("DataGrip preserves database options in credential-free JDBC URLs", () => {
  const connect = (protocol, options = {}) => prepareConnection({ ...connection, protocol, ...options });
  const postgres = connect("postgresql", { host: "2001:db8::10", dbname: "db &/# 中文" });
  assert.equal(postgres.jdbc, "jdbc:postgresql://[2001:db8::10]:5500/db%20%26%2F%23%20%E4%B8%AD%E6%96%87");
  assert.equal(postgres.driver, "PostgreSQL");
  assert.equal(connect("mysql").driver, "MySQL");
  assert.equal(postgres.password, connection.value);
  assert.equal(
    connect("sqlserver", { dbname: "a};encrypt=true" }).jdbc,
    "jdbc:sqlserver://proxy.example:5500;databaseName={a}};encrypt=true};encrypt=false"
  );
  const oracle = connect("oracle", { dbname: connection.username, connect_options: { use_sysdba: true } });
  assert.equal(oracle.jdbc, "jdbc:oracle:thin:@//proxy.example:5500/token-id");
  assert.equal(oracle.sysdba, true);
  const mongo = connect("mongodb");
  assert.equal(mongo.driver, "MongoDB");
  assert.equal(mongo.jdbc, "mongodb://proxy.example:5500/demo?authSource=admin&loadBalanced=true&retryWrites=false");
  assert.equal(connect("redis", { dbname: "" }).jdbc, "jdbc:redis://proxy.example:5500/0");
  assert.equal(connect("db2").driver, "IBM Db2 for 11.X, 12.X");
  assert.equal(connect("clickhouse"), null);
  assert.equal(
    connect("clickhouse", { connect_options: { clickhouse_http: true } }).jdbc,
    "jdbc:clickhouse://proxy.example:5500/demo"
  );
  assert.throws(() => connect("redis"), /Invalid Redis database index/);
  assert.throws(() => connect("postgresql", { host: "proxy.example/other" }), /Invalid database connection/);
  assert.throws(() => connect("postgresql", { port: 65536 }), /Invalid database connection/);
});
