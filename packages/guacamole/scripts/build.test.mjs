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
  await assert.rejects(build({ root, check: true }), /stale or missing/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
  const result = await build({ root });
  const runtime = await readFile(output);
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  assert.equal(result.changed, true);
  assert.equal(result.sha256, manifest.generatedSha256);
  assert.equal(digest(runtime), manifest.generatedSha256);
  assert.equal((await build({ root, check: true })).changed, false);
  const before = await stat(output);
  assert.equal((await build({ root })).changed, false);
  assert.equal((await stat(output)).mtimeMs, before.mtimeMs);
  const independentRoot = await fixture(t);
  await build({ root: independentRoot });
  assert.deepEqual(await readFile(join(independentRoot, runtimePath)), runtime);
});

test("concurrent builds publish only complete runtime bytes and leave no temporary files", async (t) => {
  const root = await fixture(t);
  const output = join(root, runtimePath);
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
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
      if (bytes) assert.equal(digest(bytes), manifest.generatedSha256);
      await setImmediate();
    }
  } finally {
    await builds;
  }
  assert.equal(digest(await readFile(output)), manifest.generatedSha256);
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
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  for (const flags of [[], ["--preserve-symlinks-main"]]) {
    await assert.rejects(
      execute(process.execPath, [...nodeArgs, ...flags, script, "--check"], options),
      (error) => error.code === 1 && /stale or missing/.test(error.stderr)
    );
    const result = await execute(process.execPath, [...nodeArgs, ...flags, script], options);
    assert.match(result.stdout, /Guacamole built:/);
    assert.equal(digest(await readFile(join(root, runtimePath))), manifest.generatedSha256);
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

test("rejects patch hash changes and outdated context even after the hash is updated", async (t) => {
  const root = await fixture(t);
  await build({ root });
  const runtime = await readFile(join(root, runtimePath));
  const path = join(root, "patches/Client.patch");
  const patch = (await readFile(path, "utf8")).replace("var index = parseInt(key);", "var index = parseInt(changed);");
  await writeFile(path, patch);
  await assert.rejects(build({ root }), /SHA-256 mismatch: patches\/Client.patch/);
  await updateManifest(root, (manifest) => {
    manifest.patches[0].sha256 = digest(patch);
  });
  await assert.rejects(build({ root }), /context mismatch/);
  assert.deepEqual(await readFile(join(root, runtimePath)), runtime);
});

test("rejects malformed hunks and a changed patched-source digest", async (t) => {
  const root = await fixture(t);
  await build({ root });
  const runtime = await readFile(join(root, runtimePath));
  const path = join(root, "patches/Client.patch");
  const original = await readFile(path, "utf8");
  const patch = original.replace("@@ -201,7 +201,6 @@", "@@ -201,8 +201,6 @@");
  await writeFile(path, patch);
  await updateManifest(root, (manifest) => {
    manifest.patches[0].sha256 = digest(patch);
  });
  await assert.rejects(build({ root }), /hunk line counts do not match/);
  await writeFile(path, original);
  await updateManifest(root, (manifest) => {
    manifest.patches[0].sha256 = digest(original);
    manifest.patches[0].resultSha256 = "0".repeat(64);
  });
  await assert.rejects(build({ root }), /Patched source hash mismatch/);
  assert.deepEqual(await readFile(join(root, runtimePath)), runtime);
});

test("rejects a changed license and final runtime digest before writing", async (t) => {
  const root = await fixture(t);
  const licensePath = join(root, "LICENSE");
  const license = await readFile(licensePath);
  await writeFile(licensePath, Buffer.concat([license, Buffer.from("\n")]));
  await assert.rejects(build({ root }), /SHA-256 mismatch: LICENSE/);
  await writeFile(licensePath, license);
  await updateManifest(root, (manifest) => {
    manifest.generatedSha256 = "0".repeat(64);
  });
  await assert.rejects(build({ root }), /Generated runtime SHA-256 mismatch/);
  await assert.rejects(stat(join(root, "dist")), { code: "ENOENT" });
});
