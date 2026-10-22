import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { upgrade } from "./upgrade.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "guacamole-upgrade-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(packageRoot, root, { recursive: true });
  return root;
}

async function snapshot(root, directory = "", files = {}) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await snapshot(root, path, files);
    else
      files[path] = {
        sha256: digest(await readFile(join(root, path))),
        mtimeMs: (await stat(join(root, path))).mtimeMs
      };
  }
  return files;
}

async function releaseFrom(root, release, change = (path, bytes) => bytes) {
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  const sources = [];
  for (const source of manifest.sources) {
    const bytes = Buffer.from(change(source.path, await readFile(join(root, "upstream", source.path))));
    sources.push({ path: source.path, bytes, sha256: digest(bytes), gitBlob: gitBlob(bytes) });
  }
  const licenses = [];
  for (const license of manifest.licenses)
    licenses.push({ ...license, bytes: await readFile(join(root, license.path)) });
  return {
    upstream: {
      ...manifest.upstream,
      release,
      artifact: {
        ...manifest.upstream.artifact,
        url: manifest.upstream.artifact.url.replaceAll(manifest.upstream.release, release),
        allJsSha256: digest(sources.map((source) => source.bytes.toString("utf8")).join("\n"))
      }
    },
    sources,
    licenses
  };
}

function cleanupReport(t, report) {
  t.after(() => rm(report.workspace, { recursive: true, force: true }));
  return report;
}

async function cleanGit(root) {
  const git = (args) => execute("git", args, { cwd: root, timeout: 5000, maxBuffer: 64 * 1024 });
  await git(["init", "--quiet"]);
  await git(["add", "--", "."]);
  await git([
    "-c",
    "user.name=Upgrade Test",
    "-c",
    "user.email=upgrade-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "Pinned fixture"
  ]);
}

test("dry-run prepares only upstream inputs without changing current files", async (t) => {
  const root = await fixture(t);
  for (const path of ["patches", "package.json", "types", "scripts", "dist"]) {
    await rm(join(root, path), { recursive: true, force: true });
  }
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  const before = await snapshot(root);
  const report = cleanupReport(
    t,
    await upgrade({
      root,
      release: "1.6.0",
      dryRun: true,
      loadRelease: (release) => releaseFrom(root, release)
    })
  );
  assert.equal(report.status, "ready");
  assert.deepEqual((await readdir(report.candidate)).sort(), [
    "LICENSE",
    "NOTICE",
    "README.md",
    "source-manifest.json",
    "upstream"
  ]);
  const candidate = JSON.parse(await readFile(join(report.candidate, "source-manifest.json"), "utf8"));
  assert.equal(candidate.upstream.release, "1.6.0");
  assert.deepEqual(candidate.patches, manifest.patches);
  assert.equal(candidate.generatedSha256, manifest.generatedSha256);
  assert.match(JSON.stringify(report.remainingChecks), /patch/i);
  assert.deepEqual(await snapshot(root), before);
});

test("download failures leave the current package unchanged", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  await assert.rejects(
    upgrade({
      root,
      release: "1.6.0",
      dryRun: true,
      loadRelease: async () => {
        throw new Error("Offline release download failed");
      }
    }),
    (error) => {
      if (error.workspace) cleanupReport(t, error);
      assert.match(error.message, /Offline release download failed/);
      return true;
    }
  );
  assert.deepEqual(await snapshot(root), before);
});

test("invalid releases never load upstream and importing the command stays inert", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  let loaded = false;
  await assert.rejects(
    upgrade({
      root,
      release: "../1.6.0",
      loadRelease: async () => {
        loaded = true;
      }
    }),
    /release|version/i
  );
  assert.equal(loaded, false);
  const code = `globalThis.fetch = () => { throw new Error("Unexpected network request"); }; await import(${JSON.stringify(new URL("./upgrade.mjs", import.meta.url).href)});`;
  const result = await execute(process.execPath, ["--max-old-space-size=128", "--input-type=module", "--eval", code], {
    cwd: root,
    timeout: 5000,
    maxBuffer: 64 * 1024
  });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.deepEqual(await snapshot(root), before);
});

