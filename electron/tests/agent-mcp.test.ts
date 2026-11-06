import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { createMcpBridge } from "../src/agents/mcp.ts";
import type { McpBridge, McpBridgeOptions } from "../src/agents/mcp.ts";

// Real loopback HTTP fixtures model the checked Core OAuth and Koko MCP contracts.
// They do not connect to a running JumpServer deployment or execute an asset command.
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function fixture(t: TestContext) {
  const storageDir = await mkdtemp(join(tmpdir(), "luna-mcp-test-"));
  const key = randomBytes(32);
  const encrypt = (plain: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const bytes = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  };
  const decrypt = (bytes: Buffer) => {
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
  };
  const state = {
    dcr: true,
    resourceMismatch: false,
    foreignTokenEndpoint: false,
    foreignIssuer: false,
    foreignIdentityEndpoint: false,
    subject: "fixture-user-id",
    registrations: 0,
    authorizations: 0,
    refreshes: 0,
    dispatches: 0,
    refused: 0,
    writes: 0,
    access: "fixture-access-0",
    refresh: "fixture-refresh-0",
    refreshError: "",
    mode: "json" as "json" | "sse" | "failure" | "disconnect" | "redirect",
    redirectVisits: 0,
    callback: "",
    receivedHeaders: {} as IncomingMessage["headers"],
    receivedBody: "",
    injectedFetches: 0
  };
  const clients = new Map<string, string>();
  const codes = new Map<string, { challenge: string; client: string; redirect: string }>();
  const errors: unknown[] = [];
  let coreOrigin: string, resource: string;
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  };
  const serve = (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) =>
    createServer((req, res) => {
      void handler(req, res).catch((error) => {
        errors.push(error);
        json(res, 500, { error: "fixture_assertion" });
      });
    });
  const core = serve(async (req, res) => {
    const url = new URL(req.url!, coreOrigin);
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      json(res, 200, {
        issuer: coreOrigin,
        authorization_endpoint: `${coreOrigin}/authorize/`,
        token_endpoint: state.foreignTokenEndpoint ? "http://127.0.0.1:1/token/" : `${coreOrigin}/token/`,
        agent_identity_endpoint: state.foreignIdentityEndpoint
          ? "http://127.0.0.1:1/identity/"
          : `${coreOrigin}/identity/`,
        ...(state.dcr ? { registration_endpoint: `${coreOrigin}/register/` } : {}),
        scopes_supported: ["agent:access"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        grant_types_supported: ["authorization_code", "refresh_token"]
      });
      return;
    }
    if (url.pathname === "/identity/") {
      assert.equal(req.method, "GET");
      assert.equal(req.headers.authorization, `Bearer ${state.access}`);
      assert.equal(url.searchParams.get("resource"), resource);
      json(res, 200, { sub: state.subject });
      return;
    }
    if (url.pathname === "/register/") {
      assert.equal(req.method, "POST");
      const value = JSON.parse(await body(req));
      assert.equal(value.application_type, "native");
      assert.equal(value.token_endpoint_auth_method, "none");
      assert.equal(value.scope, "agent:access");
      assert.deepEqual(value.grant_types, ["authorization_code", "refresh_token"]);
      const redirect = new URL(value.redirect_uris[0]);
      assert.equal(redirect.protocol, "http:");
      assert.equal(redirect.hostname, "127.0.0.1");
      assert.equal(redirect.pathname, "/oauth/callback");
      const client = `fixture-client-${++state.registrations}`;
      clients.set(client, redirect.pathname);
      json(res, 201, { client_id: client, token_endpoint_auth_method: "none" });
      return;
    }
    if (url.pathname === "/authorize/") {
      state.authorizations++;
      const query = url.searchParams;
      assert.equal(query.get("resource"), resource);
      assert.equal(query.get("scope"), "agent:access");
      assert.equal(query.get("response_type"), "code");
      assert.equal(query.get("code_challenge_method"), "S256");
      assert.match(query.get("state")!, /^[\w-]{43}$/);
      assert.match(query.get("code_challenge")!, /^[\w-]{43}$/);
      const redirect = new URL(query.get("redirect_uri")!);
      assert.equal(redirect.hostname, "127.0.0.1");
      assert.equal(redirect.pathname, clients.get(query.get("client_id")!));
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        challenge: query.get("code_challenge")!,
        client: query.get("client_id")!,
        redirect: redirect.href
      });
      redirect.searchParams.set("state", query.get("state")!);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("iss", coreOrigin);
      state.callback = redirect.href;
      res.writeHead(302, { Location: redirect.href });
      res.end();
      return;
    }
    if (url.pathname === "/token/") {
      assert.equal(req.method, "POST");
      assert.equal(req.headers.authorization, undefined);
      const form = new URLSearchParams(await body(req));
      assert.equal(form.get("resource"), resource);
      assert(clients.has(form.get("client_id")!));
      if (form.get("grant_type") === "authorization_code") {
        const code = codes.get(form.get("code")!);
        assert(code);
        assert.equal(form.get("redirect_uri"), code.redirect);
        assert.equal(form.get("client_id"), code.client);
        assert.equal(createHash("sha256").update(form.get("code_verifier")!).digest("base64url"), code.challenge);
        codes.delete(form.get("code")!);
      } else {
        assert.equal(form.get("grant_type"), "refresh_token");
        state.refreshes++;
        if (state.refreshError) {
          json(res, 400, { error: state.refreshError });
          return;
        }
        assert.equal(form.get("refresh_token"), state.refresh);
      }
      state.access = `fixture-access-${randomBytes(12).toString("hex")}`;
      state.refresh = `fixture-refresh-${randomBytes(12).toString("hex")}`;
      json(res, 200, {
        access_token: state.access,
        refresh_token: state.refresh,
        token_type: "Bearer",
        expires_in: 3600
      });
      return;
    }
    if (url.pathname === "/should-not-receive-token") state.redirectVisits++;
    json(res, 404, {});
  });
  coreOrigin = await listen(core);
  const koko = serve(async (req, res) => {
    if (req.url === "/.well-known/oauth-protected-resource/koko/mcp") {
      json(res, 200, {
        resource: state.resourceMismatch ? `${resource}/other` : resource,
        authorization_servers: [state.foreignIssuer ? "http://127.0.0.1:1" : coreOrigin]
      });
      return;
    }
    if (req.url !== "/koko/mcp") {
      json(res, 404, {});
      return;
    }
    if (req.headers.authorization !== `Bearer ${state.access}`) {
      if (req.headers.authorization) state.refused++;
      res.writeHead(401, {
        "WWW-Authenticate": `Bearer resource_metadata="${new URL(resource).origin}/.well-known/oauth-protected-resource/koko/mcp"`
      });
      res.end();
      return;
    }
    state.dispatches++;
    state.receivedHeaders = req.headers;
    state.receivedBody = await body(req);
    if (JSON.parse(state.receivedBody || "{}").method === "tools/call") state.writes++;
    if (state.mode === "disconnect") {
      req.socket.destroy();
      return;
    }
    if (state.mode === "failure") {
      json(res, 503, { error: "fixture_execution_failed" });
      return;
    }
    if (state.mode === "redirect") {
      res.writeHead(307, { Location: `${coreOrigin}/should-not-receive-token` });
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": state.mode === "sse" ? "text/event-stream" : "application/json",
      "Mcp-Session-Id": "fixture-session",
      "Mcp-Protocol-Version": "2025-03-26",
      "Set-Cookie": "must-not-forward=1"
    });
    const result = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "fixture result" }] }
    });
    res.end(state.mode === "sse" ? `event: message\ndata: ${result}\n\n` : result);
  });
  resource = `${await listen(koko)}/koko/mcp`;
  t.after(async () => {
    core.close();
    core.closeAllConnections();
    koko.close();
    koko.closeAllConnections();
    await rm(storageDir, { recursive: true, force: true });
    assert.deepEqual(errors, [], "HTTP fixture contract assertions");
  });
  const options: McpBridgeOptions = {
    url: resource,
    expectedIssuer: coreOrigin,
    expectedUserId: "fixture-user-id",
    storageDir,
    encrypt,
    decrypt,
    fetch: async (...args) => {
      state.injectedFetches++;
      return fetch(...args);
    },
    openExternal: async (url) => {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      await response.text();
    }
  };
  const credentials = async () => JSON.parse(decrypt(await readFile(join(storageDir, "mcp-oauth.enc"))));
  const expire = async () => {
    const saved = await credentials();
    saved.tokens.refreshAt = 0;
    await writeFile(join(storageDir, "mcp-oauth.enc"), encrypt(JSON.stringify(saved)));
  };
  return { options, state, credentials, expire };
}

