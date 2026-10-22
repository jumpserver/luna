import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

const REPOSITORY = "https://github.com/apache/guacamole-client";
const API = "https://api.github.com/repos/apache/guacamole-client";
const SOURCE_ROOT = "guacamole-common-js/src/main/webapp";
const ZIP_ROOT = "guacamole-common-js/";
const MIB = 1024 * 1024;
const MAX_FILE = 2 * MIB;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validSha = (sha) => typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha);
const modulePath = (path) => /^modules\/[A-Za-z0-9]+\.js$/.test(path);

async function download(fetchImpl, url, limit) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
    headers: { "User-Agent": "JumpServer-Guacamole-Upgrader" }
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body.cancel();
    throw new Error(`Download exceeds size limit: ${url}`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(`Download exceeds size limit: ${url}`);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function json(fetchImpl, url, limit = 64 * 1024) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await download(fetchImpl, url, limit)));
}

async function resolveCommit(release, fetchImpl) {
  const ref = await json(fetchImpl, `${API}/git/ref/tags/${release}`);
  if (ref.ref !== `refs/tags/${release}`) throw new Error("Unexpected release tag reference.");
  let object = ref.object;
  const seen = new Set();
  for (let depth = 0; depth <= 8; depth++) {
    if (!object || !validSha(object.sha)) throw new Error("Invalid release Git object.");
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag" || depth === 8 || seen.has(object.sha)) {
      throw new Error("Unsupported or cyclic release tag chain.");
    }
    seen.add(object.sha);
    const tag = await json(fetchImpl, `${API}/git/tags/${object.sha}`);
    if (tag.sha !== object.sha) throw new Error("Release tag object mismatch.");
    object = tag.object;
  }
}

async function sourceTree(commit, fetchImpl) {
  const tree = await json(fetchImpl, `${API}/git/trees/${commit}?recursive=1`, 4 * MIB);
  if (tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error("Incomplete or truncated upstream Git tree.");
  }
  const files = new Map();
  for (const entry of tree.tree) {
    const path = entry.path;
    if (typeof path !== "string") throw new Error("Invalid upstream Git tree path.");
    const source = path.startsWith(`${SOURCE_ROOT}/`) ? path.slice(SOURCE_ROOT.length + 1) : null;
    const needed = path === "LICENSE" || path === "NOTICE" || source === "common/license.js" || modulePath(source);
    if (source?.endsWith(".js") && !needed) throw new Error(`Unexpected upstream JavaScript path: ${path}`);
    if (!needed) continue;
    if (files.has(path) || entry.type !== "blob" || entry.mode !== "100644" || !validSha(entry.sha)) {
      throw new Error(`Invalid or duplicate upstream Git blob: ${path}`);
    }
    if (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > MAX_FILE) {
      throw new Error(`Upstream file exceeds size limit or is empty: ${path}`);
    }
    files.set(path, entry.sha);
  }
  const modules = [...files.keys()].filter((path) => path.startsWith(`${SOURCE_ROOT}/modules/`));
  if (!modules.length || modules.length > 128) throw new Error("Unsupported upstream module count.");
  for (const path of ["LICENSE", "NOTICE", `${SOURCE_ROOT}/common/license.js`]) {
    if (!files.has(path)) throw new Error(`Missing upstream Git blob: ${path}`);
  }
  return files;
}

