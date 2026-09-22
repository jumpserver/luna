import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parseUrl } from "../src/shared/url.ts";

// Exercise request paths without starting Electron, like the auth-language checks.
const source = readFileSync(new URL("../src/auth/service.ts", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function endpoint("), source.indexOf("function base64Url("));
const methods = source.slice(source.indexOf("  async apiRequest("), source.indexOf("  async logout("));
const exchangeTokenMethod = source.slice(
  source.indexOf("  async exchangeToken("),
  source.indexOf("  async freshToken(")
);
const freshTokenMethod = source.slice(
  source.indexOf("  async freshToken("),
  source.indexOf("  async bootstrapAuthSession(")
);
const script = stripTypeScriptTypes(`${helpers}\nnew (class { ${methods} })()`);
const exchangeTokenScript = stripTypeScriptTypes(`${helpers}\nnew (class { ${exchangeTokenMethod} })()`);
const freshTokenScript = stripTypeScriptTypes(`new (class { ${freshTokenMethod} })()`);

function setup(env: Record<string, string> = {}, origin = "https://jumpserver.test", responseStatus = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  const session = { origin, sessionKey: "site", bearerToken: "test-token", orgId: "test-org" };
  const auth = runInNewContext(script, {
    process: { env },
    parseUrl,
    URL,
    AbortSignal,
    TextDecoder,
    electronLog: { warn() {}, info() {} }
  });
  Object.assign(auth, {
    currentSession: () => session,
    freshToken: async () => session.bearerToken,
    fetchSite: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response("{}", { status: responseStatus });
    }
  });
  return { auth, requests, session };
}

function setupFreshToken(exchangeToken: () => Promise<Record<string, unknown>>) {
  const auth = runInNewContext(freshTokenScript, { electronLog: { warn() {} } });
  const events: unknown[][] = [];
  let persistCount = 0;
  Object.assign(auth, {
    tokens: {
      account: {
        access_token: "expired-access",
        refresh_token: "refresh-1",
        client_id: "client-1",
        expires_at: 1
      }
    },
    refreshingTokens: new Map(),
    exchangeToken,
    emitEvent: (...args: unknown[]) => events.push(args),
    persistTokens: async () => {
      persistCount += 1;
    }
  });
  return { auth, events, persisted: () => persistCount };
}

function oauthError(code: string) {
  return Object.assign(new Error(`oauth ${code}`), { oauthError: code });
}

test("token exchange times out and classifies only the structured OAuth error code", async () => {
  const timeoutCalls: number[] = [];
  const timeoutSignal = {};
  const auth = runInNewContext(exchangeTokenScript, {
    AbortSignal: {
      timeout: (milliseconds: number) => {
        timeoutCalls.push(milliseconds);
        return timeoutSignal;
      }
    },
    compactApiErrorBody: (text: string) => text,
    OAUTH_TOKEN: "/token/",
    URLSearchParams
  });
  for (const [body, expected] of [
    [{ error: "invalid_grant", error_description: "expired" }, "invalid_grant"],
    [{ error: "server_error", error_description: "mentions invalid_grant" }, "server_error"],
    [{ error_description: "invalid_grant" }, ""]
  ] as const) {
    auth.fetchSite = async (_url: string, init: RequestInit) => {
      assert.equal(init.signal, timeoutSignal);
      return new Response(JSON.stringify(body), { status: 400 });
    };
    await assert.rejects(
      auth.exchangeToken("https://jumpserver.test", { grant_type: "refresh_token" }),
      (error: any) => {
        assert.equal(error.oauthError, expected);
        return true;
      }
    );
  }
  assert.deepEqual(timeoutCalls, [30_000, 30_000, 30_000]);
});

test("expired token requests share one refresh exchange", async () => {
  let exchangeCount = 0;
  let resolveExchange!: (token: Record<string, unknown>) => void;
  const exchange = new Promise<Record<string, unknown>>((resolve) => {
    resolveExchange = resolve;
  });
  const { auth, persisted } = setupFreshToken(async () => {
    exchangeCount += 1;
    return exchange;
  });

  const first = auth.freshToken("https://jumpserver.test", "account");
  const second = auth.freshToken("https://jumpserver.test", "account");
  resolveExchange({ access_token: "access-2", refresh_token: "refresh-2", expires_at: 2_000_000_000 });

  assert.deepEqual(await Promise.all([first, second]), ["access-2", "access-2"]);
  assert.equal(exchangeCount, 1);
  assert.equal(persisted(), 1);
  assert.equal(auth.tokens.account.refresh_token, "refresh-2");
  assert.equal(auth.refreshingTokens.size, 0);
});

test("shared invalid refresh emits one account-scoped expiration event", async () => {
  let rejectExchange!: (error: Error) => void;
  const exchange = new Promise<Record<string, unknown>>((_resolve, reject) => {
    rejectExchange = reject;
  });
  const { auth, events, persisted } = setupFreshToken(async () => exchange);

  const first = auth.freshToken("https://jumpserver.test", "account");
  const second = auth.freshToken("https://jumpserver.test", "account");
  rejectExchange(oauthError("invalid_grant"));

  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.equal(auth.tokens.account, undefined);
  assert.equal(persisted(), 1);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "auth-session-expired");
  assert.equal((events[0][1] as { sessionId?: string }).sessionId, "account");
  assert.equal(events[0][2], "main");
  assert.equal(auth.refreshingTokens.size, 0);
});

test("stale invalid refresh cannot clear a newer token generation", async () => {
  let rejectExchange!: (error: Error) => void;
  const exchange = new Promise<Record<string, unknown>>((_resolve, reject) => {
    rejectExchange = reject;
  });
  const { auth, events, persisted } = setupFreshToken(async () => exchange);
  const request = auth.freshToken("https://jumpserver.test", "account");
  const replacement = {
    access_token: "new-login-access",
    refresh_token: "new-login-refresh",
    client_id: "client-1",
    expires_at: 2_000_000_000
  };
  auth.tokens.account = replacement;
  rejectExchange(oauthError("invalid_grant"));

  await assert.rejects(request, /invalid_grant/);
  assert.equal(auth.tokens.account, replacement);
  assert.equal(persisted(), 0);
  assert.deepEqual(events, []);
});

test("failed token refreshes do not block a later refresh attempt", async () => {
  let exchangeCount = 0;
  const { auth } = setupFreshToken(async () => {
    exchangeCount += 1;
    if (exchangeCount === 1) throw new Error("temporary failure");
    return { access_token: "access-2", refresh_token: "refresh-2", expires_at: 2_000_000_000 };
  });

  await assert.rejects(auth.freshToken("https://jumpserver.test", "account"), /temporary failure/);
  await assert.doesNotReject(auth.freshToken("https://jumpserver.test", "account"));
  assert.equal(exchangeCount, 2);
});

test("Koko tickets bind to the token organization without changing the selected organization", async () => {
  for (const orgId of ["asset-org", undefined]) {
    const { auth, requests, session } = setup({}, "https://jumpserver.test", 201);
    session.orgId = "00000000-0000-0000-0000-000000000000";
    await auth.createKokoConnectTicket({ baseUrl: "https://koko.test/site/", tokenId: "token-id", orgId });
    const { url, init } = requests[0];
    assert.equal(url, "https://koko.test/site/koko/api/connect-ticket/");
    assert.equal(init.headers["Authorization"], "Bearer test-token");
    assert.equal(init.headers["X-JMS-ORG"], orgId || session.orgId);
    assert.deepEqual(JSON.parse(String(init.body)), { token_id: "token-id", org_id: orgId || session.orgId });
    assert.equal(session.orgId, "00000000-0000-0000-0000-000000000000");
  }
});

for (const method of ["apiRequest", "apiStreamRequest"]) {
  const request = { method: "GET", service: "kael", path: "/kael/api/v1/bootstrap" };

  test(`${method}: development renderer does not override the selected Kael site`, async () => {
    const { auth, requests, session } = setup({
      JMS_ELECTRON_DEV: "1",
      JMS_ELECTRON_RENDERER_URL: "http://127.0.0.1:3000/luna/"
    });
    for (const origin of ["https://jumpserver.test", "https://other.test/prefix/", "http://localhost:8888"]) {
      session.origin = origin;
      await auth[method](request);
      const { url, init } = requests.at(-1)!;
      assert.equal(url, `${origin.replace(/\/+$/, "")}${request.path}`);
      assert.equal(init.headers["Authorization"], "Bearer test-token");
      assert.equal(init.headers["X-JMS-ORG"], "test-org");
    }
  });

  test(`${method}: defaults to the selected site in production and local development`, async () => {
    for (const env of [{}, { JMS_ELECTRON_DEV: "1" }]) {
      const { auth, requests } = setup(env, "http://localhost:8888");
      await auth[method](request);
      assert.equal(requests[0].url, `http://localhost:8888${request.path}`);
    }
  });

  test(`${method}: explicit Kael overrides remain supported and leave Core on the selected site`, async () => {
    for (const desktopOverride of ["", "https://kael.test/prefix/"]) {
      const { auth, requests } = setup({
        JMS_KAEL_DEV_URL: "http://localhost:8083",
        JMS_KAEL_DESKTOP_URL: desktopOverride
      });
      await auth[method](request);
      assert.equal(
        requests[0].url,
        `${(desktopOverride || "http://localhost:8083").replace(/\/+$/, "")}${request.path}`
      );
      await auth[method]({ ...request, service: "core", path: "/api/v1/users/profile/" });
      assert.equal(requests[1].url, "https://jumpserver.test/api/v1/users/profile/");
    }
  });

  test(`${method}: invalid Kael overrides fail before sending credentials`, async () => {
    for (const url of ["file:///tmp/kael", "https://user:password@kael.test", "invalid-url"]) {
      const { auth, requests } = setup({ JMS_KAEL_DESKTOP_URL: url });
      await assert.rejects(auth[method](request), /Kael endpoint|Invalid URL/);
      assert.equal(requests.length, 0);
    }
  });
}
