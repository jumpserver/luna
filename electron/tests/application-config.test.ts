import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { ApplicationConfigService } from "../src/apps/application-config.ts";
import { LocalApplicationLauncher, localAppLauncherInternals } from "../src/apps/local-app-launcher.ts";
import { systemFontInternals } from "../src/apps/system-fonts.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function shellArguments(command) {
  const result = spawnSync("/bin/sh", ["-c", `set -- ${command}; printf '%s\\0' "$@"`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\0").slice(0, -1);
}

test("Windows Navicat launch behavior comes entirely from its plugin configuration", async () => {
  const service = new ApplicationConfigService({ getPath: () => projectRoot }, projectRoot);
  const id = "windows.navicat17";
  for (const protocol of ["sqlserver", "mysql", "mariadb", "postgresql", "oracle"]) {
    const application = await service.buildItem(
      {
        id,
        category: "databases",
        builtin: true,
        pluginDir: path.join(projectRoot, "plugins/windows", id)
      },
      { selections: { [`databases:${protocol}`]: id } }
    );
    assert.equal(application.launch_type, "module");
    assert.equal(application.executable_type, "user_path");
    assert.equal(application.path_exists, false);
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    let launches = 0;
    launcher.launchModule = async (selected, payload, values) => {
      assert.equal(selected, application);
      assert.equal(payload.protocol, protocol === "mariadb" ? "mysql" : protocol);
      assert.equal(values.username, "selector-token");
      assert.equal(values.value, "test-secret");
      assert.equal(values.dbname, protocol === "oracle" ? "selector-token" : "application database");
      launches++;
    };
    const payload = {
      protocol,
      client: "navicat17",
      name: "SQL Server test",
      endpoint: { host: "gateway.example.test", port: 5525 },
      token: { id: "selector-token", value: "test-secret" },
      asset: { info: { db_name: "application database" } }
    };
    await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    assert.equal(launches, 1);
    assert.equal(payload.protocol, protocol);
  }
});

test("SQL Server applications other than the bundled Navicat plugin retain their argument launch", async () => {
  for (const [name, pluginId] of [
    ["dbeaver", "windows.dbeaver"],
    ["ssms17", "windows.ssms17"],
    ["navicat17", "custom.navicat17"]
  ]) {
    const application = {
      name,
      plugin_id: pluginId,
      protocol: ["sqlserver"],
      enabled_protocols: ["sqlserver"],
      match_first: ["sqlserver"],
      is_set: true,
      launch_type: "args",
      arg_format: "{username}|{value}|{dbname}"
    };
    const launcher = new LocalApplicationLauncher(
      {},
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    let args;
    launcher.launchExecutable = async (_selected, value) => {
      args = value;
    };
    await launcher.launch(
      `jms2://${Buffer.from(
        JSON.stringify({
          protocol: "sqlserver",
          name: "Test",
          endpoint: { host: "gateway.example.test", port: 5525 },
          token: { id: "selector", value: "test-secret" },
          asset: { info: { db_name: "application" } }
        })
      ).toString("base64")}`
    );
    assert.equal(args, "selector|test-secret|application");
  }
});

test("RESP receives a private connection config through its settings directory", async (context) => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "jms RESP config "));
  context.after(() => rm(appData, { recursive: true, force: true }));
  const app = { getPath: () => appData, isPackaged: false };
  const service = new ApplicationConfigService(app, projectRoot);
  service.builtInDir = async () => path.join(projectRoot, "plugins", "windows");
  await service.initialize();
  await service.updateSelection({
    category: "databases",
    protocol: "redis",
    name: "resp",
    pluginId: undefined,
    path: process.execPath
  });
  await service.updateSelection({
    category: "databases",
    protocol: "redis",
    name: "resp",
    pluginId: undefined,
    path: undefined,
    makeDefault: true
  });
  const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
  const payload = {
    protocol: "redis",
    client: "resp",
    name: "RESP 测试连接",
    endpoint: { host: "127.0.0.1", port: 16380 },
    token: { id: "test-token", value: "secret with spaces * ' \" \\ 中文" },
    asset: { info: { db_name: "0" } }
  };
  const settingsDirectories = [];
  launcher.launchExecutable = async (application, argumentString) => {
    assert.equal(application.name, "resp");
    const args = Array.isArray(argumentString)
      ? argumentString
      : localAppLauncherInternals.splitArguments(argumentString);
    assert.equal(args.length, 2);
    assert.equal(args[0], "--settings-dir");
    assert.ok(!args[1].includes("{config_file}"));
    settingsDirectories.push(args[1]);
    const configFile = path.join(args[1], ".rdm", "connections.json");
    const connections = JSON.parse(await readFile(configFile, "utf8"));
    assert.equal(connections.length, 1);
    assert.equal(connections[0].name, "RESP测试连接");
    assert.equal(connections[0].host, payload.endpoint.host);
    assert.equal(connections[0].port, payload.endpoint.port);
    assert.equal(connections[0].username, undefined);
    assert.equal(connections[0].auth, `${payload.token.id}@${payload.token.value}`);
    assert.ok(connections[0].timeout_connect > 1000);
    assert.ok(connections[0].timeout_execute > 1000);
    if (process.platform !== "win32") assert.equal((await stat(configFile)).mode & 0o777, 0o600);
  };
  const raw = `jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  await launcher.launch(raw);
  await launcher.launch(raw);
  assert.equal(new Set(settingsDirectories).size, 2, "concurrent launches must not overwrite each other's config");
});

test(
  "installed DBX initiates a database connection through the plugin launcher",
  {
    skip: !process.env.JMS_TEST_DBX_EXECUTABLE
  },
  async (context) => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "jms-dbx-native-"));
    context.after(() => rm(appData, { recursive: true, force: true }));
    const server = createServer((socket) => socket.destroy());
    context.after(() => server.close());
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const app = { getPath: () => appData, isPackaged: false };
    const service = new ApplicationConfigService(app, projectRoot);
    await service.initialize();
    await service.updateSelection({
      category: "databases",
      protocol: "mysql",
      name: "dbx",
      pluginId: undefined,
      path: process.env.JMS_TEST_DBX_EXECUTABLE
    });
    const received = once(server, "connection", { signal: AbortSignal.timeout(8000) });
    const payload = {
      protocol: "mysql",
      client: "dbx",
      name: `Luna DBX connection probe ${Date.now()}`,
      endpoint: { host: "127.0.0.1", port: (server.address() as { port: number }).port },
      token: { id: "luna-probe", value: "test-only" },
      asset: { info: { db_name: "probe" } }
    };
    const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
    await Promise.all([received, launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`)]);
  }
);

