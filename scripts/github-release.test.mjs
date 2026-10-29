import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { prepareRelease, uploadReleaseAssets } from "./github-release.mjs";

const repo = "jumpserver/luna";
const tag = "client-v5.1.0";

function releaseApi(pages) {
  const calls = [];
  const run = (args, body) => {
    calls.push({ args, body });
    return body ? JSON.stringify({ id: 123, ...body }) : pages.map((page) => JSON.stringify(page)).join("\n");
  };
  return { calls, run };
}

test("reuses a published release across pages without changing it or its duplicate draft", () => {
  const published = { id: 2, tag_name: tag, draft: false, prerelease: false };
  const api = releaseApi([[{ id: 1, tag_name: tag, draft: true }], [published]]);
  assert.deepEqual(prepareRelease(repo, tag, "commit", api.run), published);
  assert.equal(api.calls.length, 1);
  assert.ok(api.calls[0].args.includes("--paginate"));
});

test("removes only the reused release's legacy combined checksums before rebuilding", () => {
  for (const draft of [false, true]) {
    const release = {
      id: 2,
      tag_name: tag,
      draft,
      assets: [
        { id: 3, name: "SHA256SUMS" },
        { id: 4, name: "SHA256SUMS-Windows-x64" },
        { id: 5, name: "JumpServer-5.1.0-Setup.exe" }
      ]
    };
    const api = releaseApi([[release]]);
    prepareRelease(repo, tag, "commit", api.run);
    assert.deepEqual(api.calls[1], {
      args: ["api", `repos/${repo}/releases/assets/3`, "--method", "DELETE"],
      body: undefined
    });
    assert.equal(api.calls.length, draft ? 3 : 2);
    if (draft) assert.equal(api.calls[2].args[3], "PATCH");
  }
});

test("does not continue preparing a release if legacy checksum cleanup fails", () => {
  const api = releaseApi([[{ id: 2, tag_name: tag, draft: true, assets: [{ id: 3, name: "SHA256SUMS" }] }]]);
  assert.throws(
    () =>
      prepareRelease(repo, tag, "commit", (args, body) => {
        if (args.includes("DELETE")) throw new Error("Cleanup failed");
        return api.run(args, body);
      }),
    /Cleanup failed/
  );
  assert.equal(api.calls.length, 1);
});

test("publishes an existing draft by ID instead of creating a duplicate", () => {
  const api = releaseApi([[{ id: 7, tag_name: tag, draft: true }]]);
  prepareRelease(repo, tag, "commit", api.run);
  assert.deepEqual(api.calls[1], {
    args: ["api", `repos/${repo}/releases/7`, "--method", "PATCH", "--input", "-"],
    body: { draft: false, prerelease: true, make_latest: "false" }
  });
});

test("creates a prerelease for the requested commit only when absent", () => {
  const api = releaseApi([[{ id: 7, tag_name: "weblite-v5.1.0", draft: false }]]);
  prepareRelease(repo, tag, "commit", api.run);
  assert.deepEqual(api.calls[1].body, {
    tag_name: tag,
    target_commitish: "commit",
    name: tag,
    draft: false,
    prerelease: true,
    make_latest: "false"
  });
  assert.ok(api.calls[1].args.includes("POST"));
});

test("does not publish ambiguous drafts or create releases after an API failure", () => {
  const api = releaseApi([
    [
      { tag_name: tag, draft: true },
      { tag_name: tag, draft: true }
    ]
  ]);
  assert.throws(() => prepareRelease(repo, tag, "commit", api.run), /Multiple draft/);
  assert.equal(api.calls.length, 1);
  assert.throws(
    () =>
      prepareRelease(repo, tag, "commit", () => {
        throw new Error("Network failure");
      }),
    /Network failure/
  );
});

