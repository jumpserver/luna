import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { ApplicationConfigService } from "../src/apps/application-config.ts";
import { localAppLauncherInternals } from "../src/apps/local-app-launcher.ts";
import { systemFontInternals } from "../src/apps/system-fonts.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  await service.uninstallPlugin({ pluginId: "test.shell" });

  await service.createCustomTerminal({ name: "Test Shell", path: "/bin/sh", template: "{helper} {host}" });
  assert.ok((await service.listPlugins()).some((plugin) => plugin.id === "custom.terminal.test-shell"));
  await service.uninstallPlugin({ pluginId: "custom.terminal.test-shell" });
  assert.ok(!(await service.listPlugins()).some((plugin) => plugin.id === "custom.terminal.test-shell"));
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

test("normalizes duplicate and hidden system font families", () => {
  assert.deepEqual(systemFontInternals.normalizeFamilies(["Menlo", " .Hidden ", "Menlo", "SF Mono", ""]), [
    "Menlo",
    "SF Mono"
  ]);
});
