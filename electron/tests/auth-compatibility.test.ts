import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { SiteCompatibility } from "../../ui/types/clientCompatibility.ts";
import { checkSiteCompatibility, normalizeCompatibilitySite } from "../src/auth/compatibility.ts";
import { isOAuthCallbackUrl, parseOAuthCallback } from "../src/auth/oauth-callback.ts";
import { isTrustedCertificateHost, parseUrl, siteHostname } from "../src/shared/url.ts";

// Run the real auth service with Electron's app/net/storage adapters replaced.
// This follows the existing auth request tests and never reads real accounts.
const source = readFileSync(new URL("../src/auth/service.ts", import.meta.url), "utf8");
const body = source.slice(source.indexOf("const OAUTH_WELL_KNOWN"));
const script = stripTypeScriptTypes(
  `${body.replace("export class DesktopAuthService", "class DesktopAuthService")}\nnew DesktopAuthService(emitEvent)`
);
const siteA = { sessionKey: "a", origin: "https://a.test", bearerToken: "token-a", orgId: "org-a" };
const payload = (site = "https://b.test") => ({
  status: "success",
  bearer: "token-b",
  resolved_site: site,
  profile: { status: 200, success: true, data: '{"id":"user-b","name":"B"}' },
  current_org: { status: 403, success: false, data: "{}" },
  permission_orgs: { status: 403, success: false, data: "{}" }
});
const compatible = (site: string): SiteCompatibility => ({
  status: "compatible",
  site,
  clientVersion: "5.1.0",
  minCoreVersion: "5.1.0",
  coreVersion: "5.1.0",
  minClientVersion: "5.1.0",
  failures: []
});

function setup(preflight: (site: string) => Promise<SiteCompatibility> = async (site) => compatible(site)) {
  const calls: string[] = [];
  const events: [string, unknown][] = [];
  const auth = runInNewContext(script, {
    app: { getPath: () => "/tmp/compatibility-test", getVersion: () => "5.1.0" },
    path,
    parseUrl,
    siteHostname,
    isTrustedCertificateHost,
    isOAuthCallbackUrl,
    parseOAuthCallback,
    normalizeCompatibilitySite,
    checkSiteCompatibility,
    createHash,
    randomBytes,
    CLIENT_AUTH_CALLBACK: "jms2://auth/callback",
    AbortSignal,
    URLSearchParams,
    Buffer,
    electronLog: { info() {}, warn() {} },
    compactApiErrorBody: (body: string) => body,
    emitEvent: (event: string, data: unknown) => {
      events.push([event, data]);
      if (event === "auth_url") {
        const state = new URL(data as string).searchParams.get("state");
        auth.handleCallback(`jms2://auth/callback?code=test&state=${state}`);
      }
    }
  });
  auth.sessions.set("a", { ...siteA });
  auth.currentSessionKey = "a";
  auth.tokens = { a: { access_token: "token-a", refresh_token: "refresh-a" } };
  auth.trustedHosts.add("a.test");
  auth.checkCompatibility = ({ site }: { site: string }) => {
    calls.push(`check:${site}`);
    return preflight(site);
  };
  auth.startCallbackServer = async () => {
    calls.push("callback-server");
  };
  auth.fetchSite = async () => {
    calls.push("oauth-config");
    return new Response('{"client_id":"test-client"}');
  };
  auth.exchangeToken = async () => {
    calls.push("token-exchange");
    return { access_token: "token-b" };
  };
  auth.freshToken = async () => {
    calls.push("fresh-token");
    return "token-b";
  };
  auth.buildLoginPayload = async (site: string) => {
    calls.push("profile");
    return payload(site);
  };
  auth.persistTokens = async () => {
    calls.push("persist");
  };
  return { auth, calls, events };
}

