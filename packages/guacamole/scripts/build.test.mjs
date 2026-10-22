import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "./build.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimePath = "dist/guacamole.js";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const execute = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "guacamole-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["upstream", "patches", "source-manifest.json", "LICENSE", "NOTICE"]) {
    await cp(join(packageRoot, path), join(root, path), { recursive: true });
  }
  return root;
}

async function updateManifest(root, change) {
  const path = join(root, "source-manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  change(manifest);
  await writeFile(path, JSON.stringify(manifest));
}

test("builds the pinned runtime from source-only fixtures without rewriting matching output", async (t) => {
  const root = await fixture(t);
  const output = join(root, runtimePath);
  const manifestPath = join(root, "source-manifest.json");
  const manifest = await readFile(manifestPath);
  const manifestStat = await stat(manifestPath);
  await assert.rejects(build({ root, check: true }), /stale or missing/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
  const result = await build({ root });
  const runtime = await readFile(output);
  assert.equal(result.changed, true);
  assert.equal(result.sha256, digest(runtime));
  assert.equal((await build({ root, check: true })).changed, false);
  const before = await stat(output);
  assert.equal((await build({ root })).changed, false);
  assert.equal((await stat(output)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readFile(manifestPath), manifest);
  assert.equal((await stat(manifestPath)).mtimeMs, manifestStat.mtimeMs);
  const independentRoot = await fixture(t);
  await build({ root: independentRoot });
  assert.deepEqual(await readFile(join(independentRoot, runtimePath)), runtime);
});

test("concurrent builds publish only complete runtime bytes and leave no temporary files", async (t) => {
  const root = await fixture(t);
  const output = join(root, runtimePath);
  const expected = (await build({ root })).sha256;
  await rm(join(root, "dist"), { recursive: true });
  let pending = true;
  const builds = Promise.all([build({ root }), build({ root })]).finally(() => {
    pending = false;
  });
  try {
    // Bound the observer even if a build fails to settle.
    for (let i = 0; i < 100; i++) {
      if (!pending) break;
      const bytes = await readFile(output).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (bytes) assert.equal(digest(bytes), expected);
      await setImmediate();
    }
  } finally {
    await builds;
  }
  assert.equal(digest(await readFile(output)), expected);
  assert.deepEqual(await readdir(join(root, "dist")), ["guacamole.js"]);
});

test("CLI resolves symlinked paths with either main-module symlink mode and stays inert on import", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "scripts"));
  await cp(join(packageRoot, "scripts/build.mjs"), join(root, "scripts/build.mjs"));
  const alias = join(root, "alias");
  await symlink(root, alias, "junction");
  const script = `${alias}/scripts/../scripts/build.mjs`;
  const options = { cwd: packageRoot, timeout: 5000, maxBuffer: 64 * 1024 };
  const nodeArgs = ["--max-old-space-size=128"];
  await execute(
    process.execPath,
    [...nodeArgs, "--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(script).href)})`],
    options
  );
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
  for (const flags of [[], ["--preserve-symlinks-main"]]) {
    await assert.rejects(
      execute(process.execPath, [...nodeArgs, ...flags, script, "--check"], options),
      (error) => error.code === 1 && /stale or missing/.test(error.stderr)
    );
    const result = await execute(process.execPath, [...nodeArgs, ...flags, script], options);
    assert.equal(result.stdout, `Guacamole built: ${digest(await readFile(join(root, runtimePath)))}\n`);
    await execute(process.execPath, [...nodeArgs, ...flags, script, "--check"], options);
    await rm(join(root, "dist"), { recursive: true });
  }
});

test("check rejects a stale runtime without overwriting it", async (t) => {
  const root = await fixture(t);
  const output = join(root, runtimePath);
  await mkdir(join(root, "dist"));
  await writeFile(output, "stale runtime\n");
  await assert.rejects(build({ root, check: true }), /stale or missing/);
  assert.equal(await readFile(output, "utf8"), "stale runtime\n");
});

test("rejects source changes and an unlisted source before writing", async (t) => {
  const root = await fixture(t);
  const source = join(root, "upstream/modules/Client.js");
  const original = await readFile(source);
  await writeFile(source, Buffer.concat([original, Buffer.from("\n")]));
  await assert.rejects(build({ root }), /SHA-256 mismatch: upstream\/modules\/Client.js/);
  await writeFile(source, original);
  await writeFile(join(root, "upstream/modules/Unexpected.js"), "");
  await assert.rejects(build({ root }), /Upstream files differ/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
});

test("rejects changes to the pinned assembly order", async (t) => {
  const root = await fixture(t);
  await updateManifest(root, (manifest) => {
    [manifest.sources[1], manifest.sources[2]] = [manifest.sources[2], manifest.sources[1]];
  });
  await assert.rejects(build({ root }), /Unpatched assembly differs/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
});

test("builds edited patches without changing manifest bytes or mtime", async (t) => {
  const root = await fixture(t);
  const original = await build({ root });
  const manifestPath = join(root, "source-manifest.json");
  const manifest = await readFile(manifestPath);
  const manifestStat = await stat(manifestPath);
  const output = join(root, runtimePath);
  const runtime = await readFile(output);
  const path = join(root, "patches/Client.patch");
  const patch = (await readFile(path, "utf8")).replace(
    "this copy is only needed while encoding the snapshot.",
    "release this copy after encoding the snapshot."
  );
  await writeFile(path, patch);
  await assert.rejects(build({ root, check: true }), /stale or missing/);
  assert.deepEqual(await readFile(output), runtime);
  const result = await build({ root });
  assert.equal(result.changed, true);
  assert.notEqual(result.sha256, original.sha256);
  assert.equal(result.sha256, digest(await readFile(output)));
  assert.match(await readFile(output, "utf8"), /release this copy after encoding the snapshot\./);
  assert.equal((await build({ root, check: true })).changed, false);
  assert.deepEqual(await readFile(manifestPath), manifest);
  assert.equal((await stat(manifestPath)).mtimeMs, manifestStat.mtimeMs);
});

test("rejects outdated patch context without overwriting the runtime", async (t) => {
  const root = await fixture(t);
  await build({ root });
  const runtime = await readFile(join(root, runtimePath));
  const path = join(root, "patches/Client.patch");
  const patch = (await readFile(path, "utf8")).replace("var index = parseInt(key);", "var index = parseInt(changed);");
  await writeFile(path, patch);
  await assert.rejects(build({ root }), /context mismatch/);
  assert.deepEqual(await readFile(join(root, runtimePath)), runtime);
});

test("rejects malformed hunks and unlisted patches", async (t) => {
  const root = await fixture(t);
  await build({ root });
  const runtime = await readFile(join(root, runtimePath));
  const path = join(root, "patches/Client.patch");
  const original = await readFile(path, "utf8");
  const patch = original.replace("@@ -201,7 +201,6 @@", "@@ -201,8 +201,6 @@");
  await writeFile(path, patch);
  await assert.rejects(build({ root }), /hunk line counts do not match/);
  await writeFile(path, original);
  await writeFile(join(root, "patches/Unexpected.patch"), original);
  await assert.rejects(build({ root }), /Patch files differ/);
  assert.deepEqual(await readFile(join(root, runtimePath)), runtime);
});

test("rejects a changed license before writing", async (t) => {
  const root = await fixture(t);
  const licensePath = join(root, "LICENSE");
  const license = await readFile(licensePath);
  await writeFile(licensePath, Buffer.concat([license, Buffer.from("\n")]));
  await assert.rejects(build({ root }), /SHA-256 mismatch: LICENSE/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
});