function unzipSources(archive, expectedModules) {
  // fflate's filter runs before it allocates each decompressed buffer.
  if (archive.length < 22) throw new Error("Invalid upstream ZIP archive.");
  const seen = new Set();
  let decompressedSize = 0;
  const files = unzipSync(archive, {
    filter({ name, size, originalSize, compression }) {
      if (seen.has(name) || seen.size >= 256) throw new Error("Duplicate ZIP entry or too many ZIP entries.");
      seen.add(name);
      if (
        name.includes("\\") ||
        name.includes("\0") ||
        name.startsWith("/") ||
        name.includes(":") ||
        name.split("/").some((part) => part === "." || part === "..") ||
        !name.startsWith(ZIP_ROOT)
      )
        throw new Error(`Unsafe upstream ZIP path: ${name}`);
      if (
        ![size, originalSize].every((value) => Number.isSafeInteger(value) && value >= 0) ||
        originalSize > MAX_FILE ||
        size > 8 * MIB
      ) {
        throw new Error(`ZIP entry exceeds size limit: ${name}`);
      }
      const path = name.slice(ZIP_ROOT.length);
      if (name.endsWith("/")) {
        if (originalSize !== 0) throw new Error(`Nonempty ZIP directory: ${name}`);
        return false;
      }
      if (path.endsWith(".js") && path !== "all.js" && path !== "all.min.js" && !expectedModules.has(path)) {
        throw new Error(`Unexpected upstream ZIP JavaScript path: ${name}`);
      }
      const selected = path === "all.js" || expectedModules.has(path);
      if (selected) {
        decompressedSize += originalSize;
        if (
          !originalSize ||
          decompressedSize > 16 * MIB ||
          (compression !== 0 && compression !== 8) ||
          (compression === 0 && size !== originalSize)
        ) {
          throw new Error(`Unsupported ZIP entry or decompressed size limit: ${name}`);
        }
      }
      return selected;
    }
  });
  for (const path of ["all.js", "all.min.js", ...expectedModules]) {
    if (!seen.has(`${ZIP_ROOT}${path}`)) throw new Error(`Missing upstream ZIP entry: ${path}`);
  }
  return files;
}

function verified(path, bytes, gitBlob) {
  const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (actual !== gitBlob) throw new Error(`Git blob mismatch: ${path}`);
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { path, bytes, sha256: sha256(bytes), gitBlob };
}

/** Download and verify an official release in memory. This function never writes files. */
export async function fetchRelease(release, { fetchImpl = globalThis.fetch } = {}) {
  if (
    typeof release !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release) ||
    release.length > 32
  ) {
    throw new Error("Release must be a numeric major.minor.patch version, for example 1.6.0.");
  }
  const commit = await resolveCommit(release, fetchImpl);
  const tree = await sourceTree(commit, fetchImpl);
  const modules = new Set(
    [...tree.keys()]
      .filter((path) => path.startsWith(`${SOURCE_ROOT}/modules/`))
      .map((path) => path.slice(SOURCE_ROOT.length + 1))
  );
  const url = `https://repo.maven.apache.org/maven2/org/apache/guacamole/guacamole-common-js/${release}/guacamole-common-js-${release}.zip`;
  const archive = await download(fetchImpl, url, 8 * MIB);
  const unzipped = unzipSources(archive, modules);
  const allJs = Buffer.from(unzipped[`${ZIP_ROOT}all.js`]);
  const sources = [];
  for (const path of modules) {
    sources.push(verified(path, Buffer.from(unzipped[`${ZIP_ROOT}${path}`]), tree.get(`${SOURCE_ROOT}/${path}`)));
  }
  // Maven's module ordering is not necessarily a bytewise filename sort. Recover it
  // from the published assembly, then require an exact reconstruction below.
  const positions = new Map();
  for (const source of sources) {
    const position = allJs.indexOf(source.bytes);
    if (position < 0 || allJs.indexOf(source.bytes, position + 1) >= 0) {
      throw new Error(`Missing or ambiguous module in official all.js: ${source.path}`);
    }
    positions.set(source.path, position);
  }
  sources.sort((left, right) => positions.get(left.path) - positions.get(right.path));
  const raw = async (path, outputPath = path) =>
    verified(
      outputPath,
      await download(
        fetchImpl,
        `https://raw.githubusercontent.com/apache/guacamole-client/${commit}/${path}`,
        MAX_FILE
      ),
      tree.get(path)
    );
  sources.unshift(await raw(`${SOURCE_ROOT}/common/license.js`, "common/license.js"));
  const reconstructed = Buffer.concat(
    sources.flatMap((source, index) => (index ? [Buffer.from("\n"), source.bytes] : [source.bytes]))
  );
  if (!allJs.equals(reconstructed)) throw new Error("Upstream source assembly differs from official all.js.");
  const licenses = [];
  for (const path of ["LICENSE", "NOTICE"]) licenses.push(await raw(path));
  return {
    upstream: {
      repository: REPOSITORY,
      release,
      commit,
      sourceRoot: SOURCE_ROOT,
      artifact: { url, sha256: sha256(archive), allJsSha256: sha256(allJs) }
    },
    sources,
    licenses
  };
}
