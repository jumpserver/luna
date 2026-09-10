import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { runInNewContext } from "node:vm";

// Exercise the service method without starting Electron, like the web-proxy checks.
const source = readFileSync(new URL("../src/auth/service.ts", import.meta.url), "utf8");
const method = source.slice(source.indexOf("  async syncBackendLanguage("), source.indexOf("  async authLogin("));
const service = runInNewContext(`({ ${method} })`, {
  AbortSignal,
  endpoint: (site: string, path: string) => `${site.replace(/\/+$/, "")}${path}`
});

function setup(status = 302) {
  return {
    ...service,
    currentSessionKey: "account",
    sessions: new Map([["account", { origin: "https://jumpserver.test/site/" }]]),
    fetchSite: mock.fn(async () => new Response("<!DOCTYPE html>", { status }))
  };
}

test("language synchronization accepts the cookie redirect without following it or parsing HTML", async () => {
  for (const status of [302, 200]) {
    const auth = setup(status);
    await auth.syncBackendLanguage({ language: "zh-hans" });
    const [url, options] = auth.fetchSite.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "https://jumpserver.test/site/core/i18n/zh-hans/");
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("first launch without a selected site skips backend language synchronization", async () => {
  const auth = setup();
  auth.sessions.clear();
  await auth.syncBackendLanguage({ language: "en" });
  assert.equal(auth.fetchSite.mock.callCount(), 0);
});

test("language synchronization rejects invalid paths and backend failures", async () => {
  const auth = setup(500);
  for (const language of [undefined, "", "../logout", "en/?next=https://other.test"]) {
    await assert.rejects(auth.syncBackendLanguage({ language }), /Invalid language code/);
  }
  assert.equal(auth.fetchSite.mock.callCount(), 0);
  await assert.rejects(auth.syncBackendLanguage({ language: "en" }), /status=500/);
});
