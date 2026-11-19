import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { zipSync } from "fflate";
import { fetchRelease } from "./upgrade-source.mjs";

const API = "https://api.github.com/repos/apache/guacamole-client";
const ROOT = "guacamole-common-js/src/main/webapp";
const COMMIT = "a".repeat(40);
const TAG = "b".repeat(40);
const RELEASE = "1.6.0";
const ARTIFACT = `https://repo.maven.apache.org/maven2/org/apache/guacamole/guacamole-common-js/${RELEASE}/guacamole-common-js-${RELEASE}.zip`;
const RAW = `https://raw.githubusercontent.com/apache/guacamole-client/${COMMIT}`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blob = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const zip = (entries) => zipSync(entries, { mtime: new Date("2000-01-01T00:00:00Z") });

function fixture({ annotated = true } = {}) {
  const files = new Map([
    [`${ROOT}/common/license.js`, Buffer.from("license header\n")],
    [`${ROOT}/modules/KeyEventInterpreter.js`, Buffer.from("key event interpreter\n")],
    [`${ROOT}/modules/Keyboard.js`, Buffer.from("keyboard\n")],
    ["LICENSE", Buffer.from("upstream license\n")],
    ["NOTICE", Buffer.from("upstream notice\n")]
  ]);
  const ordered = ["common/license.js", "modules/Keyboard.js", "modules/KeyEventInterpreter.js"];
  const allJs = Buffer.concat(
    ordered.flatMap((path, index) =>
      index ? [Buffer.from("\n"), files.get(`${ROOT}/${path}`)] : [files.get(`${ROOT}/${path}`)]
    )
  );
  const entries = {
    "guacamole-common-js/all.js": allJs,
    "guacamole-common-js/all.min.js": Buffer.from("minified"),
    "guacamole-common-js/modules/KeyEventInterpreter.js": files.get(`${ROOT}/modules/KeyEventInterpreter.js`),
    "guacamole-common-js/modules/Keyboard.js": files.get(`${ROOT}/modules/Keyboard.js`)
  };
  const tree = {
    truncated: false,
    tree: [...files].map(([path, bytes]) => ({
      path,
      type: "blob",
      mode: "100644",
      sha: blob(bytes),
      size: bytes.length
    }))
  };
  const responses = new Map([
    [
      `${API}/git/ref/tags/${RELEASE}`,
      { ref: `refs/tags/${RELEASE}`, object: { type: annotated ? "tag" : "commit", sha: annotated ? TAG : COMMIT } }
    ],
    [`${API}/git/tags/${TAG}`, { sha: TAG, object: { type: "commit", sha: COMMIT } }],
    [`${API}/git/trees/${COMMIT}?recursive=1`, tree],
    ...[...files].map(([path, bytes]) => [`${RAW}/${path}`, bytes])
  ]);
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    requests.push(url);
    const response = responses.get(url) ?? (url === ARTIFACT ? zip(entries) : undefined);
    assert.notEqual(response, undefined, `Unexpected request: ${url}`);
    if (response instanceof Response) return response;
    return new Response(response instanceof Uint8Array ? response : JSON.stringify(response));
  };
  return { files, ordered, allJs, entries, tree, responses, requests, fetchImpl };
}

test("pins annotated and lightweight tags and reproduces the official order and provenance", async () => {
  for (const annotated of [true, false]) {
    const f = fixture({ annotated });
    const result = await fetchRelease(RELEASE, f);
    assert.deepEqual(
      result.sources.map(({ path }) => path),
      f.ordered
    );
    assert.deepEqual(
      result.licenses.map(({ path }) => path),
      ["LICENSE", "NOTICE"]
    );
    assert.equal(result.upstream.commit, COMMIT);
    assert.equal(result.upstream.artifact.url, ARTIFACT);
    assert.equal(result.upstream.artifact.sha256, digest(zip(f.entries)));
    assert.equal(result.upstream.artifact.allJsSha256, digest(f.allJs));
    for (const file of [...result.sources, ...result.licenses]) {
      assert.ok(Buffer.isBuffer(file.bytes));
      assert.equal(file.sha256, digest(file.bytes));
      assert.equal(file.gitBlob, blob(file.bytes));
    }
    assert.equal(f.requests.filter((url) => url.includes("/git/tags/")).length, annotated ? 1 : 0);
    assert.equal(f.requests.filter((url) => url.startsWith(RAW)).length, 3);
  }
});