function installers(context) {
  const root = mkdtempSync(join(tmpdir(), "luna-release-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "wix", "x64"), { recursive: true });
  writeFileSync(join(root, "wix", "x64", "Custom Client.msi"), "installer");
  writeFileSync(join(root, "ignored.zip"), "ignored");
  return root;
}

test("uploads flat installers with matching platform checksums and overwrites existing assets", async (context) => {
  const root = installers(context);
  const manifests = [];
  for (const platform of ["Windows-x64", "macOS-x64"]) {
    let uploaded;
    await uploadReleaseAssets(repo, tag, root, platform, (args) => {
      assert.deepEqual(args.slice(0, 3), ["release", "upload", tag]);
      assert.deepEqual(args.slice(-3), ["--repo", repo, "--clobber"]);
      const files = args.slice(3, -3);
      assert.deepEqual(
        files.map((file) => basename(file)),
        ["Custom Client.msi", `SHA256SUMS-${platform}`]
      );
      const digest = createHash("sha256").update(readFileSync(files[0])).digest("hex");
      assert.equal(readFileSync(files[1], "utf8"), `${digest}  Custom Client.msi\n`);
      manifests.push(basename(files[1]));
      uploaded = files[0];
    });
    assert.ok(!existsSync(uploaded));
  }
  assert.equal(new Set(manifests).size, 2);
});

test("rejects missing or colliding installers before uploading", async (context) => {
  const root = installers(context);
  const unexpectedUpload = () => assert.fail("Must not upload");
  await assert.rejects(
    uploadReleaseAssets(repo, tag, join(root, "wix"), "../bad", unexpectedUpload),
    /Invalid release platform/
  );
  mkdirSync(join(root, "empty"));
  await assert.rejects(
    uploadReleaseAssets(repo, tag, join(root, "empty"), "Linux-x64", unexpectedUpload),
    /No installers/
  );
  writeFileSync(join(root, "Custom Client.msi"), "different");
  await assert.rejects(uploadReleaseAssets(repo, tag, root, "Windows-x64", unexpectedUpload), /must be unique/);
});

test("repeat builds overwrite the same base-version assets with fresh checksums", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "luna-rebuild-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const published = new Map();
  for (const version of ["5.1.0-build1", "5.1.0-beta.2+sha.abc"]) {
    const installers = join(root, version);
    mkdirSync(installers);
    const names = [
      `JumpServer-${version}-Setup.exe`,
      `JumpServer-${version}.msi`,
      `JumpServer-${version}-arm64.dmg`,
      `JumpServer-${version}-x64.dmg`,
      `Custom-5.1.0-build1-Client-${version}-x64.deb`,
      `JumpServer-${version}-arm64.rpm`,
      `JumpServer-WebLite-${version}-x64.msi`
    ];
    for (const name of names) writeFileSync(join(installers, name), version);
    await uploadReleaseAssets(
      repo,
      tag,
      installers,
      "Windows-x64",
      (args) => {
        assert.equal(args[2], "client-v5.1.0");
        assert.ok(args.includes("--clobber"));
        for (const asset of args.slice(3, -3)) published.set(basename(asset), readFileSync(asset, "utf8"));
      },
      version
    );
    const digest = createHash("sha256").update(version).digest("hex");
    assert.equal(published.size, 8);
    assert.equal(published.get("JumpServer-5.1.0-Setup.exe"), version);
    assert.equal(published.get("JumpServer-5.1.0.msi"), version);
    assert.equal(published.get("JumpServer-5.1.0-x64.dmg"), version);
    assert.equal(published.get("JumpServer-5.1.0-arm64.dmg"), version);
    assert.equal(published.get("JumpServer-5.1.0-arm64.rpm"), version);
    assert.equal(published.get("Custom-5.1.0-build1-Client-5.1.0-x64.deb"), version);
    assert.equal(published.get("JumpServer-WebLite-5.1.0-x64.msi"), version);
    assert.match(published.get("SHA256SUMS-Windows-x64"), new RegExp(`${digest}  JumpServer-5\\.1\\.0-Setup\\.exe`));
  }
});

test("WebLite suffix builds upload to the base WebLite release", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "luna-weblite-release-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "JumpServer-WebLite-5.1.0-build2-x64.msi"), "installer");
  await uploadReleaseAssets(
    repo,
    "weblite-v5.1.0",
    root,
    "Windows-x64",
    (args) => {
      assert.equal(args[2], "weblite-v5.1.0");
      assert.equal(basename(args[3]), "JumpServer-WebLite-5.1.0-x64.msi");
    },
    "5.1.0-build2"
  );
});

test("does not upload installers with an unexpected version", async (context) => {
  const root = installers(context);
  await assert.rejects(
    uploadReleaseAssets(repo, tag, root, "Windows-x64", () => assert.fail("Must not upload"), "5.1.0-build2"),
    /does not contain build version/
  );
});

test("upload failures propagate and clean temporary files", async (context) => {
  const root = installers(context);
  let uploaded;
  await assert.rejects(
    uploadReleaseAssets(repo, tag, root, "Windows-x64", (args) => {
      uploaded = args[3];
      throw new Error("Upload failed");
    }),
    /Upload failed/
  );
  assert.ok(!existsSync(uploaded));
});
