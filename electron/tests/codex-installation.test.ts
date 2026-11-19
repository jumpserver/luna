import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { pack } from "tar-stream";
import { CodexInstallation, unpackCodex } from "../src/codex/installation";

test("managed Codex is opt-in and rejects an unverified download", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "luna-codex-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let downloads = 0;
  const installer = new CodexInstallation(root, async () => {
    downloads++;
    return new Response("corrupt archive");
  });
  assert.equal((await installer.status()).installed, false);
  assert.equal(downloads, 0);
  await assert.rejects(installer.executable(), /Install the Codex engine/);
  await assert.rejects(installer.install(), /checksum mismatch/);
  assert.equal((await installer.status()).installed, false);
});

test("native archives preserve the runtime layout and cannot escape the installation directory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "luna-codex-archive-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = path.join(root, "runtime.tgz");
  const triple = "aarch64-apple-darwin";
  async function writeArchive(name: string) {
    const tar = pack();
    const writing = pipeline(tar, createGzip(), createWriteStream(archive));
    tar.entry({ name }, "runtime");
    tar.finalize();
    await writing;
  }
  const member = `package/vendor/${triple}/bin/codex`;
  await writeArchive(member);
  await unpackCodex(archive, path.join(root, "installed"), triple);
  assert.equal(await readFile(path.join(root, "installed", member.slice(8)), "utf8"), "runtime");
  await writeArchive(`package/vendor/${triple}/../../outside`);
  await assert.rejects(unpackCodex(archive, path.join(root, "unsafe"), triple), /archive path/);
});
