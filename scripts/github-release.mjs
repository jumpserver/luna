import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, readdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function gh(args, body) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function prepareRelease(repo, tag, sha, run = gh) {
  const endpoint = `repos/${repo}/releases`;
  const releases = run(["api", endpoint, "--paginate", "--jq", `map(select(.tag_name == ${JSON.stringify(tag)}))`])
    .trim()
    .split("\n")
    .flatMap((page) => JSON.parse(page))
    .filter((release) => release.tag_name === tag);
  // Prefer the public release if an older duplicate draft exists.
  const published = releases.find((release) => !release.draft);
  if (!published && releases.length > 1) {
    throw new Error(`Multiple draft releases exist for ${tag}; resolve them before publishing`);
  }
  // Remove the old combined manifest before any platform can replace installers.
  const legacyChecksums = (published || releases[0])?.assets?.find((asset) => asset.name === "SHA256SUMS");
  if (legacyChecksums) {
    run(["api", `repos/${repo}/releases/assets/${legacyChecksums.id}`, "--method", "DELETE"]);
  }
  if (published) return published;
  if (releases.length === 1) {
    return JSON.parse(
      run(["api", `${endpoint}/${releases[0].id}`, "--method", "PATCH", "--input", "-"], {
        draft: false,
        prerelease: true,
        make_latest: "false"
      })
    );
  }
  return JSON.parse(
    run(["api", endpoint, "--method", "POST", "--input", "-"], {
      tag_name: tag,
      target_commitish: sha,
      name: tag,
      draft: false,
      prerelease: true,
      make_latest: "false"
    })
  );
}

export async function uploadReleaseAssets(repo, tag, root, platform, run = gh, buildVersion = "") {
  if (!/^[A-Za-z0-9-]+$/.test(platform)) throw new Error("Invalid release platform");
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(dmg|exe|msi|deb|rpm)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  if (!files.length) throw new Error(`No installers found in ${root}`);
  const releaseVersion = tag.match(/^(?:client|weblite)-v(\d+\.\d+\.\d+)$/)?.[1];
  if (buildVersion && !releaseVersion) throw new Error("Expected a release tag without a build suffix");
  const versionSuffix = new RegExp(
    `-${RegExp.escape(buildVersion)}((?:-(?:x64|arm64))?(?:-Setup)?\\.(?:dmg|exe|msi|deb|rpm))$`
  );
  const names = files.map((file) => {
    const name = basename(file);
    if (!buildVersion) return name;
    if (!versionSuffix.test(name)) throw new Error(`Installer filename does not contain build version: ${name}`);
    return name.replace(versionSuffix, `-${releaseVersion}$1`);
  });
  if (new Set(names).size !== names.length) {
    throw new Error("Release installer filenames must be unique");
  }
  const staging = mkdtempSync(join(tmpdir(), "luna-release-"));
  try {
    const checksums = [];
    const assets = [];
    for (const [index, file] of files.entries()) {
      const asset = join(staging, names[index]);
      copyFileSync(file, asset);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(asset)) hash.update(chunk);
      checksums.push(`${hash.digest("hex")}  ${names[index]}\n`);
      assets.push(asset);
    }
    // Each matrix job owns its manifest, so concurrent uploads cannot overwrite it.
    const manifest = join(staging, `SHA256SUMS-${platform}`);
    writeFileSync(manifest, checksums.join(""));
    run(["release", "upload", tag, ...assets, manifest, "--repo", repo, "--clobber"]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.RELEASE_TAG;
  if (!repo || !tag) throw new Error("GITHUB_REPOSITORY and RELEASE_TAG are required");
  if (process.argv[2] === "prepare") {
    if (!process.env.GITHUB_SHA) throw new Error("GITHUB_SHA is required");
    const release = prepareRelease(repo, tag, process.env.GITHUB_SHA);
    console.log(`Using release ${release.id}: ${release.html_url}`);
  } else if (process.argv[2] === "upload") {
    await uploadReleaseAssets(repo, tag, process.argv[3], process.argv[4], gh, process.env.BUILD_VERSION);
  } else {
    throw new Error("Expected prepare or upload <installer-directory> <platform>");
  }
}
