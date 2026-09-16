import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom";
import { MSICreator } from "electron-wix-msi";
import { flattenWebLiteMsi } from "../scripts/flatten-msi.mjs";

for (const version of ["5.0.0", "5.0.0-beta18"]) {
  test(`MSI installs the real executable at a stable path (${version})`, async (t) => {
    const work = await mkdtemp(path.join(os.tmpdir(), "weblite msi-"));
    t.after(() => rm(work, { recursive: true, force: true }));
    const appDirectory = path.join(work, "app");
    const outputDirectory = path.join(work, "installer");
    await mkdir(path.join(appDirectory, "resources"), { recursive: true });
    await mkdir(path.join(appDirectory, "locales"));
    await mkdir(outputDirectory);
    for (const file of ["weblite.exe", "LICENSE", "resources/app.asar", "locales/en-US.pak"]) {
      await writeFile(path.join(appDirectory, file), file);
    }
    const upgradeCode = "BBB88A37-4470-4B1C-B582-EAE84A775985";
    const creator = new MSICreator({
      appDirectory,
      outputDirectory,
      name: "JumpServer WebLite",
      description: "WebLite",
      manufacturer: "JumpServer",
      exe: "weblite.exe",
      programFilesFolderName: "WebLite",
      nestedFolderName: "JumpServer",
      arch: "x64",
      defaultInstallMode: "perMachine",
      upgradeCode,
      version
    });
    // Only native launcher generation is replaced; the installed library generates the WiX layout.
    Object.assign(creator, {
      getSpecialFiles: async () => [
        { name: "weblite.exe", path: path.join(work, "launcher.exe") },
        { name: ".installInfo.json", path: path.join(work, "installInfo.json") }
      ]
    });
    const { wxsContent } = await creator.create();
    const flat = flattenWebLiteMsi(wxsContent, appDirectory, version);
    const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(flat, "text/xml");
    const elements = (name: string) => Array.from(document.getElementsByTagName(name));
    const directories = elements("Directory");
    const root = directories.find((node) => node.getAttribute("Id") === "APPLICATIONROOTDIRECTORY")!;
    assert.equal(root.getAttribute("Name"), "WebLite");
    assert.equal((root.parentNode as typeof root).getAttribute("Name"), "JumpServer");
    assert.equal((root.parentNode?.parentNode as typeof root).getAttribute("Id"), "ProgramFiles64Folder");
    assert.ok(!directories.some((node) => node.getAttribute("Name")?.startsWith("app-")));
    const executables = elements("File").filter((node) => node.getAttribute("Name") === "weblite.exe");
    assert.equal(executables.length, 1);
    assert.equal(executables[0].getAttribute("Source"), path.join(appDirectory, "weblite.exe"));
    assert.equal(executables[0].parentNode?.parentNode, root);
    assert.ok(!flat.includes("launcher.exe"));
    for (const [name, directory] of [
      ["app.asar", "resources"],
      ["en-US.pak", "locales"]
    ]) {
      const file = elements("File").find((node) => node.getAttribute("Name") === name)!;
      assert.equal((file.parentNode?.parentNode as typeof root).getAttribute("Name"), directory);
      assert.equal(file.parentNode?.parentNode?.parentNode, root);
    }
    const components = new Set(elements("Component").map((node) => node.getAttribute("Id")));
    for (const reference of elements("ComponentRef")) assert.ok(components.has(reference.getAttribute("Id")));
    for (const shortcut of elements("Shortcut")) {
      assert.equal(shortcut.getAttribute("Target"), "[APPLICATIONROOTDIRECTORY]weblite.exe");
    }
    assert.equal(elements("Product")[0].getAttribute("UpgradeCode"), upgradeCode);
    assert.equal(elements("MajorUpgrade")[0].getAttribute("AllowSameVersionUpgrades"), "yes");
    assert.equal(elements("Package")[0].getAttribute("InstallScope"), "perMachine");
    assert.throws(() => flattenWebLiteMsi(wxsContent, appDirectory, "0.0.0"), /version directory/);
    assert.throws(() => flattenWebLiteMsi(wxsContent, work, version), /executable source/);
    assert.throws(() => flattenWebLiteMsi(flat, appDirectory, version), /version directory/);
  });
}