async function connect(t: TestContext, options: McpBridgeOptions): Promise<McpBridge> {
  const bridge = await createMcpBridge(options);
  t.after(() => bridge.close());
  return bridge;
}

function call(bridge: McpBridge, method = "tools/call", headers: Record<string, string> = {}) {
  return fetch(bridge.connection.url, {
    method: "POST",
    headers: {
      ...bridge.connection.headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { name: "fixture_write", arguments: {} } })
  });
}

test("DCR + PKCE stores encrypted OAuth and forwards MCP headers and SSE, then reuses authorization", async (t) => {
  const f = await fixture(t);
  const bridge = await connect(t, f.options);
  const response = await call(bridge, "tools/call", {
    "Mcp-Session-Id": "client-session",
    "Mcp-Protocol-Version": "2025-03-26",
    Cookie: "must-not-forward=1"
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("mcp-session-id"), "fixture-session");
  assert.equal(response.headers.get("mcp-protocol-version"), "2025-03-26");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: "fixture result" }] }
  });
  assert.equal(f.state.receivedHeaders.authorization, `Bearer ${f.state.access}`);
  assert.notEqual(f.state.receivedHeaders.authorization, bridge.connection.headers.Authorization);
  assert.equal(f.state.receivedHeaders.cookie, undefined);
  assert.equal(f.state.receivedHeaders["mcp-session-id"], "client-session");
  const file = join(f.options.storageDir, "mcp-oauth.enc");
  assert.equal((await readFile(file)).includes(Buffer.from(f.state.access)), false);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  bridge.close();
  f.state.dcr = false;
  const reopened = await connect(t, f.options);
  assert.notEqual(bridge.connection.headers.Authorization, reopened.connection.headers.Authorization);
  f.state.mode = "sse";
  const stream = await call(reopened, "tools/list");
  assert.equal(stream.headers.get("content-type"), "text/event-stream");
  assert.match(await stream.text(), /^event: message\ndata: /);
  assert.equal(f.state.registrations, 1);
  assert.equal(f.state.authorizations, 1);
  assert(f.state.injectedFetches > 0);
});