for (const platform of ["macos", "linux", "windows"]) {
  test(`${platform} defaults to DBX and launches encoded, one-time database connections`, async (context) => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "jms-dbx-"));
    context.after(() => rm(appData, { recursive: true, force: true }));
    const app = { getPath: () => appData, isPackaged: false };
    const service = new ApplicationConfigService(app, projectRoot);
    service.builtInDir = async () => path.join(projectRoot, "plugins", platform);
    await service.initialize();
    const config = await service.getConfig();
    const dbx = config.databases.find((item) => item.name === "dbx");
    assert.ok(dbx);
    assert.ok(config.databases.some((item) => item.name === "dbeaver"));
    assert.equal(dbx.launch_type, "module");
    assert.equal(dbx.executable_type, "user_path");
    const types = {
      mysql: "mysql",
      mariadb: "mysql",
      postgresql: "postgres",
      oracle: "oracle",
      sqlserver: "mssql",
      dameng: "dm",
      clickhouse: "clickhouse",
      mongodb: "mongodb",
      redis: "redis"
    };
    assert.deepEqual(new Set(dbx.protocol), new Set(Object.keys(types)));
    assert.deepEqual(dbx.match_first, dbx.protocol);
    const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
    launcher.resolveExecutable = async (application) => application.path;
    for (const [protocol, type] of Object.entries(types)) {
      const payload = {
        protocol,
        name: "测试 DBX &连接",
        endpoint: { host: "2001:db8::1", port: 5525 },
        token: { id: "token&+/*'\"\\中文", value: " secret &one_time=false+?#%/*'\"\\中文 ", protocol },
        asset: { info: { db_name: protocol === "redis" ? "0" : "库 名&+/*'\"\\" } }
      };
      let launches = 0;
      launcher.launchExecutable = async (application, argumentString) => {
        assert.equal(application.name, "dbx");
        const args = Array.isArray(argumentString)
          ? argumentString
          : localAppLauncherInternals.splitArguments(argumentString);
        assert.equal(args.length, 1);
        const url = new URL(args[0]);
        assert.equal(url.protocol, "dbx:");
        assert.equal(url.hostname, "connection");
        assert.equal(url.pathname, "/new");
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          name: "测试DBX&连接",
          type,
          host: payload.endpoint.host,
          port: "5525",
          user: payload.token.id,
          password: payload.token.value,
          database: protocol === "oracle" ? payload.token.id : payload.asset.info.db_name,
          one_time: "true",
          ...(protocol === "mongodb" ? { url_params: "authSource=admin&loadBalanced=true&retryWrites=false" } : {})
        });
        launches++;
      };
      for (const client of [undefined, "dbx"]) {
        await launcher.launch(`jms2://${Buffer.from(JSON.stringify({ ...payload, client })).toString("base64")}`);
      }
      if (protocol === "mariadb") {
        await launcher.launch(
          `jms2://${Buffer.from(JSON.stringify({ ...payload, protocol: "mysql" })).toString("base64")}`
        );
      }
      assert.equal(launches, protocol === "mariadb" ? 3 : 2);
    }

    // Upgrades retain saved DBeaver paths, other defaults, and explicitly disabled protocols.
    const preferences = {
      version: 1,
      selections: {
        "databases:mysql": `${platform}.dbeaver`,
        "databases:postgresql": `${platform}.${platform === "windows" ? "navicat17" : "terminal-db"}`,
        "databases:redis": ""
      },
      enabled_selections: { "databases:mysql": [`${platform}.dbeaver`] },
      plugins: { [`${platform}.dbeaver`]: { path: process.execPath, enabled: true } }
    };
    await service.saveState(preferences);
    const state = await service.loadState();
    for (const [key, value] of Object.entries(preferences.selections)) assert.equal(state.selections[key], value);
    assert.deepEqual(state.plugins, preferences.plugins);
    assert.deepEqual(state.enabled_selections, preferences.enabled_selections);
    assert.equal((await launcher.resolveApplication({ protocol: "mysql" })).name, "dbeaver");
    await assert.rejects(launcher.resolveApplication({ protocol: "redis" }), /no configured application/);
  });
}

