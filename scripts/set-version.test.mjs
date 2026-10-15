import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const files = ["package.json", "electron/package.json", "applets/weblite/package.json", "ui/app.config.ts"];

function workspace(context) {
  const root = mkdtempSync(path.join(os.tmpdir(), "luna-release-version-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["scripts/set-version.js", ...files]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(repo, file), path.join(root, file));
  }
  return root;
}

function setVersion(root, target, version) {
  return spawnSync(process.execPath, [path.join(root, "scripts/set-version.js")], {
    env: { ...process.env, RELEASE_TARGET: target, VERSION: version, GITHUB_OUTPUT: path.join(root, "outputs") },
    encoding: "utf8",
    timeout: 10_000
  });
}

test("client tags preserve the installer version and leave WebLite unchanged", (context) => {
  const root = workspace(context);
  const weblite = readFileSync(path.join(root, files[2]), "utf8");
  const result = setVersion(root, "client", "client-v5.1.1-rc.2");
  assert.equal(result.status, 0, result.stderr);
  for (const file of files.slice(0, 2)) {
    assert.equal(JSON.parse(readFileSync(path.join(root, file), "utf8")).version, "5.1.1-rc.2");
  }
  assert.match(readFileSync(path.join(root, files[3]), "utf8"), /version: "5\.1\.1-rc\.2"/);
  assert.equal(readFileSync(path.join(root, files[2]), "utf8"), weblite);
  assert.equal(
    readFileSync(path.join(root, "outputs"), "utf8"),
    "target=client\nversion=5.1.1-rc.2\ntag=client-v5.1.1-rc.2\n"
  );
});

test("WebLite tags and manual versions only update the WebLite package", (context) => {
  const root = workspace(context);
  const unchanged = [files[0], files[1], files[3]].map((file) => readFileSync(path.join(root, file), "utf8"));
  for (const version of ["weblite-v5.2.0", "v5.2.0-rc1", "5.2.0"]) {
    const result = setVersion(root, "weblite", version);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(readFileSync(path.join(root, files[2]), "utf8")).version,
      version.replace(/^(weblite-)?v/, "")
    );
  }
  assert.deepEqual(
    [files[0], files[1], files[3]].map((file) => readFileSync(path.join(root, file), "utf8")),
    unchanged
  );
});

test("invalid and cross-product release inputs fail before modifying packages", (context) => {
  const root = workspace(context);
  const before = files.map((file) => readFileSync(path.join(root, file), "utf8"));
  for (const [target, version] of [
    ["client", "weblite-v5.1.0"],
    ["weblite", "client-v5.1.0"],
    ["web", "5.1.0"],
    ["client", ""],
    ["client", "client-vv5.1.0"],
    ["client", "5.1"],
    ["client", "5.01.0"],
    ["client", "5.1.0-01"],
    ["client", "5.1.0\ntag=other"]
  ]) {
    assert.notEqual(setVersion(root, target, version).status, 0, `${target}: ${version}`);
  }
  assert.deepEqual(
    files.map((file) => readFileSync(path.join(root, file), "utf8")),
    before
  );
});
