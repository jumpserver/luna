import assert from "node:assert/strict";
import test from "node:test";
import buildLaunchPlan, { getNavicatURL } from "../../plugins/windows/windows.navicat17/scripts/launch.mjs";
import { LocalApplicationLauncher } from "../src/apps/local-app-launcher.ts";
import { fileURLToPath } from "node:url";

const context = {
  name: "asset@Test",
  host: "gateway.example.test",
  port: 3325,
  username: `token-user &+=?#% * \" ' \\ 中文`,
  value: `secret &+=?#% * \" ' $() ^(){}~ 中文`,
  dbname: "database & 中文",
  protocol: "mysql"
};

test("Navicat 18 receives -uri and one complete URI with literal credentials", () => {
  const plan = buildLaunchPlan(context);
  assert.equal(plan.type, "args");
  assert.equal(plan.args.length, 2);
  assert.equal(plan.args[0], "-uri");
  const url = new URL(plan.args[1]);
  assert.equal(url.protocol, "navicat:");
  assert.equal(url.hostname, "conn.mysql");
  assert.deepEqual(
    [...url.searchParams],
    [
      ["Conn.Host", context.host],
      ["Conn.Name", "Test"],
      ["Conn.Port", "3325"],
      ["Conn.Username", context.username],
      ["Conn.Password", context.value]
    ]
  );
  assert.equal(url.hash, "");
});

test("other database URI fields and legacy naming are retained", () => {
  for (const protocol of ["mysql", "mariadb", "oracle", "postgresql", "sqlserver"]) {
    const url = new URL(getNavicatURL({ ...context, protocol, source_name: "root@my+db%2B1" }));
    assert.equal(url.searchParams.get("Conn.Name"), "mydb+1");
    assert.equal(url.searchParams.get("Conn.Password"), context.value);
    const alias = { mariadb: "mysql", oracle: "ora", postgresql: "pgsql", sqlserver: "mssql" }[protocol] || protocol;
    assert.equal(url.hostname, `conn.${alias}`);
    if (protocol === "oracle") {
      assert.equal(url.searchParams.get("Conn.ServiceName"), context.dbname);
      assert.equal(url.searchParams.get("Conn.ConnectionMode"), "Basic");
    }
    if (["postgresql", "sqlserver"].includes(protocol))
      assert.equal(url.searchParams.get("Conn.InitialDatabase"), context.dbname);
    if (protocol === "sqlserver") assert.equal(url.searchParams.get("Conn.AuthenticationType"), "Default");
  }
  assert.equal(new URL(getNavicatURL({ ...context, name: "asset" })).searchParams.get("Conn.Name"), context.username);
  assert.throws(() => buildLaunchPlan({ ...context, command: "command" }), /cannot open command/);
  assert.throws(() => getNavicatURL({ ...context, protocol: "unknown" }), /protocol is invalid/);
});

const pluginDir = fileURLToPath(new URL("../../plugins/windows/windows.navicat17/", import.meta.url));
const application = {
  name: "navicat17",
  plugin_id: "windows.navicat17",
  protocol: ["mysql", "mariadb", "oracle", "postgresql", "sqlserver"],
  is_set: true,
  enabled_protocols: ["mysql", "mariadb", "oracle", "postgresql", "sqlserver"],
  match_first: ["mysql", "mariadb", "oracle", "postgresql", "sqlserver"],
  plugin_dir: pluginDir,
  module_path: "scripts/launch.mjs",
  launch_type: "module",
  path: process.execPath,
  executable_type: "user_path"
};
const payload = {
  client: "navicat17",
  protocol: "mysql",
  name: "asset@Test",
  endpoint: { host: context.host, port: context.port },
  token: { id: context.username, value: context.value },
  asset: { info: { db_name: context.dbname } }
};

function connectionURL(value) {
  return `jms2://${Buffer.from(JSON.stringify(value)).toString("base64")}`;
}

test("actual plugin module launches all database types with the configured executable and literal URI arguments", async () => {
  const launcher = new LocalApplicationLauncher(
    {},
    "",
    { getConfig: async () => ({ databases: [application] }) },
    {
      openExternal: async () => {
        throw new Error("must not open system handler");
      }
    }
  );
  let args;
  launcher.launchExecutable = async (selected, values) => {
    assert.equal(selected, application);
    assert.equal(selected.path, process.execPath);
    args = values;
  };
  for (const protocol of application.protocol) {
    await launcher.launch(connectionURL({ ...payload, protocol, name: "root@my+db%2B1" }));
    assert.equal(args.length, 2);
    assert.equal(args[0], "-uri");
    const url = new URL(args[1]);
    const alias = { mariadb: "mysql", oracle: "ora", postgresql: "pgsql", sqlserver: "mssql" }[protocol] || protocol;
    assert.equal(url.hostname, `conn.${alias}`);
    assert.equal(url.searchParams.get("Conn.Name"), "mydb+1");
    assert.equal(url.searchParams.get("Conn.Host"), context.host);
    assert.equal(url.searchParams.get("Conn.Port"), String(context.port));
    assert.equal(url.searchParams.get("Conn.Username"), context.username);
    assert.equal(url.searchParams.get("Conn.Password"), context.value);
    if (protocol === "oracle") {
      assert.equal(url.searchParams.get("Conn.ServiceName"), context.username);
      assert.equal(url.searchParams.get("Conn.ConnectionMode"), "Basic");
    }
    if (["postgresql", "sqlserver"].includes(protocol)) {
      assert.equal(url.searchParams.get("Conn.InitialDatabase"), context.dbname);
    }
    if (protocol === "sqlserver") assert.equal(url.searchParams.get("Conn.AuthenticationType"), "Default");
    assert.equal(url.hash, "");
  }
});

test("a missing configured executable fails instead of falling back to the URI handler", async () => {
  const missing = { ...application, path: "/missing-navicat-18/navicat.exe" };
  const launcher = new LocalApplicationLauncher(
    {},
    "",
    { getConfig: async () => ({ databases: [missing] }) },
    {
      openExternal: async () => {
        throw new Error("must not open system handler");
      }
    }
  );
  await assert.rejects(launcher.launch(connectionURL(payload)), /not found/);
});