for (const platform of ["macos", "linux", "windows"]) {
  test(`${platform} offers DBeaver for Dameng and launches its native driver`, async (context) => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "jms-dameng-dbeaver-"));
    context.after(() => rm(appData, { recursive: true, force: true }));
    const app = { getPath: () => appData, isPackaged: false };
    const service = new ApplicationConfigService(app, projectRoot);
    service.builtInDir = async () => path.join(projectRoot, "plugins", platform);
    await service.initialize();
    await service.updateSelection({
      category: "databases",
      protocol: "dameng",
      name: "dbeaver",
      pluginId: undefined,
      path: process.execPath
    });
    await service.updateSelection({
      category: "databases",
      protocol: "dameng",
      name: "dbeaver",
      pluginId: undefined,
      path: undefined,
      makeDefault: true
    });
    const application = (await service.getConfig()).databases.find((item) => item.name === "dbeaver");
    assert.ok(application?.protocol.includes("dameng"));
    assert.ok(application.match_first.includes("dameng"));

    const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
    let launched = false;
    launcher.launchExecutable = async (selected, argumentString) => {
      assert.equal(selected.name, "dbeaver");
      assert.deepEqual(
        Array.isArray(argumentString) ? argumentString : localAppLauncherInternals.splitArguments(argumentString),
        [
          "-con",
          "name=Dameng|driver=dameng|user=token-id|password=secret|host=gateway.example.com|port=5525|save=false|connect=true"
        ]
      );
      launched = true;
    };
    const payload = {
      protocol: "dameng",
      name: "Dameng",
      endpoint: { host: "gateway.example.com", port: 5525 },
      token: { id: "token-id", value: "secret" },
      asset: { info: { db_name: "business" } }
    };
    await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    assert.equal(launched, true);
  });
}

for (const platform of ["macos", "linux"]) {
  test(`${platform} offers a shell-safe Dameng disql launch`, async (context) => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "jms-dameng-disql-"));
    context.after(() => rm(appData, { recursive: true, force: true }));
    const app = { getPath: () => appData, isPackaged: false };
    const service = new ApplicationConfigService(app, projectRoot);
    service.builtInDir = async () => path.join(projectRoot, "plugins", platform);
    await service.initialize();
    await service.updateSelection({
      category: "databases",
      protocol: "dameng",
      name: "terminal",
      pluginId: undefined,
      path: undefined,
      makeDefault: true
    });
    const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
    let launched = false;
    launcher.launchInTerminal = async (command) => {
      assert.deepEqual(shellArguments(command), ["disql", "token-id/p'a&b@gateway.example.com:5525"]);
      launched = true;
    };
    const payload = {
      protocol: "dameng",
      name: "Dameng",
      endpoint: { host: "gateway.example.com", port: 5525 },
      token: { id: "token-id", value: "p'a&b" }
    };
    await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    assert.equal(launched, true);
  });
}

