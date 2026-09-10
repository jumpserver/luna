import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { ApplicationConfigService } from "../src/apps/application-config.ts";
import { LocalApplicationLauncher, localAppLauncherInternals } from "../src/apps/local-app-launcher.ts";
import { systemFontInternals } from "../src/apps/system-fonts.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
    await service.updateSelection({ category: "terminal", protocol, name: "test_shell", pluginId, path: undefined });
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

test("normalizes duplicate and hidden system font families", () => {
  assert.deepEqual(systemFontInternals.normalizeFamilies(["Menlo", " .Hidden ", "Menlo", "SF Mono", ""]), [
    "Menlo",
    "SF Mono"
  ]);
});
