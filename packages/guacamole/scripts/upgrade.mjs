import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fetchRelease } from "./upgrade-source.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TARGETS = ["upstream", "LICENSE", "NOTICE", "source-manifest.json", "README.md"];
const execute = promisify(execFile);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function fingerprint(root) {
  const entries = [];
  async function visit(path) {
    const absolute = join(root, path);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
    } else if (stat.isFile()) {
      entries.push([path, digest(await readFile(absolute))]);
    } else throw new Error(`Refusing to replace a non-regular input: ${path}`);
  }
  for (const path of TARGETS) await visit(path);
  return json(entries);
}

async function requireCleanTargets(root) {
  const { stdout } = await execute(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "upstream", "LICENSE", "NOTICE"],
    { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  if (stdout.trim()) throw new Error("Commit or stash uncommitted upstream/license changes first, or use --dry-run.");
}

function updateProvenance(readme, snapshot) {
  const { release, commit, repository, artifact } = snapshot.upstream;
  const versionSource = snapshot.sources.find((source) => source.path === "modules/Version.js");
  const apiVersion = versionSource?.bytes.toString("utf8").match(/Guacamole\.API_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  const section = [
    "## Upstream snapshot",
    "",
    `- Project: ${repository}`,
    `- Release: **${release}**`,
    `- Commit: \`${commit}\``,
    `- Artifact: ${artifact.url}`,
    `- ZIP SHA-256: \`${artifact.sha256}\``,
    `- Original \`guacamole-common-js/all.js\` SHA-256: \`${artifact.allJsSha256}\``,
    "",
    `\`upstream/\` contains the original \`common/license.js\` and all ${snapshot.sources.length - 1} JavaScript modules from this commit's \`guacamole-common-js/src/main/webapp/\`. Each file's Git blob ID was verified against the pinned commit. The modules also match the official ZIP byte-for-byte. LICENSE and NOTICE are from the same commit.`,
    ...(apiVersion
      ? [
          `The upstream \`Guacamole.API_VERSION\` is \`${apiVersion}\`; the release and commit above identify the pinned snapshot.`
        ]
      : []),
    "",
    ""
  ].join("\n");
  const start = readme.indexOf("## Upstream snapshot\n");
  const end = readme.indexOf("## Reproducible build\n", start);
  if (start < 0 || end < 0) throw new Error("Cannot locate the README provenance section; update it manually.");
  return readme.slice(0, start) + section + readme.slice(end);
}

async function cleanup(path, warnings) {
  try {
    await rm(path, { recursive: true });
  } catch (error) {
    warnings.push(`Could not remove temporary path ${path}: ${error.message}`);
  }
}

async function publish(root, candidate, before, warnings) {
  const lock = join(dirname(root), `.${basename(root)}-upgrade.lock`);
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(`Another upgrade may be publishing this package. Check ${lock} before retrying.`);
    throw error;
  }
  try {
    await replaceInputs(root, candidate, before, warnings);
  } finally {
    await cleanup(lock, warnings);
  }
}

async function replaceInputs(root, candidate, before, warnings) {
  await requireCleanTargets(root);
  if ((await fingerprint(root)) !== before)
    throw new Error("Upgrade inputs changed during preparation; refusing to overwrite them.");
  // Stage on the same filesystem so replacement and rollback use rename, including on Windows.
  const stage = await mkdtemp(join(dirname(root), ".guacamole-upgrade-"));
  const saved = [];
  const installed = [];
  let keepBackup = false;
  try {
    await mkdir(join(stage, "new"));
    await mkdir(join(stage, "backup"));
    for (const path of TARGETS) await cp(join(candidate, path), join(stage, "new", path), { recursive: true });
    if ((await fingerprint(root)) !== before)
      throw new Error("Upgrade inputs changed while staging; refusing to overwrite them.");
    for (const path of TARGETS) {
      await rename(join(root, path), join(stage, "backup", path));
      saved.push(path);
      await rename(join(stage, "new", path), join(root, path));
      installed.push(path);
    }
  } catch (error) {
    try {
      for (const path of installed.reverse()) await rm(join(root, path), { recursive: true, force: true });
      for (const path of saved.reverse()) await rename(join(stage, "backup", path), join(root, path));
    } catch (rollbackError) {
      keepBackup = true;
      throw new Error(
        `Upgrade failed and rollback needs attention. Originals are in ${stage}/backup. ${rollbackError.message}`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    if (!keepBackup) await cleanup(stage, warnings);
  }
}

/** Update only official upstream inputs. Local patches and runtime metadata stay independent. */
export async function upgrade({ release, root = PACKAGE_ROOT, dryRun = false, loadRelease = fetchRelease } = {}) {
  if (
    typeof release !== "string" ||
    release.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(release)
  ) {
    throw new Error("Specify an exact Apache release, such as 1.6.0.");
  }
  root = await realpath(root);
  const before = await fingerprint(root);
  const current = JSON.parse(await readFile(join(root, "source-manifest.json"), "utf8"));
  if (current.schemaVersion !== 1 || !current.upstream?.release || !Array.isArray(current.sources)) {
    throw new Error("Unsupported source manifest.");
  }
  if (!dryRun) await requireCleanTargets(root);
  const workspace = await mkdtemp(join(tmpdir(), `guacamole-upgrade-${release}-`));
  const candidate = join(workspace, "package");
  const reportPath = join(workspace, "report.json");
  const report = {
    status: "preparing",
    from: current.upstream.release,
    to: release,
    workspace,
    candidate,
    reportPath,
    checks: [],
    warnings: [],
    remainingChecks: [
      "Maintain patches separately, including their input/result hashes and the final generatedSha256.",
      "The workspace package version and dist are unchanged; finish integration before building/releasing.",
      "Reconcile the preserved local type declarations against the new upstream APIs.",
      "Run strict package/Web/Electron typechecks, generator tests and Chromium Guacamole regressions.",
      "Verify real recordings and live connections on Web/Electron, then both production builds."
    ]
  };
  try {
    const snapshot = await loadRelease(release);
    if (snapshot.upstream.release !== release)
      throw new Error("Downloaded release does not match the requested release.");
    report.commit = snapshot.upstream.commit;
    const previousPaths = new Set(current.sources.map((source) => source.path));
    const nextPaths = new Set(snapshot.sources.map((source) => source.path));
    report.addedSources = [...nextPaths].filter((path) => !previousPaths.has(path));
    report.removedSources = [...previousPaths].filter((path) => !nextPaths.has(path));
    await mkdir(join(candidate, "upstream", "common"), { recursive: true });
    await mkdir(join(candidate, "upstream", "modules"));
    for (const source of snapshot.sources) {
      if (!/^(?:common\/license|modules\/[A-Za-z0-9]+)\.js$/.test(source.path))
        throw new Error(`Unsupported source path: ${source.path}`);
      await writeFile(join(candidate, "upstream", source.path), source.bytes);
    }
    if (json(snapshot.licenses.map((license) => license.path)) !== json(["LICENSE", "NOTICE"]))
      throw new Error("Expected upstream LICENSE and NOTICE.");
    for (const license of snapshot.licenses) await writeFile(join(candidate, license.path), license.bytes);
    const metadata = (entries) => entries.map(({ bytes: _bytes, ...entry }) => entry);
    const manifest = {
      ...current,
      upstream: snapshot.upstream,
      sources: metadata(snapshot.sources),
      licenses: metadata(snapshot.licenses)
    };
    await writeFile(join(candidate, "source-manifest.json"), json(manifest));
    await writeFile(
      join(candidate, "README.md"),
      updateProvenance(await readFile(join(root, "README.md"), "utf8"), snapshot)
    );
    report.checks.push(
      "Official release, source Git blobs, complete module set and upstream all.js assembly verified."
    );
    if ((await fingerprint(root)) !== before)
      throw new Error("Upgrade inputs changed during preparation; refusing to overwrite them.");
    report.status = "ready";
    await writeFile(reportPath, json(report));
    if (!dryRun) {
      await publish(root, candidate, before, report.warnings);
      report.status = "updated";
      try {
        await writeFile(reportPath, json(report));
      } catch (error) {
        report.warnings.push(`Upstream updated, but could not save the final report: ${error.message}`);
      }
    }
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await writeFile(reportPath, json(report));
    error.reportPath = reportPath;
    error.workspace = workspace;
    throw error;
  }
}

const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entryPath === (await realpath(fileURLToPath(import.meta.url)))) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== "--dry-run")) {
      throw new Error("Usage: node scripts/upgrade.mjs <release> [--dry-run]");
    }
    const report = await upgrade({ release: args[0], dryRun: args[1] === "--dry-run" });
    console.log(`Guacamole upstream ${report.from} -> ${report.to}: ${report.status}`);
    console.log(`Report: ${report.reportPath}`);
    for (const warning of report.warnings) console.error(warning);
    console.log(
      report.status === "ready"
        ? `Dry run only; current package unchanged. Upstream candidate: ${report.candidate}`
        : "Upstream inputs updated. Patches, package version and dist are unchanged."
    );
    for (const check of report.remainingChecks) console.log(`Required follow-up: ${check}`);
  } catch (error) {
    console.error(error.message);
    if (error.reportPath) console.error(`Report: ${error.reportPath}`);
    process.exitCode = 1;
  }
}