for (const [platform, protocol, expectedClient] of [
  ["macos", "ssh", "terminal"],
  ["linux", "ssh", "terminal"],
  ["windows", "ssh", "putty"],
  ["windows", "rdp", "mstsc"]
]) {
  test(`${platform} launches ${protocol} with local defaults before login`, async (context) => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "jms-electron-defaults-"));
    context.after(() => rm(appData, { recursive: true, force: true }));
    const app = { getPath: () => appData, isPackaged: false };
    const service = new ApplicationConfigService(app, projectRoot);
    service.builtInDir = async () => path.join(projectRoot, "plugins", platform);
    await service.initialize();
    const launcher = new LocalApplicationLauncher(app, projectRoot, service, null);
    const payload = {
      protocol,
      name: "test asset",
      endpoint: { host: "127.0.0.1", port: 2222 },
      token: { id: "connection-token", value: "secret" },
      file: { name: "test asset", content: "full address:s:127.0.0.1:3389\n" }
    };
    let launched = 0;
    const launch = async (application) => {
      assert.equal(application.name, expectedClient);
      launched++;
    };
    launcher.launchScript = launch;
    launcher.launchExecutable = launch;
    launcher.launchFile = launch;
    const url = `jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
    await launcher.launch(url);
    // An older/partial preferences file must not prevent default applications from opening.
    await service.saveState({ version: 1, selections: {}, plugins: {} });
    await launcher.launch(url);
    assert.equal(launched, 2);

    const application = await launcher.resolveApplication(payload);
    await service.saveState({
      version: 1,
      selections: { [`${application.type}:${protocol}`]: "" },
      plugins: {}
    });
    await assert.rejects(launcher.launch(url), /no configured application selected/);
    await service.saveState({ version: 1, selections: {}, plugins: { [application.plugin_id]: { enabled: false } } });
    await assert.rejects(launcher.launch(url), /no configured application selected/);
  });
}

test("builds the Electron application config from platform plugins", async (context) => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "jms-electron-config-"));
  context.after(() => rm(appData, { recursive: true, force: true }));
  const service = new ApplicationConfigService({ getPath: () => appData }, projectRoot);
  await service.initialize();

  const config = await service.getConfig();
  assert.deepEqual(Object.keys(config), ["terminal", "remotedesktop", "filetransfer", "databases"]);
  assert.ok(config.terminal.length > 0);
  assert.ok(config.terminal.some((item) => item.match_first.includes("ssh")));

  const archivePath = path.join(appData, "test-plugin.zip");
  await writeFile(
    archivePath,
    zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          id: "test.shell",
          name: "test_shell",
          display_name: "Test Plugin Shell",
          version: "1.0.0",
          category: "terminal",
          protocols: ["ssh"]
        })
      ),
      "connect.json": strToU8(
        JSON.stringify({
          executable: { type: "user_path", default: "/bin/sh" },
          launch: { type: "args", template: "{host}" }
        })
      )
    })
  );
  await service.installPlugin({ path: archivePath });
  assert.ok((await service.listPlugins()).some((plugin) => plugin.id === "test.shell"));
  await assert.rejects(
    service.updateCustomTerminal({ pluginId: "test.shell", name: "Other", path: process.execPath, template: "{host}" }),
    /not a custom terminal/
  );
  await service.uninstallPlugin({ pluginId: "test.shell" });

  await service.createCustomTerminal({ name: "Test Shell", path: "/bin/sh", template: "{helper} {host}" });
  assert.ok((await service.listPlugins()).some((plugin) => plugin.id === "custom.terminal.test-shell"));
  await service.uninstallPlugin({ pluginId: "custom.terminal.test-shell" });
  assert.ok(!(await service.listPlugins()).some((plugin) => plugin.id === "custom.terminal.test-shell"));
});

test("edits custom terminals without changing their identity or selections and removes their saved state", async (context) => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "jms-electron-custom-terminal-"));
  context.after(() => rm(appData, { recursive: true, force: true }));
  const app = { getPath: () => appData };
  const service = new ApplicationConfigService(app, projectRoot);
  await service.initialize();
  await service.createCustomTerminal({ name: "Test Shell", path: process.execPath, template: "{helper} {host}" });
  const pluginId = "custom.terminal.test-shell";
  await service.updateSelection({
    category: "terminal",
    protocol: "ssh",
    name: "test_shell",
    pluginId,
    path: process.execPath
  });
  for (const protocol of ["ssh", "telnet"]) {
    await service.updateSelection({
      category: "terminal",
      protocol,
      name: "test_shell",
      pluginId,
      path: undefined,
      makeDefault: true
    });
  }
  const before = await service.loadState();
  const updatedPath = path.join(appData, "updated-shell");
  await writeFile(updatedPath, "");
  const updated = {
    pluginId,
    name: " Renamed Shell ",
    path: ` ${updatedPath} `,
    template: " -e {helper} {protocol} {host} "
  };
  await service.updateCustomTerminal(updated);

  // Reopening settings must read the edited fields from disk, including an existing path override.
  const reopened = new ApplicationConfigService(app, projectRoot);
  await reopened.initialize();
  const config = await reopened.getConfig();
  const terminal = config.terminal.find((item) => item.plugin_id === pluginId);
  assert.ok(terminal);
  assert.equal(config.terminal.filter((item) => item.plugin_id === pluginId).length, 1);
  assert.equal(terminal.name, "test_shell");
  assert.equal(terminal.display_name, "Renamed Shell");
  assert.equal(terminal.path, updatedPath);
  assert.equal(terminal.path_exists, true);
  assert.equal(terminal.arg_format, updated.template.trim());
  assert.deepEqual(terminal.match_first, ["ssh", "telnet"]);
  assert.deepEqual(terminal.enabled_protocols, ["ssh", "telnet"]);
  const launcher = new LocalApplicationLauncher(app, projectRoot, reopened, null);
  assert.equal((await launcher.resolveApplication({ protocol: "ssh" })).plugin_id, pluginId);
  const plugin = (await reopened.listPlugins()).find((item) => item.id === pluginId);
  assert.equal(plugin.display_name, terminal.display_name);
  assert.equal(plugin.path, terminal.path);
  const after = await reopened.loadState();
  assert.deepEqual(after.selections, before.selections);
  assert.deepEqual(after.enabled_selections, before.enabled_selections);

  for (const protocol of ["ssh", "telnet"]) {
    await reopened.updateSelection({
      category: "terminal",
      protocol,
      name: "test_shell",
      pluginId,
      path: undefined,
      enabled: false
    });
  }
  await reopened.updateCustomTerminal({ ...updated, name: "Disabled Shell" });
  assert.deepEqual(
    (await reopened.getConfig()).terminal.find((item) => item.plugin_id === pluginId).enabled_protocols,
    []
  );

  await reopened.updateSelection({
    category: "terminal",
    protocol: "ssh",
    name: "test_shell",
    pluginId,
    path: undefined
  });
  await reopened.uninstallPlugin({ pluginId });
  assert.ok(!(await reopened.getConfig()).terminal.some((item) => item.plugin_id === pluginId));
  assert.ok(!(await reopened.listPlugins()).some((item) => item.id === pluginId));
  const removed = await reopened.loadState();
  assert.equal(removed.plugins[pluginId], undefined);
  assert.ok(!Object.values(removed.selections).includes(pluginId));
  assert.ok(Object.values(removed.enabled_selections).every((ids: string[]) => !ids.includes(pluginId)));
});

test("rejects invalid custom terminal edits and preserves saved configuration on failure", async (context) => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "jms-electron-custom-terminal-"));
  context.after(() => rm(appData, { recursive: true, force: true }));
  const service = new ApplicationConfigService({ getPath: () => appData }, projectRoot);
  await service.initialize();
  const fields = { name: "Test Shell", path: process.execPath, template: "{helper} {host}" };
  await service.createCustomTerminal(fields);
  const pluginId = "custom.terminal.test-shell";
  const before = await service.getConfig();
  for (const field of ["name", "path", "template"]) {
    await assert.rejects(service.updateCustomTerminal({ ...fields, pluginId, [field]: " " }), /is required/);
  }
  for (const invalidId of ["", "..", "../custom.terminal.test-shell", "custom.terminal.missing"]) {
    await assert.rejects(
      service.updateCustomTerminal({ ...fields, pluginId: invalidId }),
      /invalid plugin id|not found/
    );
  }
  const builtin = before.terminal.find((item) => item.builtin);
  await assert.rejects(
    service.updateCustomTerminal({ ...fields, pluginId: builtin.plugin_id }),
    /not a custom terminal/
  );
  await assert.rejects(service.uninstallPlugin({ pluginId: builtin.plugin_id }), /cannot be uninstalled/);
  service.saveState = async () => {
    throw new Error("write failed");
  };
  await assert.rejects(service.updateCustomTerminal({ ...fields, pluginId, name: "Unsaved" }), /write failed/);
  assert.deepEqual(await service.getConfig(), before);
});

test("decodes local client URLs and preserves quoted application arguments", () => {
  const payload = {
    protocol: "ssh",
    name: "root server",
    endpoint: { host: "127.0.0.1", port: 2222 },
    token: { id: "token-id", value: "secret" }
  };
  const decoded = localAppLauncherInternals.decodePayload(
    `jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`
  );
  assert.deepEqual(decoded, payload);
  assert.deepEqual(localAppLauncherInternals.splitArguments("-con 'name=one two' escaped\\ value"), [
    "-con",
    "name=one two",
    "escaped value"
  ]);
});

test("launches RDP connection files without endpoint fields", async () => {
  const payload = {
    protocol: "rdp",
    client: "mstsc",
    name: "admin@windows",
    token: { id: "token-id", value: "secret" },
    file: { name: "admin-windows", content: "full address:s:127.0.0.1:3389\n" }
  };
  const application = {
    name: "mstsc",
    display_name: "Microsoft Remote Desktop",
    protocol: ["rdp"],
    is_set: true,
    match_first: [],
    enabled_protocols: ["rdp"],
    launch_type: "file"
  };
  const launcher = new LocalApplicationLauncher(
    { isPackaged: false },
    projectRoot,
    {
      getConfig: async () => ({ terminal: [], filetransfer: [], remotedesktop: [application], databases: [] })
    },
    null
  );
  let launchedPayload;
  launcher.launchFile = async (_application, receivedPayload) => {
    launchedPayload = receivedPayload;
  };

  await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);

  assert.deepEqual(launchedPayload, payload);
});

for (const platform of ["macos", "linux"]) {
  test(`${platform}/terminal-db quotes and encodes MongoDB connection values`, async (context) => {
    if (process.platform === "win32") return context.skip("POSIX shell test");
    const config = JSON.parse(
      await readFile(path.join(projectRoot, "plugins", platform, `${platform}.terminal-db`, "connect.json"), "utf8")
    );
    const application = {
      name: "terminal-db",
      protocol: ["mongodb"],
      is_set: true,
      match_first: ["mongodb"],
      launch_type: config.launch.type,
      module_path: config.launch.module,
      plugin_dir: path.join(projectRoot, "plugins", platform, `${platform}.terminal-db`),
      path: process.execPath,
      executable_type: "system",
      uses_terminal_host: config.launch.target === "terminal",
      accepts_command: Boolean(config.launch.accepts_command),
      launch_driver: config.launch.driver,
      arg_format: config.launch.template,
      protocol_templates: config.launch.protocol_templates
    };
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    const user = "token:id@/";
    const password = ["space value", "$HOME", "`printf injected`", "'", '"', ";", "&", "/", "\\", "?", "#"].join("");
    const database = "data /?#";
    const expectedUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@gateway.example.com:5525/${encodeURIComponent(database)}?authSource=admin&loadBalanced=true&retryWrites=false`;
    let launched = false;
    launcher.launchInTerminal = async (command) => {
      const result = spawnSync("bash", ["-lc", `mongosh() { printf '%s\\n' "$@"; }\n${command}`], {
        encoding: "utf8"
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `${expectedUri}\n`);
      const parsed = new URL(expectedUri);
      assert.equal(decodeURIComponent(parsed.username), user);
      assert.equal(decodeURIComponent(parsed.password), password);
      assert.equal(decodeURIComponent(parsed.pathname.slice(1)), database);
      assert.equal(parsed.searchParams.get("authSource"), "admin");
      launched = true;
    };
    const payload = {
      protocol: "mongodb",
      name: "MongoDB",
      endpoint: { host: "gateway.example.com", port: 5525 },
      token: { id: user, value: password },
      asset: { info: { db_name: database } }
    };
    await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    assert.equal(launched, true);
  });
}

