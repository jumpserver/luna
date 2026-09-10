import type { ForgeConfig, ForgeMakeResult, ResolvedForgeConfig } from "@electron-forge/shared-types";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { MakerNsis } from "../maker-nsis";
import { MakerWix } from "@electron-forge/maker-wix";

// Load the configuration with the same TypeScript loader used by Electron Forge.
const configPromise = createJiti(import.meta.url).import<ForgeConfig>("../forge.config.ts", { default: true });

test("packaged clients claim jms2 without taking the legacy client's jms scheme", async () => {
  const config = await configPromise;
  assert.deepEqual(config.packagerConfig.protocols, [{ name: "JumpServer URL", schemes: ["jms2"] }]);
});

test("Windows installers provide a directory selection wizard and preserve the client identity", async () => {
  const config = await configPromise;
  const nsis = config.makers.find((maker) => "name" in maker && maker.name === "nsis") as MakerNsis;
  const wix = config.makers.find((maker) => "name" in maker && maker.name === "wix") as MakerWix;
  assert.ok(nsis);
  assert.ok(wix);
  assert.ok(!config.makers.some((maker) => "name" in maker && maker.name === "squirrel"));
  await nsis.prepareConfig("x64");
  await wix.prepareConfig("x64");
  assert.deepEqual(nsis.platforms, ["win32"]);
  const { options } = nsis.config;
  assert.equal(options.appId, config.packagerConfig.appBundleId);
  assert.equal(options.win.executableName, config.packagerConfig.executableName);
  assert.deepEqual(options.protocols, config.packagerConfig.protocols);
  assert.equal(options.nsis.oneClick, false);
  assert.equal(options.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(options.nsis.createDesktopShortcut, true);
  assert.equal(options.nsis.createStartMenuShortcut, true);
  assert.equal(options.nsis.runAfterFinish, true);
  assert.equal(options.nsis.deleteAppDataOnUninstall, false);
  assert.deepEqual(wix.config.ui, { chooseDirectory: true });
});

test("normalizes release installer filenames", async (context) => {
  const config = await configPromise;
  const makeDir = await mkdtemp(path.join(os.tmpdir(), "jms-forge-artifacts-"));
  context.after(() => rm(makeDir, { recursive: true, force: true }));
  const fixtures = [
    ["darwin", "arm64", "JumpServer-5.0.0-beta6-arm64.dmg", "JumpServer-5.0.0-beta6-arm64.dmg"],
    ["darwin", "x64", "JumpServer-5.0.0-beta6-x64.dmg", "JumpServer-5.0.0-beta6-x64.dmg"],
    ["win32", "x64", "JumpServer-5.0.0-beta6 Setup.exe", "JumpServer-5.0.0-beta6-Setup.exe"],
    ["win32", "x64", "jumpserver.msi", "JumpServer-5.0.0-beta6.msi"],
    ["linux", "x64", "jumpserver-client-electron_5.0.0~beta6_amd64.deb", "JumpServer-5.0.0-beta6-x64.deb"],
    ["linux", "arm64", "jumpserver-client-electron_5.0.0~beta6_arm64.deb", "JumpServer-5.0.0-beta6-arm64.deb"],
    ["linux", "x64", "jumpserver-client-electron-5.0.0.beta6-1.x86_64.rpm", "JumpServer-5.0.0-beta6-x64.rpm"],
    ["linux", "arm64", "jumpserver-client-electron-5.0.0.beta6-1.arm64.rpm", "JumpServer-5.0.0-beta6-arm64.rpm"]
  ] as const;
  const results: ForgeMakeResult[] = [];
  for (const [platform, arch, original] of fixtures) {
    const directory = path.join(makeDir, platform, arch, path.extname(original) || "manifest");
    await mkdir(directory, { recursive: true });
    const artifact = path.join(directory, original);
    await writeFile(artifact, original);
    results.push({
      platform,
      arch,
      packageJSON: { productName: "JumpServer", version: "5.0.0-beta6" },
      artifacts: [artifact]
    });
  }

  assert.equal(await config.hooks.postMake(config as ResolvedForgeConfig, results), results);
  for (const [index, [, , original, expected]] of fixtures.entries()) {
    const artifact = results[index].artifacts[0];
    assert.equal(path.basename(artifact), expected);
    assert.equal(await readFile(artifact, "utf8"), original);
    assert.deepEqual(await readdir(path.dirname(artifact)), [expected]);
  }
  await config.hooks.postMake(config as ResolvedForgeConfig, results);
  assert.ok(!config.makers.some((maker) => "name" in maker && maker.name === "zip"));
});

test("keeps custom product names space-free and distinguishes other Windows architectures", async (context) => {
  const config = await configPromise;
  const makeDir = await mkdtemp(path.join(os.tmpdir(), "jms-forge-custom-"));
  context.after(() => rm(makeDir, { recursive: true, force: true }));
  const artifact = path.join(makeDir, "Custom Client-5.0.0 Setup.exe");
  await writeFile(artifact, "installer");
  const results: ForgeMakeResult[] = [
    {
      platform: "win32",
      arch: "arm64",
      packageJSON: { productName: "Custom Client", version: "5.0.0" },
      artifacts: [artifact]
    }
  ];

  await config.hooks.postMake(config as ResolvedForgeConfig, results);

  assert.equal(path.basename(results[0].artifacts[0]), "Custom-Client-5.0.0-arm64-Setup.exe");
  assert.equal(await readFile(results[0].artifacts[0], "utf8"), "installer");
});