test("simultaneous bridges share one authorization and serialize rotated refresh tokens", async (t) => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([connect(t, f.options), connect(t, f.options)]);
  assert.equal(f.state.registrations, 1);
  assert.equal(f.state.authorizations, 1);
  assert.notEqual(first.connection.headers.Authorization, second.connection.headers.Authorization);
  await f.expire();
  const responses = await Promise.all([call(first), call(second)]);
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200]
  );
  await Promise.all(responses.map((response) => response.text()));
  assert.equal(f.state.refreshes, 1);
  assert.equal(f.state.writes, 2);
});

test("only pre-dispatch 401 retries once; failed or disconnected writes are never replayed", async (t) => {
  const f = await fixture(t);
  const bridge = await connect(t, f.options);
  f.state.access = "reject-old-access";
  assert.equal((await call(bridge)).status, 200);
  assert.equal(f.state.refused, 1);
  assert.equal(f.state.refreshes, 1);
  assert.equal(f.state.writes, 1);
  f.state.mode = "failure";
  assert.equal((await call(bridge)).status, 503);
  assert.equal(f.state.writes, 2);
  f.state.mode = "disconnect";
  assert.equal((await call(bridge)).status, 502);
  assert.equal(f.state.writes, 3);
  assert.equal(f.state.refreshes, 1);
});