for (const platform of ["macos", "linux"]) {
  test(`${platform} SQLPlus plugin applies SYSDBA and preserves direct commands`, async () => {
    const service = new ApplicationConfigService({ getPath: () => projectRoot }, projectRoot);
    const id = `${platform}.terminal-db`;
    const application = await service.buildItem(
      {
        id,
        category: "databases",
        builtin: true,
        pluginDir: path.join(projectRoot, "plugins", platform, id)
      },
      { selections: { "databases:oracle": id } }
    );
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    const payload = {
      protocol: "oracle",
      endpoint: { host: "gateway.example.com", port: 5525 },
      token: { id: "token-id", value: "secret" },
      asset: { info: { db_name: "ORCLCDB" } }
    };
    for (const role of [false, true]) {
      let called = false;
      launcher.launchInTerminal = async (command) => {
        assert.deepEqual(shellArguments(command), [
          "sqlplus",
          "token-id/secret@gateway.example.com:5525/token-id",
          ...(role ? ["as", "sysdba"] : [])
        ]);
        called = true;
      };
      await launcher.launch(
        `jms2://${Buffer.from(JSON.stringify({ ...payload, connect_options: { use_sysdba: role } })).toString("base64")}`
      );
      assert.ok(called);
    }
    const direct = "sqlplus example as sysdba";
    launcher.launchInTerminal = async (command) => assert.equal(command, direct);
    await launcher.launch(
      `jms2://${Buffer.from(JSON.stringify({ ...payload, command: direct, connect_options: { use_sysdba: true } })).toString("base64")}`
    );
  });
}

