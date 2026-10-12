import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import {
  checkSiteCompatibility,
  clientDownloadUrl,
  compareVersions,
  MIN_CORE_VERSION
} from "../src/auth/compatibility.ts";

test("compares patch versions, release candidates, v prefixes, metadata and the stable LTS channel", () => {
  for (const [a, b, expected] of [
    ["5.1.0", "5.1.0", 0],
    ["5.1.1", "5.1.0", 1],
    ["5.1.0", "5.1.1", -1],
    ["5.10.0", "5.2.0", 1],
    ["v5.1.0", "5.1.0", 0],
    ["v5.1.1", "v5.1.0", 1],
    ["v5.1.0-rc1", "v5.1.0", -1],
    ["v5.1.0-lts", "v5.1.0", 0],
    ["5.1.0-rc1", "5.1.0", -1],
    ["5.1.0-lts", "5.1.0", 0],
    ["v5.1.0-lts+build.1", "5.1.0", 0],
    ["5.1.0+build.9", "5.1.0+build.1", 0],
    ["5.1.0-beta-lts", "5.1.0", -1],
    ["5.1.0-1", "5.1.0-alpha", -1],
    ["5.1.0-beta.11", "5.1.0-beta.2", 1],
    ["9007199254740993.0.0", "9007199254740992.0.0", 1]
  ] as const) {
    assert.equal(compareVersions(a, b), expected, `${a} vs ${b}`);
    assert.equal(compareVersions(b, a), expected === 0 ? 0 : -expected);
  }
  const ordered = ["alpha", "alpha.1", "alpha.beta", "beta", "beta.2", "beta.11", "rc.1"];
  for (let i = 1; i < ordered.length; i += 1)
    assert.equal(compareVersions(`5.1.0-${ordered[i - 1]}`, `5.1.0-${ordered[i]}`), -1);
  for (const invalid of [
    "",
    "dev",
    "5.1",
    "5.1.x",
    "05.1.0",
    "5.1.0-01",
    "5.1.0-beta.01",
    "5.1.0_rc1",
    "5.1.0.1",
    510,
    null
  ]) {
    assert.equal(compareVersions(invalid, "5.1.0"), null, String(invalid));
  }
});

const metadata = (core = "v5.1.0", minimum = "v5.1.0") => ({
  schema_version: 1,
  core_version: core,
  min_client_version: minimum
});
const fetchJson =
  (data: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(data), { status });

test("requires both minimums and reports simultaneous failures", async () => {
  assert.equal(MIN_CORE_VERSION, "v5.1.0");
  for (const [client, core, minimum, failures] of [
    ["5.1.0", "5.1.0", "5.1.0", []],
    ["5.1.0", "v5.1.0", "v5.1.0", []],
    ["5.1.0-rc1", "v5.1.0", "v5.1.0", ["client-too-old"]],
    ["5.1.0", "v5.1.0-rc1", "v5.1.0", ["core-too-old"]],
    ["5.1.0", "v5.1.1", "v5.1.1", ["client-too-old"]],
    ["5.1.1", "5.2.0", "5.1.0", []],
    ["5.1.0-rc1", "5.1.0", "5.1.0", ["client-too-old"]],
    ["5.1.0", "5.1.0-rc1", "5.1.0", ["core-too-old"]],
    ["5.1.0", "5.1.0", "5.1.1", ["client-too-old"]],
    ["5.0.9", "5.0.9", "5.1.0", ["client-too-old", "core-too-old"]],
    ["v5.1.0-lts", "v5.1.0-lts", "v5.1.0", []]
  ] as const) {
    const result = await checkSiteCompatibility(
      "https://site.test/prefix/",
      client,
      fetchJson(metadata(core, minimum))
    );
    assert.equal(result.status, failures.length ? "incompatible" : "compatible");
    assert.deepEqual(result.failures, failures);
    assert.equal(result.minCoreVersion, MIN_CORE_VERSION);
  }
});

test("missing, unsupported, malformed and unsuccessful responses remain unknown", async () => {
  for (const data of [
    null,
    [],
    ["5.1.0"],
    {},
    { ...metadata(), schema_version: "1" },
    { ...metadata(), schema_version: 2 },
    { ...metadata(), core_version: "dev" },
    { ...metadata(), min_client_version: 510 },
    { ...metadata(), min_client_version: "5.1" }
  ]) {
    const result = await checkSiteCompatibility("https://site.test", "5.1.0", fetchJson(data));
    assert.equal(result.status, "unknown");
    assert.equal(result.reason, "invalid-response");
    assert.deepEqual(result.failures, []);
  }
  for (const [status, reason] of [
    [404, "endpoint-missing"],
    [401, "http"],
    [403, "http"],
    [500, "http"]
  ] as const) {
    const result = await checkSiteCompatibility("https://site.test", "5.1.0", fetchJson({}, status));
    assert.equal(result.status, "unknown");
    assert.equal(result.reason, reason);
  }
  for (const body of ["<html>login</html>", "{", JSON.stringify({ ...metadata(), padding: "x".repeat(65 * 1024) })]) {
    assert.equal(
      (await checkSiteCompatibility("https://site.test", "5.1.0", async () => new Response(body))).reason,
      "invalid-response"
    );
  }
});