test("loopback proxy rejects unauthorized routes, origins, hosts and oversized requests", async (t) => {
  const f = await fixture(t);
  const bridge = await connect(t, f.options);
  assert.equal((await fetch(bridge.connection.url)).status, 401);
  assert.equal((await call(bridge, "tools/list", { Origin: "https://untrusted.example" })).status, 401);
  assert.equal((await fetch(`${bridge.connection.url}/files`, { headers: bridge.connection.headers })).status, 404);
  assert.equal(
    (await fetch(`${bridge.connection.url}?target=https://untrusted.example`, { headers: bridge.connection.headers }))
      .status,
    404
  );
  const wrongHost = await new Promise<number>((resolve) => {
    const req = httpRequest(
      bridge.connection.url,
      { headers: { ...bridge.connection.headers, Host: "untrusted.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      }
    );
    req.end();
  });
  assert.equal(wrongHost, 401);
  assert.equal(
    (
      await fetch(bridge.connection.url, {
        method: "POST",
        headers: bridge.connection.headers,
        body: "x".repeat(512 * 1024 + 1)
      })
    ).status,
    413
  );
  assert.equal(f.state.dispatches, 0);
  f.state.mode = "redirect";
  assert.equal((await call(bridge)).status, 502);
  assert.equal(f.state.redirectVisits, 0);
});

test("disabled DCR, resource mismatch, foreign OAuth endpoints and corrupt storage fail closed", async (t) => {
  const f = await fixture(t);
  f.state.dcr = false;
  await assert.rejects(createMcpBridge(f.options), { code: "registration_disabled" });
  f.state.dcr = true;
  f.state.resourceMismatch = true;
  await assert.rejects(createMcpBridge(f.options), { code: "resource_mismatch" });
  f.state.resourceMismatch = false;
  f.state.foreignTokenEndpoint = true;
  await assert.rejects(createMcpBridge(f.options), { code: "invalid_metadata" });
  f.state.foreignTokenEndpoint = false;
  const corrupted = Buffer.from("corrupt encrypted credentials");
  await writeFile(join(f.options.storageDir, "mcp-oauth.enc"), corrupted);
  await assert.rejects(createMcpBridge(f.options), { code: "invalid_credentials" });
  assert.deepEqual(await readFile(join(f.options.storageDir, "mcp-oauth.enc")), corrupted);
  assert.equal(f.state.authorizations, 0);
});

test("host guard and abort stop use after locking or closing; invalid grant asks for reconnect", async (t) => {
  const f = await fixture(t);
  let active = true;
  const controller = new AbortController();
  const bridge = await connect(t, {
    ...f.options,
    signal: controller.signal,
    assertActive: () => {
      if (!active) throw new Error("Locked");
    }
  });
  active = false;
  assert.equal((await call(bridge)).status, 502);
  assert.equal(f.state.dispatches, 0);
  active = true;
  f.state.refreshError = "invalid_grant";
  await f.expire();
  const rejected = await call(bridge);
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { error: "authorization_required" });
  assert.equal(f.state.authorizations, 1);
  assert.equal(f.state.dispatches, 0);
  controller.abort();
  await assert.rejects(call(bridge));
});

test("cancelling browser authorization closes its loopback callback promptly", async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  let callback = "";
  await assert.rejects(
    createMcpBridge({
      ...f.options,
      signal: controller.signal,
      openExternal: async (url) => {
        callback = new URL(url).searchParams.get("redirect_uri")!;
        const badState = await fetch(`${callback}?code=wrong&state=wrong`);
        assert.equal(badState.status, 400);
        controller.abort(new Error("Cancelled by fixture"));
      }
    }),
    /Cancelled by fixture|cancelled/
  );
  await assert.rejects(fetch(callback));
  assert.equal(f.state.dispatches, 0);
});