for (const [platform, plugin, expected] of [
  ["macos", "dbeaver", "driver=mysql"],
  ["linux", "dbeaver", "driver=mysql"],
  ["windows", "dbeaver", "driver=mysql"],
  ["windows", "navicat17", "navicat://conn.mysql?"],
  ["macos", "terminal-db", "mysql -u token-id"],
  ["linux", "terminal-db", "mysql -u token-id"],
  ["demo", "tablepro-uploadable", "mysql"]
]) {
  test(`${platform}/${plugin} uses MySQL for MariaDB without changing application selection`, async () => {
    const directory = platform === "demo" ? plugin : `${platform}.${plugin}`;
    const config = JSON.parse(
      await readFile(path.join(projectRoot, "plugins", platform, directory, "connect.json"), "utf8")
    );
    const application = {
      name: plugin,
      protocol: ["mariadb", "mysql"],
      is_set: true,
      // Only the MariaDB preference is enabled; normalization must happen after selection.
      enabled_protocols: ["mariadb"],
      match_first: ["mariadb"],
      launch_type: config.launch.type,
      module_path: config.launch.module,
      plugin_dir: path.join(projectRoot, "plugins", platform, platform === "demo" ? plugin : `${platform}.${plugin}`),
      path: process.execPath,
      executable_type: "system",
      uses_terminal_host: config.launch.target === "terminal",
      accepts_command: Boolean(config.launch.accepts_command),
      launch_driver: config.launch.driver,
      arg_format: config.launch.template,
      protocol_templates: config.launch.protocol_templates
    };
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    const payload = {
      protocol: "mariadb",
      name: "测试数据库",
      endpoint: { host: "gateway.example.com", port: 5525 },
      token: { id: "token-id", value: "secret", protocol: "mariadb" },
      asset: { info: { db_name: "app" } }
    };
    let launches = 0;
    const checkArgs = async (selected, args) => {
      assert.equal(selected, application);
      args = Array.isArray(args) ? args.join(" ") : args;
      assert.ok(args.includes(expected), args);
      assert.ok(args.includes("gateway.example.com"), args);
      assert.ok(args.includes("5525"), args);
      assert.ok(!args.includes("mariadb"), args);
      launches++;
    };
    launcher.launchExecutable = checkArgs;
    launcher.launchInTerminal = async (command) => checkArgs(application, shellArguments(command));
    launcher.launchScript = async (selected, received, values) => {
      assert.equal(selected, application);
      assert.deepEqual(received, { ...payload, protocol: "mysql", ...(received.client ? { client: plugin } : {}) });
      assert.equal(values.protocol, "mysql");
      assert.equal(values.dbname, "app");
      launches++;
    };
    for (const client of [undefined, plugin]) {
      const url = `jms2://${Buffer.from(JSON.stringify({ ...payload, client })).toString("base64")}`;
      await launcher.launch(url);
    }
    assert.equal(launches, 2);
    assert.equal(payload.protocol, "mariadb");
    assert.deepEqual(application.enabled_protocols, ["mariadb"]);
  });
}

for (const [platform, plugin] of [
  ["macos", "mongo-compass"],
  ["windows", "mongo-compass"]
]) {
  test(`${platform}/${plugin} supplies the complete Magnus MongoDB URI as one argument`, async () => {
    const config = JSON.parse(
      await readFile(path.join(projectRoot, "plugins", platform, `${platform}.${plugin}`, "connect.json"), "utf8")
    );
    const application = {
      name: plugin,
      protocol: ["mongodb"],
      is_set: true,
      match_first: ["mongodb"],
      launch_type: config.launch.type,
      module_path: config.launch.module,
      plugin_dir: path.join(projectRoot, "plugins", platform, platform === "demo" ? plugin : `${platform}.${plugin}`),
      path: process.execPath,
      executable_type: "system",
      uses_terminal_host: config.launch.target === "terminal",
      accepts_command: Boolean(config.launch.accepts_command),
      launch_driver: config.launch.driver,
      arg_format: config.launch.template,
      protocol_templates: config.launch.protocol_templates
    };
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    for (const database of ["business", "admin", ""]) {
      let launched = false;
      const capture = async (selected, argumentString) => {
        assert.equal(selected, application);
        const uri = `mongodb://token-id:secret@gateway.example.com:5525/${database}?authSource=admin&loadBalanced=true&retryWrites=false`;
        assert.deepEqual(
          Array.isArray(argumentString) ? argumentString : localAppLauncherInternals.splitArguments(argumentString),
          [uri]
        );
        launched = true;
      };
      launcher.launchExecutable = capture;
      const payload = {
        protocol: "mongodb",
        name: "MongoDB",
        endpoint: { host: "gateway.example.com", port: 5525 },
        token: { id: "token-id", value: "secret" },
        asset: { info: { db_name: database } }
      };
      await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
      assert.equal(launched, true);
    }
  });
}

