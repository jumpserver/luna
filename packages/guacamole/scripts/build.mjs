import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ESM_EXPORT = "\n// JumpServer: expose the shared namespace as an ES module.\nexport default Guacamole;\n";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verifiedFile(root, path, expected) {
  const bytes = await readFile(join(root, path));
  if (sha256(bytes) !== expected.sha256) throw new Error(`SHA-256 mismatch: ${path}`);
  if (expected.gitBlob) {
    const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (hash !== expected.gitBlob) throw new Error(`Git blob mismatch: ${path}`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Apply one standard unified diff with exact positions/context. No fuzzy matching or external tools. */
function applyPatch(source, patch, path) {
  const fail = (reason) => {
    throw new Error(`Invalid or outdated patch for ${path}: ${reason}`);
  };
  if (!patch.endsWith("\n") || patch.includes("\r")) fail("expected LF-terminated patch text");
  const original = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const lines = patch.slice(0, -1).split("\n");
  if (lines[0] !== `--- a/${path}` || lines[1] !== `+++ b/${path}`) fail("unexpected file headers");
  const result = [];
  let cursor = 0;
  let index = 2;
  let hunks = 0;
  while (index < lines.length) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index++]);
    if (!match) fail("expected a unified diff hunk");
    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? 1);
    const newStart = Number(match[3]);
    const newCount = Number(match[4] ?? 1);
    if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger)) fail("invalid hunk range");
    const start = oldCount ? oldStart - 1 : oldStart;
    if (start < cursor || start > original.length) fail("hunks overlap or exceed source");
    result.push(...original.slice(cursor, start));
    cursor = start;
    if (result.length !== (newCount ? newStart - 1 : newStart)) fail("unexpected output position");
    let removed = 0;
    let added = 0;
    while (index < lines.length && !lines[index].startsWith("@@ ")) {
      const line = lines[index++];
      const marker = line[0];
      let content = `${line.slice(1)}\n`;
      if (marker !== " " && marker !== "+" && marker !== "-") fail("unsupported hunk line");
      if (lines[index] === "\\ No newline at end of file") {
        content = content.slice(0, -1);
        index++;
      }
      if (marker !== "+") {
        if (original[cursor++] !== content) fail(`context mismatch at source line ${cursor}`);
        removed++;
      }
      if (marker !== "-") {
        result.push(content);
        added++;
      }
    }
    if (removed !== oldCount || added !== newCount) fail("hunk line counts do not match");
    hunks++;
  }
  if (!hunks) fail("empty patch");
  result.push(...original.slice(cursor));
  if (result.slice(0, -1).some((line) => !line.endsWith("\n"))) fail("misplaced end-of-file marker");
  return result.join("");
}

/** Build from committed sources only. check=true performs no writes, including when output is missing. */
export async function build({ root = PACKAGE_ROOT, check = false } = {}) {
  const manifest = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.upstream.commit)) {
    throw new Error("Unsupported source manifest or invalid upstream commit.");
  }
  const sourcePaths = manifest.sources.map((source) => source.path);
  if (
    sourcePaths[0] !== "common/license.js" ||
    new Set(sourcePaths).size !== sourcePaths.length ||
    sourcePaths.some((path) => !/^(?:common\/license|modules\/[A-Za-z0-9]+)\.js$/.test(path))
  ) {
    throw new Error("Invalid or duplicate upstream source paths.");
  }
  const actualPaths = [];
  for (const directory of ["common", "modules"]) {
    for (const entry of await readdir(join(root, "upstream", directory), { withFileTypes: true })) {
      if (!entry.isFile()) throw new Error(`Unexpected upstream entry: ${directory}/${entry.name}`);
      actualPaths.push(`${directory}/${entry.name}`);
    }
  }
  if (JSON.stringify(actualPaths.sort()) !== JSON.stringify([...sourcePaths].sort())) {
    throw new Error("Upstream files differ from the source manifest.");
  }
  if (JSON.stringify(manifest.licenses.map((license) => license.path)) !== '["LICENSE","NOTICE"]') {
    throw new Error("Expected the upstream LICENSE and NOTICE.");
  }
  for (const license of manifest.licenses) await verifiedFile(root, license.path, license);

  const sources = new Map();
  for (const source of manifest.sources) {
    sources.set(source.path, await verifiedFile(root, `upstream/${source.path}`, source));
  }
  // Preserve the official unminified assembly: common/license.js followed by modules, separated by LF.
  if (sha256([...sources.values()].join("\n")) !== manifest.upstream.artifact.allJsSha256) {
    throw new Error("Unpatched assembly differs from the pinned official all.js.");
  }
  const patched = new Set();
  const patchPaths = [];
  for (const patch of manifest.patches) {
    if (
      !/^patches\/[A-Za-z0-9-]+\.patch$/.test(patch.path) ||
      !patch.source.startsWith("modules/") ||
      !sources.has(patch.source) ||
      patched.has(patch.source) ||
      patchPaths.includes(patch.path)
    ) {
      throw new Error("Invalid or duplicate patch target.");
    }
    const text = await verifiedFile(root, patch.path, patch);
    const output = applyPatch(sources.get(patch.source), text, patch.source);
    if (sha256(output) !== patch.resultSha256) throw new Error(`Patched source hash mismatch: ${patch.source}`);
    sources.set(patch.source, output);
    patched.add(patch.source);
    patchPaths.push(patch.path);
  }
  const actualPatches = await readdir(join(root, "patches"));
  if (JSON.stringify(actualPatches.sort().map((name) => `patches/${name}`)) !== JSON.stringify(patchPaths.sort())) {
    throw new Error("Patch files differ from the source manifest.");
  }
  const generated = Buffer.from([...sources.values()].join("\n") + ESM_EXPORT);
  const generatedSha256 = sha256(generated);
  if (generatedSha256 !== manifest.generatedSha256) {
    throw new Error(
      `Generated runtime SHA-256 mismatch: expected ${manifest.generatedSha256}, got ${generatedSha256}.`
    );
  }
  const output = join(root, "dist", "guacamole.js");
  const current = await readFile(output).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  const changed = !current?.equals(generated);
  if (check && changed) throw new Error("Generated dist/guacamole.js is stale or missing. Run the package build.");
  if (!check && changed) {
    await mkdir(dirname(output), { recursive: true });
    // Readers and simultaneous builds must only observe complete output.
    const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, generated, { flag: "wx" });
      await rename(temporary, output);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return { output, sha256: generatedSha256, changed };
}

const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entryPath === (await realpath(fileURLToPath(import.meta.url)))) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
      throw new Error("Usage: node scripts/build.mjs [--check]");
    const result = await build({ check: args[0] === "--check" });
    console.log(`Guacamole ${args[0] === "--check" ? "verified" : "built"}: ${result.sha256}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