function snapshot(auth: any) {
  return JSON.stringify({
    key: auth.currentSessionKey,
    sessions: [...auth.sessions],
    tokens: auth.tokens,
    trustedHosts: [...auth.trustedHosts]
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test("both login and restoration stop before any authentication side effect on a failed preflight", async () => {
  for (const status of ["incompatible", "unknown"] as const) {
    for (const method of ["authLogin", "bootstrapAuthSession"]) {
      const { auth, calls, events } = setup(async (site) => ({
        ...compatible(site),
        status,
        failures: status === "incompatible" ? ["client-too-old"] : [],
        reason: status === "unknown" ? "endpoint-missing" : undefined
      }));
      const before = snapshot(auth);
      const result = await auth[method]({
        site: "https://b.test",
        sessionId: "b",
        clientVersion: "999.0.0",
        compatible: true
      });
      assert.equal(result.status, "blocked");
      assert.equal(result.compatibility.status, status);
      assert.equal(snapshot(auth), before);
      assert.deepEqual(calls, ["check:https://b.test"]);
      assert.deepEqual(events, []);
    }
  }
});

test("the probe uses Electron's runtime version and existing site network adapter without changing the active session", async () => {
  const { auth } = setup();
  const before = JSON.parse(snapshot(auth));
  const requests: [string, RequestInit][] = [];
  const actualScript = stripTypeScriptTypes(
    `${body.replace("export class DesktopAuthService", "class DesktopAuthService")}\n` +
      `({ checkCompatibility: DesktopAuthService.prototype.checkCompatibility, fetchSite: DesktopAuthService.prototype.fetchSite })`
  );
  const methods = runInNewContext(actualScript, {
    app: { getVersion: () => "5.1.2-rc1" },
    CLIENT_AUTH_CALLBACK: "callback",
    checkSiteCompatibility,
    net: {
      fetch: async (url: string, init: RequestInit) => {
        requests.push([url, init]);
        return new Response('{"schema_version":1,"core_version":"v5.1.0","min_client_version":"v5.1.0"}');
      }
    }
  });
  auth.fetchSite = methods.fetchSite.bind(auth);
  const result = await methods.checkCompatibility.call(auth, {
    site: "https://b.test",
    clientVersion: "999.0.0"
  });
  assert.equal(result.clientVersion, "5.1.2-rc1");
  assert.equal(result.status, "compatible");
  assert.equal(requests.length, 1);
  const [url, init] = requests[0]!;
  assert.equal(url, "https://b.test/api/v1/settings/client/compatibility/");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "follow");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(Object.keys(init.headers).sort(), ["Accept", "Cache-Control"]);
  assert.equal(snapshot(auth), JSON.stringify({ ...before, trustedHosts: ["a.test", "b.test"] }));
  assert.equal(auth.isTrustedSiteHost("unrelated.test"), false);
});

test("login authenticates after checking and activates only with the main process approval", async () => {
  const { auth, calls } = setup();
  const result = await auth.authLogin({ site: "https://b.test", sessionId: "b" });
  assert.deepEqual(calls, [
    "check:https://b.test",
    "callback-server",
    "oauth-config",
    "token-exchange",
    "profile",
    "persist"
  ]);
  assert.equal(result.status, "success");
  assert.equal(auth.currentSessionKey, "a");
  assert.deepEqual(auth.currentSession(), siteA);
  const args = { sessionKey: "b", origin: "https://b.test", orgId: "org-b", bearerToken: "renderer-forged-token" };
  assert.equal(auth.setSession({ ...args, compatible: true }).status, "stale");
  assert.equal(auth.setSession({ ...args, connectionId: result.connection_id + 1 }).status, "stale");
  assert.equal(
    auth.setSession({ ...args, origin: "https://other.test", connectionId: result.connection_id }).status,
    "stale"
  );
  assert.equal(auth.setSession({ ...args, connectionId: result.connection_id }).status, "success");
  assert.equal(auth.currentSession().bearerToken, "token-b");
  assert.equal(auth.currentSession().orgId, "org-b");
});

test("restoration checks before refreshing credentials and organization 403 does not invalidate authentication", async () => {
  const { auth, calls } = setup();
  const result = await auth.bootstrapAuthSession({ site: "https://b.test", sessionId: "b" });
  assert.deepEqual(calls, ["check:https://b.test", "fresh-token", "profile"]);
  assert.equal(result.status, "success");
  assert.ok(result.connection_id);
  assert.equal(auth.currentSessionKey, "a");
});

test("a failed or malformed profile cannot authorize a session", async () => {
  for (const profile of [
    { status: 401, success: false, data: "{}" },
    { status: 503, success: false, data: "{}" },
    { status: 0, success: false, data: "request failed" },
    { status: 200, success: true, data: "bad" },
    { status: 200, success: true, data: "{}" }
  ]) {
    for (const method of ["authLogin", "bootstrapAuthSession"]) {
      const { auth } = setup();
      const before = snapshot(auth);
      auth.buildLoginPayload = async () => ({ ...payload(), profile });
      const result = await auth[method]({ site: "https://b.test", sessionId: "b" });
      // Login success allows the renderer to close A's workspace; bootstrap keeps
      // transport failures available for its existing network/server retry logic.
      if (method === "authLogin") assert.equal(result.status, "failure");
      else if (!profile.success) assert.equal(result.status, "success");
      assert.equal(result.profile.status, profile.status);
      assert.equal(result.connection_id, undefined);
      assert.equal(auth.pendingConnection, null);
      assert.equal(snapshot(auth), before);
      assert.equal(
        auth.setSession({ sessionKey: "b", origin: "https://b.test", connectionId: auth.connectionGeneration }).status,
        "stale"
      );
    }
  }
});

test("rapid site changes ignore old preflight results and cannot reuse old approvals", async () => {
  const slow = deferred<SiteCompatibility>();
  const { auth, calls } = setup((site) =>
    site === "https://b.test" ? slow.promise : Promise.resolve(compatible(site))
  );
  const first = auth.bootstrapAuthSession({ site: "https://b.test", sessionId: "b" });
  const second = await auth.bootstrapAuthSession({ site: "https://c.test", sessionId: "c" });
  slow.resolve(compatible("https://b.test"));
  assert.equal((await first).status, "stale");
  assert.deepEqual(calls, ["check:https://b.test", "check:https://c.test", "fresh-token", "profile"]);
  assert.equal(auth.pendingConnection.site, "https://c.test");
  assert.equal(
    auth.setSession({ sessionKey: "c", origin: "https://c.test", connectionId: second.connection_id }).status,
    "success"
  );
  const third = await auth.bootstrapAuthSession({ site: "https://b.test", sessionId: "b" });
  auth.cancelAuth();
  assert.equal(
    auth.setSession({ sessionKey: "b", origin: "https://b.test", connectionId: third.connection_id }).status,
    "stale"
  );
  assert.equal(auth.currentSessionKey, "c");
});

test("an obsolete authentication error cannot change a newer connection", async () => {
  const token = deferred<string>();
  const { auth } = setup();
  auth.freshToken = async (_site: string, id: string) => (id === "b" ? token.promise : "token-c");
  const first = auth.bootstrapAuthSession({ site: "https://b.test", sessionId: "b" });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await auth.bootstrapAuthSession({ site: "https://c.test", sessionId: "c" });
  token.reject(new Error("old token error"));
  assert.equal((await first).status, "stale");
  assert.equal(auth.pendingConnection.generation, second.connection_id);
  assert.equal(auth.currentSessionKey, "a");
});