test("selects the MariaDB application when Magnus exposes its shared MySQL protocol", async () => {
  const dbeaver = {
    name: "dbeaver",
    protocol: ["mariadb", "mysql"],
    is_set: true,
    enabled_protocols: ["mysql"],
    match_first: ["mysql"],
    launch_type: "args",
    arg_format: "{protocol}"
  };
  const terminal = {
    name: "terminal",
    protocol: ["mariadb", "mysql"],
    is_set: true,
    enabled_protocols: ["mariadb"],
    match_first: ["mariadb"],
    launch_type: "args",
    arg_format: "{protocol}"
  };
  const launcher = new LocalApplicationLauncher(
    { isPackaged: false },
    projectRoot,
    { getConfig: async () => ({ databases: [dbeaver, terminal] }) },
    null
  );
  let selected;
  launcher.launchExecutable = async (application, args) => {
    selected = application;
    assert.equal(args, "mysql");
  };
  const payload = {
    protocol: "mysql",
    name: "MariaDB",
    endpoint: { host: "gateway.example.com", port: 5525 },
    token: { id: "token-id", value: "secret", protocol: "mariadb" }
  };

  await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);

  assert.equal(selected, terminal);
});

test("normalizes duplicate and hidden system font families", () => {
  assert.deepEqual(systemFontInternals.normalizeFamilies(["Menlo", " .Hidden ", "Menlo", "SF Mono", ""]), [
    "Menlo",
    "SF Mono"
  ]);
});

test("enables multiple clients independently and persists a separate protocol default", async (context) => {
  const appData = await mkdtemp(path.join(os.tmpdir(), "jms-multiple-clients-"));
  context.after(() => rm(appData, { recursive: true, force: true }));
  const app = { getPath: () => appData };
  const service = new ApplicationConfigService(app, projectRoot);
  await service.initialize();
  await service.saveState({ version: 1, selections: { "terminal:ssh": "" }, plugins: {} });
  for (const name of ["First", "Second"]) {
    await service.createCustomTerminal({ name, path: process.execPath, template: "{host}" });
  }
  const update = (name, enabled = true, makeDefault = false) =>
    service.updateSelection({
      category: "terminal",
      protocol: "ssh",
      name: name.toLowerCase(),
      pluginId: `custom.terminal.${name.toLowerCase()}`,
      path: undefined,
      enabled,
      makeDefault
    });
  await update("First");
  await update("Second");
  await update("Second");
  const reopened = new ApplicationConfigService(app, projectRoot);
  await reopened.initialize();
  const launcher = new LocalApplicationLauncher(app, projectRoot, reopened, null);
  assert.equal((await launcher.resolveApplication({ protocol: "ssh" })).name, "first");
  assert.equal((await launcher.resolveApplication({ protocol: "ssh", client: "second" })).name, "second");
  assert.deepEqual((await reopened.loadState()).enabled_selections["terminal:ssh"], [
    "custom.terminal.first",
    "custom.terminal.second"
  ]);
  await update("Second", true, true);
  assert.equal((await launcher.resolveApplication({ protocol: "ssh" })).name, "second");
  assert.equal((await launcher.resolveApplication({ protocol: "ssh", client: "first" })).name, "first");
  await update("Second", false);
  assert.equal((await launcher.resolveApplication({ protocol: "ssh" })).name, "first");
  await assert.rejects(launcher.resolveApplication({ protocol: "ssh", client: "second" }), /no configured application/);
  await update("Second");
  await service.uninstallPlugin({ pluginId: "custom.terminal.first" });
  assert.equal((await launcher.resolveApplication({ protocol: "ssh" })).name, "second");
  await update("Second", false);
  await assert.rejects(launcher.resolveApplication({ protocol: "ssh" }), /no configured application/);
});

