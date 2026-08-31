import type { Server } from "node:http";
import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { pack as createTarPack } from "tar-stream";
import { OfflineRecordingStore } from "../src/replay/offline-recordings.ts";
import { requestWebProxyControl } from "../src/web-proxy/control.ts";
import {
  createCredentialSession,
  normalizedWebOrigin,
  releaseCredentials,
  validateWebSelector
} from "../src/web-proxy/credentials.ts";
import { signaturesDiffer } from "../src/web-proxy/recording.ts";

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  return address.port;
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("validates Web Proxy trust-boundary values", () => {
  assert.equal(normalizedWebOrigin("HTTPS://Example.com:443/login"), "https://example.com");
  assert.equal(validateWebSelector("css=input[type=password]"), "css=input[type=password]");
  assert.throws(() => validateWebSelector("javascript=alert(1)"));
  assert.throws(() => normalizedWebOrigin("file:///etc/passwd"));
});

test("decrypts the Koko-compatible one-time credential envelope", async () => {
  const { privateKey: serverPrivateKey, publicKey: serverPublicKey } = generateKeyPairSync("x25519");
  let clientPublicKey: ReturnType<typeof createPublicKey> | undefined;
  let requestCount = 0;
  let proxyUrl = "";
  const server = createServer((request, response) => {
    requestCount += 1;
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      assert.equal(
        request.url,
        `${proxyUrl}${requestCount === 1 ? "/_jumpserver/web-sessions/" : "/_jumpserver/web-sessions/session-id/credentials"}`
      );
      const body = Buffer.concat(chunks).toString("utf8");
      if (requestCount === 1) {
        const payload = JSON.parse(body);
        clientPublicKey = createPublicKey({
          key: Buffer.from(payload.client_public_key, "base64"),
          type: "spki",
          format: "der"
        });
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            id: "session-id",
            access_token: "once",
            target_url: "https://example.com/login",
            origin: "https://example.com",
            autofill_available: true,
            username_selector: "id=username",
            password_selector: "id=password",
            submit_selector: "id=submit",
            server_public_key: serverPublicKey.export({ type: "spki", format: "der" }).toString("base64")
          })
        );
        return;
      }

      assert.equal(request.headers.authorization, "Bearer once");
      assert.ok(clientPublicKey);
      const sharedSecret = diffieHellman({ privateKey: serverPrivateKey, publicKey: clientPublicKey });
      const key = Buffer.from(
        hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from("jumpserver-web-autofill-v1"), 32)
      );
      const nonce = Buffer.alloc(12, 3);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from("session-id\nhttps://example.com"));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({ username: "managed-user", password: "managed-password" })),
        cipher.final(),
        cipher.getAuthTag()
      ]);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64") }));
    });
  });
  const port = await listen(server);
  proxyUrl = `http://127.0.0.1:${port}`;

  try {
    const session = await createCredentialSession(proxyUrl, "https://example.com/login", "token-id", "token-value");
    const credentials = await releaseCredentials(session, "https://example.com/login");
    assert.deepEqual(credentials, { username: "managed-user", password: "managed-password" });
    assert.equal(session.accessToken, "");
  } finally {
    await close(server);
  }
});

test("supports empty control responses returned through the Web Proxy", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const port = await listen(server);
  try {
    const response = await requestWebProxyControl(
      `http://127.0.0.1:${port}`,
      "/_jumpserver/web-recordings/session-id",
      { method: "DELETE" }
    );
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  } finally {
    await close(server);
  }
});

test("filters similar recording frames while retaining meaningful changes", () => {
  const previous = Buffer.alloc(160 * 90, 128);
  const tinyChange = Buffer.from(previous);
  tinyChange.fill(255, 0, 30);
  const meaningfulChange = Buffer.from(previous);
  meaningfulChange.fill(255, 0, 120);
  assert.equal(signaturesDiffer(previous, previous), false);
  assert.equal(signaturesDiffer(previous, tinyChange), false);
  assert.equal(signaturesDiffer(previous, meaningfulChange), true);
});

test("imports replay archives into scoped, decompressed offline entries", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jms-electron-offline-"));
  const storageRoot = path.join(temporaryRoot, "storage");
  const archivePath = path.join(temporaryRoot, "session.replay.tar");
  const pack = createTarPack();
  const chunks = [];
  pack.on("data", (chunk) => chunks.push(chunk));
  const packed = new Promise((resolve, reject) => {
    pack.on("end", resolve);
    pack.on("error", reject);
  });
  pack.entry(
    { name: "metadata/session.replay.json" },
    JSON.stringify({
      id: "session-id",
      user: "operator",
      files: [
        { name: "session.0.part.gz", start: 100, end: 200, duration: 100 },
        { name: "session.1.part.gz", start: 200, end: 400, duration: 200 }
      ]
    })
  );
  pack.entry({ name: "nested/session.1.part.gz" }, gzipSync("second-frame"));
  pack.entry({ name: "nested/session.0.part.gz" }, gzipSync("first-frame"));
  pack.finalize();
  await packed;
  await writeFile(archivePath, Buffer.concat(chunks));

  try {
    const store = new OfflineRecordingStore(storageRoot);
    await store.initialize();
    const manifest = await store.importRecording(archivePath);
    assert.equal(manifest.label, "session");
    assert.equal(manifest.metadata.source_id, "session-id");
    assert.equal(manifest.entries.length, 2);
    assert.deepEqual(
      manifest.entries.map((entry) => [entry.source_name, entry.part_index, entry.part_total, entry.start_ms]),
      [
        ["session.0.part.gz", 0, 2, 100],
        ["session.1.part.gz", 1, 2, 200]
      ]
    );
    const firstPath = await store.resolveEntry(manifest.recording_id, manifest.entries[0].entry_id);
    assert.equal(await readFile(firstPath, "utf8"), "first-frame");
    await assert.rejects(() => store.resolveEntry("../escape", "entry-00000000"));
    await store.removeRecording(manifest.recording_id);
    await assert.rejects(() => store.resolveEntry(manifest.recording_id, manifest.entries[0].entry_id));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