test("tool approval gates every call, rejects batches and is reused only for the same 401 retry", async (t) => {
  const f = await fixture(t);
  let allowed = false;
  const approvals: Array<{ name: string; arguments: unknown }> = [];
  const bridge = await connect(t, {
    ...f.options,
    approve: async (request) => {
      approvals.push(request);
      return allowed;
    }
  });
  const denied = await call(bridge);
  assert.equal(denied.status, 200);
  assert.deepEqual(await denied.json(), {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: "JumpServer tool execution was declined." }], isError: true }
  });
  assert.equal(f.state.writes, 0);
  assert.deepEqual(approvals, [{ name: "fixture_write", arguments: {} }]);
  assert.equal((await call(bridge, "tools/list")).status, 200);
  assert.equal(approvals.length, 1);
  allowed = true;
  f.state.access = "reject-old-access";
  assert.equal((await call(bridge)).status, 200);
  assert.equal(approvals.length, 2);
  assert.equal(f.state.writes, 1);
  assert.equal(f.state.refreshes, 1);
  const batch = await fetch(bridge.connection.url, {
    method: "POST",
    headers: bridge.connection.headers,
    body: JSON.stringify([{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "fixture_write" } }])
  });
  assert.equal(batch.status, 400);
  assert.equal(f.state.writes, 1);
  assert.equal(approvals.length, 2);

  const controller = new AbortController();
  let entered: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let resolveApproval: (allowed: boolean) => void;
  const cancelled = await connect(t, {
    ...f.options,
    signal: controller.signal,
    approve: () => {
      entered();
      return new Promise<boolean>((resolve) => {
        resolveApproval = resolve;
      });
    }
  });
  const pending = call(cancelled);
  await waiting;
  controller.abort();
  await assert.rejects(pending);
  resolveApproval(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.state.writes, 1);
});

test("a rotated refresh token is not reused when encrypted persistence fails", async (t) => {
  const f = await fixture(t);
  let storageFailed = false;
  const bridge = await connect(t, {
    ...f.options,
    encrypt: (value) => {
      if (storageFailed) throw new Error("Fixture keychain unavailable");
      return f.options.encrypt(value);
    }
  });
  await f.expire();
  storageFailed = true;
  const response = await call(bridge);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "credential_storage_failed" });
  assert.equal((await call(bridge)).status, 401);
  assert.equal(f.state.refreshes, 1);
  assert.equal(f.state.dispatches, 0);
});

test("OAuth issuer and identity endpoint are pinned to the signed-in Core origin", async (t) => {
  const f = await fixture(t);
  f.state.foreignIssuer = true;
  await assert.rejects(createMcpBridge(f.options), { code: "issuer_mismatch" });
  f.state.foreignIssuer = false;
  f.state.foreignIdentityEndpoint = true;
  await assert.rejects(createMcpBridge(f.options), { code: "invalid_metadata" });
  assert.equal(f.state.registrations, 0);
  assert.equal(f.state.authorizations, 0);
});

test("a different browser subject cannot save or use MCP tokens; the same client can authorize again", async (t) => {
  const f = await fixture(t);
  f.state.subject = "another-browser-user";
  await assert.rejects(createMcpBridge(f.options), { code: "identity_mismatch" });
  assert.equal((await f.credentials()).tokens, undefined);
  assert.equal(f.state.dispatches, 0);
  f.state.subject = f.options.expectedUserId;
  const bridge = await connect(t, f.options);
  assert.equal(f.state.registrations, 1);
  assert.equal(f.state.authorizations, 2);
  bridge.close();
  f.state.subject = "another-browser-user";
  await assert.rejects(createMcpBridge(f.options), { code: "identity_mismatch" });
  assert.equal((await f.credentials()).tokens, undefined);
  assert.equal(f.state.dispatches, 0);
});

test("a refreshed token must pass subject verification before any MCP dispatch", async (t) => {
  const f = await fixture(t);
  const bridge = await connect(t, f.options);
  await f.expire();
  f.state.subject = "another-browser-user";
  const rejected = await call(bridge);
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { error: "identity_mismatch" });
  assert.equal((await f.credentials()).tokens, undefined);
  assert.equal(f.state.refreshes, 1);
  assert.equal(f.state.dispatches, 0);
});