test("database command plans use the selected iTerm2 host and reject hosts without command support", async () => {
  const service = new ApplicationConfigService({ getPath: () => projectRoot }, projectRoot);
  const state = { selections: { "terminal:ssh": "macos.iterm", "databases:mysql": "macos.terminal-db" } };
  const entry = (id, category) => ({
    id,
    category,
    builtin: true,
    pluginDir: path.join(projectRoot, "plugins/macos", id)
  });
  const host = await service.buildItem(entry("macos.iterm", "terminal"), state);
  const database = await service.buildItem(entry("macos.terminal-db", "databases"), state);
  const launcher = new LocalApplicationLauncher(
    { isPackaged: false },
    projectRoot,
    { getConfig: async () => ({ terminal: [host], databases: [database] }) },
    null
  );
  let calls = 0;
  const password = "space ' \" $() 中文";
  launcher.launchScript = async (selected, payload) => {
    assert.equal(selected.plugin_id, "macos.iterm");
    assert.deepEqual(shellArguments(payload.command), [
      "mysql",
      "-u",
      "token",
      `-p${password}`,
      "-h",
      "gateway.example",
      "-P",
      "3306",
      "business"
    ]);
    calls++;
  };
  const payload = {
    protocol: "mysql",
    endpoint: { host: "gateway.example", port: 3306 },
    token: { id: "token", value: password },
    asset: { info: { db_name: "business" } }
  };
  const raw = `jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  await launcher.launch(raw);
  assert.equal(calls, 1);
  host.accepts_command = false;
  await assert.rejects(launcher.launch(raw), /selected terminal host cannot open command/);
  assert.equal(calls, 1);
});

for (const platform of ["macos", "linux", "windows"]) {
  test(`${platform} DBeaver module owns driver mapping and Oracle SYSDBA arguments`, async () => {
    const service = new ApplicationConfigService({ getPath: () => projectRoot }, projectRoot);
    const id = `${platform}.dbeaver`;
    const application = await service.buildItem(
      {
        id,
        category: "databases",
        builtin: true,
        pluginDir: path.join(projectRoot, "plugins", platform, id)
      },
      {
        selections: { "databases:oracle": id, "databases:sqlserver": id },
        plugins: { [id]: { path: process.execPath } }
      }
    );
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ databases: [application] }) },
      null
    );
    for (const [protocol, role] of [
      ["oracle", false],
      ["oracle", true],
      ["sqlserver", false]
    ]) {
      let called = false;
      launcher.launchExecutable = async (_selected, args) => {
        assert.equal(args[0], "-con");
        assert.equal(args.length, 2);
        assert.ok(args[1].includes("password=space ' \" 中文"));
        assert.equal(args[1].includes("authProp.oracle.logon-as=SYSDBA"), role);
        if (protocol === "sqlserver") assert.ok(args[1].includes("driver=mssql_jdbc_ms_new"));
        called = true;
      };
      const payload = {
        protocol,
        connect_options: { use_sysdba: role },
        endpoint: { host: "gateway.example", port: 5525 },
        token: { id: "token", value: "space ' \" 中文" }
      };
      await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
      assert.ok(called);
    }
  });
}

for (const platform of ["linux", "windows"]) {
  test(`${platform} terminal module owns helper arguments and direct commands`, async () => {
    const service = new ApplicationConfigService({ getPath: () => projectRoot }, projectRoot);
    const id = `${platform}.terminal`;
    const application = await service.buildItem(
      {
        id,
        category: "terminal",
        builtin: true,
        pluginDir: path.join(projectRoot, "plugins", platform, id)
      },
      { selections: { "terminal:telnet": id } }
    );
    const launcher = new LocalApplicationLauncher(
      { isPackaged: false },
      projectRoot,
      { getConfig: async () => ({ terminal: [application] }) },
      null
    );
    for (const command of ["", "echo direct-command"]) {
      let called = false;
      launcher.launchExecutable = async (_selected, args) => {
        if (platform === "windows") {
          assert.equal(args[0], "new-tab");
          if (command) assert.deepEqual(args.slice(1), ["cmd.exe", "/d", "/s", "/c", command]);
          else
            assert.deepEqual(args.slice(2), ["ssh", "JMS-token@gateway.example", "-p", "2222", "-P", "space ' 中文"]);
        } else {
          assert.deepEqual(args.slice(0, 3), ["-e", "bash", "-lc"]);
          if (command) assert.equal(args[3], command);
          else {
            const decoded = shellArguments(args[3]);
            assert.deepEqual(decoded.slice(1), [
              "ssh",
              "JMS-token@gateway.example",
              "-p",
              "2222",
              "-P",
              "space ' 中文"
            ]);
          }
        }
        called = true;
      };
      const payload = {
        protocol: "telnet",
        command,
        endpoint: { host: "gateway.example", port: 2222 },
        token: { id: "token", value: "space ' 中文" }
      };
      await launcher.launch(`jms2://${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
      assert.ok(called);
    }
  });
}

test("plugin modules handle stdin in paths with spaces and reject unsafe results without leaking credentials", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jms plugin 模块 "));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "launch.mjs");
  const application = {
    launch_type: "module",
    module_path: "launch.mjs",
    plugin_dir: directory,
    path: process.execPath,
    executable_type: "user_path"
  };
  const launcher = new LocalApplicationLauncher({ isPackaged: false }, projectRoot, { configDir: directory }, null);
  const secret = "private space ' 中文";
  const payload = {
    protocol: "mysql",
    endpoint: { host: "gateway.example", port: 3306 },
    token: { id: "token", value: secret }
  };
  let launches = 0;
  launcher.launchExecutable = async (_selected, args) => {
    assert.deepEqual(args, [secret]);
    launches++;
  };
  await writeFile(
    filename,
    'export default c => { if (process.env.JMS_CONNECT_JSON) throw Error("unexpected env"); return {type:"args",args:[c.value]}; };'
  );
  await launcher.launchApplication(application, payload);
  assert.equal(launches, 1);
  await writeFile(filename, "export default c => { throw Error(c.value); };");
  await assert.rejects(launcher.launchApplication(application, payload), (error: Error) => {
    assert.match(error.message, /Plugin could not prepare/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  await writeFile(filename, 'export default c => ({type:"args",args:[c.value,42]});');
  await assert.rejects(launcher.launchApplication(application, payload), /invalid launch plan/);
  assert.equal(launches, 1);
});
