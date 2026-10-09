import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    assert.equal(dbx.launch_type, "args");
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
        const args = localAppLauncherInternals.splitArguments(argumentString);
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
      assert.deepEqual(localAppLauncherInternals.splitArguments(argumentString), [
        "-con",
        "name=Dameng|driver=dameng|user=token-id|password=secret|host=gateway.example.com|port=5525|save=false|connect=true"
      ]);
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
    launcher.launchTerminal = async (selected, command) => {
      assert.equal(selected.name, "terminal");
      assert.equal(command, "disql 'token-id/p'\\''a&b@gateway.example.com:5525'");
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
    launcher.launchTerminal = launch;
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
      assert.ok(args.includes(expected), args);
      assert.ok(args.includes("gateway.example.com"), args);
      assert.ok(args.includes("5525"), args);
      assert.ok(!args.includes("mariadb"), args);
      launches++;
    };
    launcher.launchExecutable = checkArgs;
    launcher.launchTerminal = checkArgs;
    launcher.launchScript = async (selected, received, values) => {
      assert.equal(selected, application);
      assert.deepEqual(received, { ...payload, protocol: "mysql", ...(received.client ? { client: plugin } : {}) });
      assert.equal(values.protocol, "mysql");
      assert.equal(values.dbeaver_protocol, "mysql");
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
        assert.deepEqual(localAppLauncherInternals.splitArguments(argumentString), [uri]);
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