test("rejects non-release input before making requests", async () => {
  let called = false;
  for (const release of ["latest", "v1.6.0", "1.6", "1.6.0-rc1", "01.6.0", "../1.6.0", null]) {
    await assert.rejects(
      fetchRelease(release, {
        fetchImpl() {
          called = true;
        }
      }),
      /numeric major.minor.patch/
    );
  }
  assert.equal(called, false);
});

test("rejects tampered ZIP modules and pinned raw license files", async () => {
  const archive = fixture();
  archive.entries["guacamole-common-js/modules/Keyboard.js"] = Buffer.from("modified keyboard\n");
  await assert.rejects(fetchRelease(RELEASE, archive), /Git blob mismatch: modules\/Keyboard.js/);
  const raw = fixture();
  raw.responses.set(`${RAW}/LICENSE`, Buffer.from("modified license\n"));
  await assert.rejects(fetchRelease(RELEASE, raw), /Git blob mismatch: LICENSE/);
});

test("rejects incomplete trees, unexpected source paths and cyclic tags", async () => {
  const truncated = fixture();
  truncated.tree.truncated = true;
  await assert.rejects(fetchRelease(RELEASE, truncated), /truncated upstream Git tree/);
  const path = fixture();
  path.tree.tree.push({ ...path.tree.tree[1], path: `${ROOT}/modules/nested/Hidden.js` });
  await assert.rejects(fetchRelease(RELEASE, path), /Unexpected upstream JavaScript path/);
  const tag = fixture();
  tag.responses.set(`${API}/git/tags/${TAG}`, { sha: TAG, object: { type: "tag", sha: TAG } });
  await assert.rejects(fetchRelease(RELEASE, tag), /cyclic release tag chain/);
});

test("rejects missing, unsafe, unexpected, and invalid ZIP entries", async () => {
  const cases = [
    [
      (f) => {
        delete f.entries["guacamole-common-js/modules/Keyboard.js"];
      },
      /Missing upstream ZIP entry/
    ],
    [
      (f) => {
        f.entries["guacamole-common-js/../escape.js"] = Buffer.from("escape");
      },
      /Unsafe upstream ZIP path/
    ],
    [
      (f) => {
        f.entries["guacamole-common-js/modules/Extra.js"] = Buffer.from("extra");
      },
      /Unexpected upstream ZIP JavaScript path/
    ],
    [
      (f) => {
        f.responses.set(ARTIFACT, Buffer.from("invalid"));
      },
      /Invalid upstream ZIP archive/
    ]
  ];
  for (const [change, expected] of cases) {
    const f = fixture();
    change(f);
    await assert.rejects(fetchRelease(RELEASE, f), expected);
  }
});

test("rejects changed or ambiguous official assembly", async () => {
  const changed = fixture();
  changed.entries["guacamole-common-js/all.js"] = Buffer.concat([changed.allJs, Buffer.from("\n")]);
  await assert.rejects(fetchRelease(RELEASE, changed), /source assembly differs/);
  const ambiguous = fixture();
  ambiguous.entries["guacamole-common-js/all.js"] = Buffer.concat([
    ambiguous.allJs,
    ambiguous.entries["guacamole-common-js/modules/Keyboard.js"]
  ]);
  await assert.rejects(fetchRelease(RELEASE, ambiguous), /ambiguous module/);
});

test("bounds downloads by headers and streamed bytes and checks ZIP sizes before decompression", async () => {
  const header = fixture();
  header.responses.set(ARTIFACT, new Response("", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }));
  await assert.rejects(fetchRelease(RELEASE, header), /Download exceeds size limit/);
  const streamed = fixture();
  let canceled = false;
  streamed.responses.set(
    `${RAW}/${ROOT}/common/license.js`,
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          canceled = true;
        }
      })
    )
  );
  await assert.rejects(fetchRelease(RELEASE, streamed), /Download exceeds size limit/);
  assert.equal(canceled, true);
  const archive = fixture();
  const bytes = Buffer.from(zip(archive.entries));
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(central, -1);
  bytes.writeUInt32LE(2 * 1024 * 1024 + 1, central + 24);
  archive.responses.set(ARTIFACT, bytes);
  await assert.rejects(fetchRelease(RELEASE, archive), /ZIP entry exceeds size limit/);
});