test("timeouts, TLS and network errors are unknown and do not fall back to the old array", async () => {
  for (const [error, reason] of [
    [new DOMException("timeout", "TimeoutError"), "timeout"],
    [new TypeError("fetch failed", { cause: { code: "DEPTH_ZERO_SELF_SIGNED_CERT" } }), "tls"],
    [new Error("net::ERR_CERT_AUTHORITY_INVALID"), "tls"],
    [new Error("net::ERR_PROXY_CONNECTION_FAILED"), "network"],
    [new Error("unreachable"), "network"]
  ] as const) {
    let requests = 0;
    const result = await checkSiteCompatibility("https://site.test", "5.1.0", async () => {
      requests += 1;
      throw error;
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.reason, reason);
    assert.equal(requests, 1);
  }
});

test("validates site and download URLs and preserves a legal deployment prefix", async () => {
  for (const [site, expected] of [
    ["https://private.test", "https://private.test/core/download/"],
    ["https://private.test/team/jumpserver/", "https://private.test/team/jumpserver/core/download/"],
    ["http://127.0.0.1:8080/prefix", "http://127.0.0.1:8080/prefix/core/download/"],
    ["https://[::1]:8080/prefix/", "https://[::1]:8080/prefix/core/download/"]
  ])
    assert.equal(clientDownloadUrl(site), expected);
  for (const invalid of [
    "https://user:secret@site.test",
    "https://site.test/?x=1",
    "https://site.test/?",
    "https://site.test/#",
    "javascript:alert(1)",
    "file:///tmp",
    "//site.test",
    "https://site.test\\@evil.test",
    "https://site.test\n",
    undefined
  ]) {
    assert.throws(() => clientDownloadUrl(invalid));
    const result = await checkSiteCompatibility(invalid, "5.1.0", async () => {
      throw new Error("must not fetch");
    });
    assert.equal(result.reason, "invalid-site");
  }
});

test("uses an anonymous, uncached request to the exact private-site endpoint", async () => {
  const result = await checkSiteCompatibility("https://private.test/team/", "5.1.0", async (url, init) => {
    assert.equal(url, "https://private.test/team/api/v1/settings/client/compatibility/");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "follow");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(init.headers).sort(), ["Accept", "Cache-Control"]);
    return new Response(JSON.stringify(metadata()));
  });
  assert.equal(result.status, "compatible");
});

test("loopback integration: timeout, redirect, legacy Core and updated minimums", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers["x-jms-org"], undefined);
    if (request.url?.startsWith("/timeout/")) return;
    if (request.url?.startsWith("/redirect/")) {
      response.writeHead(302, { Location: "/current/api/v1/settings/client/compatibility/" }).end();
      return;
    }
    if (request.url?.startsWith("/login-redirect/")) {
      response.writeHead(302, { Location: "/login/api/v1/settings/client/compatibility/" }).end();
      return;
    }
    if (request.url?.startsWith("/login/")) {
      response.writeHead(200, { "Content-Type": "text/html" }).end("<html>login</html>");
      return;
    }
    if (request.url?.startsWith("/redirect-loop/")) {
      response.writeHead(302, { Location: request.url }).end();
      return;
    }
    if (request.url?.startsWith("/old/")) {
      response.writeHead(404).end();
      return;
    }
    const minimum = request.url?.startsWith("/new/") ? "v5.1.1" : "v5.1.0";
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(metadata("v5.1.0", minimum)));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await checkSiteCompatibility(site, "5.1.0", fetch)).status, "compatible");
    assert.deepEqual((await checkSiteCompatibility(`${site}/new`, "5.1.0", fetch)).failures, ["client-too-old"]);
    assert.equal((await checkSiteCompatibility(`${site}/old`, "5.1.0", fetch)).reason, "endpoint-missing");
    assert.equal((await checkSiteCompatibility(`${site}/timeout`, "5.1.0", fetch, 30)).reason, "timeout");
    assert.equal((await checkSiteCompatibility(`${site}/redirect`, "5.1.0", fetch)).status, "compatible");
    assert.equal((await checkSiteCompatibility(`${site}/login-redirect`, "5.1.0", fetch)).reason, "invalid-response");
    assert.equal((await checkSiteCompatibility(`${site}/redirect-loop`, "5.1.0", fetch)).status, "unknown");
    assert.ok(requests.every((url) => url.endsWith("/api/v1/settings/client/compatibility/")));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