test("apply updates upstream while preserving independently edited patches and runtime metadata", async (t) => {
  const root = await fixture(t);
  await cleanGit(root);
  const manifestPath = join(root, "source-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.patches[0].sha256 = "0".repeat(64);
  manifest.generatedSha256 = "pending-independent-patch-maintenance";
  manifest.maintainer = { notes: "Preserve independent patch metadata" };
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(join(root, "patches/Client.patch"), "Unfinished manually maintained patch.\n");
  const readmePath = join(root, "README.md");
  const notes = "\nUncommitted independent patch notes.\n";
  await writeFile(readmePath, `${await readFile(readmePath, "utf8")}${notes}`);
  const before = await snapshot(root);
  const loaded = await releaseFrom(root, "1.6.0", (path, bytes) =>
    path === "modules/Client.js" ? `// Upstream source update.\n${bytes.toString("utf8")}` : bytes
  );
  const report = cleanupReport(
    t,
    await upgrade({
      root,
      release: "1.6.0",
      loadRelease: async () => loaded
    })
  );
  assert.equal(report.status, "updated");
  const current = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(current, {
    ...manifest,
    upstream: loaded.upstream,
    sources: loaded.sources.map(({ bytes: _bytes, ...source }) => source),
    licenses: loaded.licenses.map(({ bytes: _bytes, ...license }) => license)
  });
  for (const source of loaded.sources) {
    assert.deepEqual(await readFile(join(root, "upstream", source.path)), source.bytes);
  }
  assert.ok((await readFile(readmePath, "utf8")).endsWith(notes));
  assert.match(JSON.stringify(report.remainingChecks), /patch/i);
  const after = await snapshot(root);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const [path, value] of Object.entries(before)) {
    if (!/^(?:upstream\/|LICENSE$|NOTICE$|source-manifest\.json$|README\.md$)/.test(path)) {
      assert.deepEqual(after[path], value, `${path} changed during upgrade`);
    }
  }
});

test("apply refuses to overwrite uncommitted upstream files", async (t) => {
  const root = await fixture(t);
  await cleanGit(root);
  const path = join(root, "upstream/modules/Client.js");
  await writeFile(path, `${await readFile(path, "utf8")}\n// Uncommitted upstream edit.\n`);
  const before = await snapshot(root);
  await assert.rejects(
    upgrade({ root, release: "1.6.0", loadRelease: (release) => releaseFrom(root, release) }),
    (error) => {
      if (error.workspace) cleanupReport(t, error);
      assert.match(error.message, /commit or stash/i);
      return true;
    }
  );
  assert.deepEqual(await snapshot(root), before);
});

test("apply preserves patch metadata saved while the release is loading", async (t) => {
  const root = await fixture(t);
  await cleanGit(root);
  const manifestPath = join(root, "source-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let afterSave;
  await assert.rejects(
    upgrade({
      root,
      release: "1.6.0",
      loadRelease: async (release) => {
        const loaded = await releaseFrom(root, release, (path, bytes) =>
          path === "modules/Client.js" ? `// Upstream source update.\n${bytes.toString("utf8")}` : bytes
        );
        manifest.patches[0].resultSha256 = "1".repeat(64);
        await writeFile(manifestPath, JSON.stringify(manifest));
        afterSave = await snapshot(root);
        return loaded;
      }
    }),
    (error) => {
      if (error.workspace) cleanupReport(t, error);
      assert.match(error.message, /inputs changed during preparation/i);
      return true;
    }
  );
  assert.deepEqual(await snapshot(root), afterSave);
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
});

test("apply preserves another publisher's lock and leaves current files unchanged", async (t) => {
  const root = await realpath(await fixture(t));
  await cleanGit(root);
  const lock = join(dirname(root), `.${basename(root)}-upgrade.lock`);
  await mkdir(lock);
  t.after(() => rm(lock, { recursive: true, force: true }));
  await writeFile(join(lock, "owner"), "Another publisher owns this lock.\n");
  const before = await snapshot(root);
  const lockBefore = await snapshot(lock);
  await assert.rejects(
    upgrade({ root, release: "1.6.0", loadRelease: (release) => releaseFrom(root, release) }),
    (error) => {
      if (error.workspace) cleanupReport(t, error);
      assert.match(error.message, /another upgrade may be publishing/i);
      return true;
    }
  );
  assert.deepEqual(await snapshot(root), before);
  assert.deepEqual(await snapshot(lock), lockBefore);
});
