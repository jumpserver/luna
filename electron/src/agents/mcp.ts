import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { join, resolve } from "node:path";

export interface McpBridgeOptions {
  url: string;
  expectedUserId: string;
  expectedIssuer: string;
  /** The host supplies a directory isolated by JumpServer site and signed-in user. */
  storageDir: string;
  openExternal: (url: string) => Promise<void>;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
  signal?: AbortSignal;
  assertActive?: () => void | Promise<void>;
  approve?: (call: { name: string; arguments: unknown }, signal: AbortSignal) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
}

export interface McpBridge {
  connection: { url: string; headers: Record<string, string> };
  close(): void;
}

class McpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502
  ) {
    super(message);
    this.name = "McpError";
  }
}

interface Metadata {
  issuer: string;
  authorization: string;
  token: string;
  identity: string;
  registration?: string;
}
interface Credentials {
  version: 1;
  resource: string;
  issuer: string;
  clientId: string;
  subject: string;
  tokens?: { access: string; refresh?: string; refreshAt: number; expiresAt: number };
}

const SCOPE = "agent:access";
const CALLBACK_PATH = "/oauth/callback";
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const locks = new Map<string, Promise<unknown>>();
const unpersistedTokens = new Set<string>();
const permanentTokenErrors = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "invalid_target"]);

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function httpUrl(value: unknown): URL {
  if (typeof value !== "string" || /[\s\\\p{Cc}]/u.test(value)) {
    throw new McpError("invalid_url", "Invalid JumpServer MCP address");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new McpError("invalid_url", "Invalid JumpServer MCP address");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new McpError("invalid_url", "Invalid JumpServer MCP address");
  }
  return url;
}

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((accept, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(accept, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function exclusive<T>(key: string, signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  // ponytail: Electron owns one main process. Cross-process sharing needs a file lock.
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => {
      signal.throwIfAborted();
      return task();
    });
  locks.set(key, current);
  void current
    .finally(() => {
      if (locks.get(key) === current) locks.delete(key);
    })
    .catch(() => {});
  return abortable(current, signal);
}

function listen(server: Server): Promise<string> {
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Loopback listener unavailable"));
      accept(`http://127.0.0.1:${address.port}`);
    });
  });
}

function stop(server: Server): void {
  server.close();
  server.closeAllConnections();
}

async function bodyBytes(response: Response, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new McpError("response_too_large", "MCP response exceeds the size limit");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function sendError(response: ServerResponse, error: unknown): void {
  if (response.destroyed) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(error instanceof McpError ? error.status : 502, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify({ error: error instanceof McpError ? error.code : "mcp_connection_failed" }));
}

export async function createMcpBridge(options: McpBridgeOptions): Promise<McpBridge> {
  const resource = httpUrl(options.url);
  const expectedIssuer = httpUrl(options.expectedIssuer);
  if (
    expectedIssuer.pathname !== "/" ||
    expectedIssuer.search ||
    !options.expectedUserId ||
    typeof options.expectedUserId !== "string" ||
    options.expectedUserId.length > 128
  ) {
    throw new McpError("invalid_identity", "A trusted Core origin and signed-in user are required");
  }
  if (resource.search || resource.pathname === "/" || resource.pathname.endsWith("/")) {
    throw new McpError("invalid_url", "Use the exact JumpServer MCP address without a trailing slash");
  }
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const request = options.fetch ?? globalThis.fetch;
  const credentialFile = join(resolve(options.storageDir), "mcp-oauth.enc");
  let verifiedAccess = "";
  const assertActive = async () => {
    signal.throwIfAborted();
    await options.assertActive?.();
    signal.throwIfAborted();
  };
  const fetchRemote = async (url: string, init: RequestInit = {}) => {
    await assertActive();
    return request(url, {
      ...init,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.any([signal, init.signal ?? signal, AbortSignal.timeout(30_000)])
    });
  };
  const jsonRequest = async (url: string, init: RequestInit = {}) => {
    const response = await fetchRemote(url, init);
    const bytes = await bodyBytes(response, 64 * 1024);
    let value: any;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      value = null;
    }
    return { response, value };
  };

  async function discover(): Promise<Metadata> {
    const probe = await fetchRemote(options.url, { headers: { Accept: "application/json, text/event-stream" } });
    const advertised = /resource_metadata\s*=\s*"([^"]+)"/i.exec(probe.headers.get("www-authenticate") ?? "")?.[1];
    await probe.body?.cancel();
    const candidates = [
      ...new Set([
        ...(advertised ? [advertised] : []),
        `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`,
        `${options.url}/.well-known/oauth-protected-resource`
      ])
    ];
    let protectedResource: any;
    for (const candidate of candidates) {
      if (httpUrl(candidate).origin !== resource.origin) {
        throw new McpError("invalid_metadata", "MCP resource metadata must belong to this server");
      }
      const result = await jsonRequest(candidate);
      if (result.response.ok) {
        protectedResource = result.value;
        break;
      }
      if (result.response.status !== 404) throw new McpError("discovery_failed", "JumpServer MCP discovery failed");
    }
    if (protectedResource?.resource !== options.url || !Array.isArray(protectedResource?.authorization_servers)) {
      throw new McpError("resource_mismatch", "JumpServer MCP resource metadata does not match this site");
    }
    const issuer = httpUrl(protectedResource.authorization_servers[0]);
    if (issuer.origin !== expectedIssuer.origin) {
      throw new McpError("issuer_mismatch", "MCP authorization must use the signed-in JumpServer site");
    }
    if (issuer.pathname !== "/" || issuer.search)
      throw new McpError("invalid_metadata", "Invalid JumpServer OAuth issuer");
    const { response, value } = await jsonRequest(`${issuer.origin}/.well-known/oauth-authorization-server`);
    if (
      !response.ok ||
      value?.issuer !== protectedResource.authorization_servers[0] ||
      !Array.isArray(value.code_challenge_methods_supported) ||
      !value.code_challenge_methods_supported.includes("S256") ||
      !Array.isArray(value.scopes_supported) ||
      !value.scopes_supported.includes(SCOPE) ||
      !Array.isArray(value.token_endpoint_auth_methods_supported) ||
      !value.token_endpoint_auth_methods_supported.includes("none")
    ) {
      throw new McpError(
        "unsupported_oauth",
        "JumpServer must support public OAuth clients, PKCE S256 and agent:access"
      );
    }
    const endpoint = (address: unknown) => {
      const parsed = httpUrl(address);
      if (parsed.origin !== issuer.origin)
        throw new McpError("invalid_metadata", "OAuth endpoint belongs to another issuer");
      return parsed.href;
    };
    if (!value.agent_identity_endpoint) {
      throw new McpError("identity_unavailable", "JumpServer must support MCP subject verification");
    }
    return {
      issuer: value.issuer,
      authorization: endpoint(value.authorization_endpoint),
      token: endpoint(value.token_endpoint),
      identity: endpoint(value.agent_identity_endpoint),
      ...(value.registration_endpoint ? { registration: endpoint(value.registration_endpoint) } : {})
    };
  }

  const metadata = await discover();
  async function loadCredentials(): Promise<Credentials | undefined> {
    let bytes: Buffer;
    try {
      bytes = await readFile(credentialFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new McpError("credential_storage_failed", "Cannot read JumpServer MCP credentials");
    }
    let value: any;
    try {
      if (bytes.length > 256 * 1024) throw new Error();
      value = JSON.parse(options.decrypt(bytes));
      if (
        !record(value) ||
        value.version !== 1 ||
        typeof value.clientId !== "string" ||
        !value.clientId ||
        value.resource !== options.url ||
        value.issuer !== metadata.issuer ||
        value.subject !== options.expectedUserId
      )
        throw new Error();
      if (
        value.tokens &&
        (!record(value.tokens) ||
          typeof value.tokens.access !== "string" ||
          !value.tokens.access ||
          !Number.isFinite(value.tokens.refreshAt) ||
          !Number.isFinite(value.tokens.expiresAt) ||
          (value.tokens.refresh !== undefined && typeof value.tokens.refresh !== "string"))
      )
        throw new Error();
    } catch {
      throw new McpError("invalid_credentials", "Saved MCP credentials cannot be read or belong to another site");
    }
    return value as Credentials;
  }
  async function saveCredentials(value: Credentials): Promise<void> {
    await assertActive();
    const temporary = `${credentialFile}.${randomBytes(12).toString("hex")}.tmp`;
    try {
      const encrypted = options.encrypt(JSON.stringify(value));
      await mkdir(options.storageDir, { recursive: true, mode: 0o700 });
      await writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" });
      await assertActive();
      await rename(temporary, credentialFile);
    } catch {
      throw new McpError("credential_storage_failed", "Cannot securely save JumpServer MCP credentials");
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async function verifyIdentity(credentials: Credentials): Promise<void> {
    const access = credentials.tokens!.access;
    if (access === verifiedAccess) return;
    const url = new URL(metadata.identity);
    url.searchParams.set("resource", options.url);
    const { response, value } = await jsonRequest(url.href, {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }
    });
    if (response.status === 401 || response.status === 403 || (response.ok && value?.sub !== options.expectedUserId)) {
      credentials.tokens = undefined;
      await saveCredentials(credentials);
      throw new McpError(
        "identity_mismatch",
        "Authorize MCP in the browser with the same JumpServer account as Luna",
        403
      );
    }
    if (!response.ok) throw new McpError("identity_unavailable", "Cannot verify the JumpServer MCP account");
    verifiedAccess = access;
  }
  function tokenPair(value: any, previous?: Credentials["tokens"]): NonNullable<Credentials["tokens"]> {
    if (
      typeof value?.access_token !== "string" ||
      !value.access_token ||
      value.access_token.length > 16 * 1024 ||
      String(value.token_type).toLowerCase() !== "bearer" ||
      !Number.isFinite(value.expires_in) ||
      value.expires_in <= 0 ||
      (value.refresh_token !== undefined &&
        (typeof value.refresh_token !== "string" || value.refresh_token.length > 16 * 1024))
    ) {
      throw new McpError("invalid_token_response", "JumpServer returned an invalid OAuth token response");
    }
    const lifetime = value.expires_in * 1000;
    return {
      access: value.access_token,
      refresh: value.refresh_token || previous?.refresh,
      expiresAt: Date.now() + lifetime,
      refreshAt: Date.now() + lifetime - Math.min(60_000, lifetime / 10)
    };
  }
  async function exchange(form: Record<string, string>) {
    return jsonRequest(metadata.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...form, resource: options.url }).toString()
    });
  }

  async function authorize(saved?: Credentials): Promise<Credentials> {
    await assertActive();
    if (!saved && !metadata.registration) {
      throw new McpError("registration_disabled", "JumpServer has not enabled registration for new MCP clients", 403);
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    let acceptCode: (code: string) => void;
    let rejectCode: (error: Error) => void;
    const codePromise = new Promise<string>((accept, reject) => {
      acceptCode = accept;
      rejectCode = reject;
    });
    // Observe rejection while the browser/DCR request is still pending.
    void codePromise.catch(() => {});
    let callbackOrigin = "";
    let received = false;
    const callback = createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.setHeader("Referrer-Policy", "no-referrer");
      let target: URL;
      try {
        target = new URL(req.url ?? "/", callbackOrigin);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (
        req.method !== "GET" ||
        req.headers.host !== new URL(callbackOrigin).host ||
        target.origin !== callbackOrigin ||
        target.pathname !== CALLBACK_PATH
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (
        received ||
        target.searchParams.getAll("state").length !== 1 ||
        !equalSecret(target.searchParams.get("state") ?? "", state) ||
        target.searchParams.getAll("code").length > 1 ||
        target.searchParams.getAll("error").length > 1 ||
        target.searchParams.getAll("iss").length > 1 ||
        (target.searchParams.has("iss") && target.searchParams.get("iss") !== metadata.issuer)
      ) {
        res.writeHead(400);
        res.end("Invalid or expired authorization callback.");
        return;
      }
      received = true;
      if (target.searchParams.has("error") || !target.searchParams.get("code")) {
        rejectCode(new McpError("authorization_denied", "JumpServer MCP authorization was declined", 401));
        res.writeHead(400);
        res.end("Authorization was not completed. Return to JumpServer Client.");
        return;
      }
      acceptCode(target.searchParams.get("code")!);
      res.end("Authorization received. You can return to JumpServer Client.");
    });
    callback.headersTimeout = 10_000;
    callback.requestTimeout = 10_000;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
    const aborted = () => {
      rejectCode(
        new McpError("authorization_cancelled", "JumpServer MCP authorization was cancelled or timed out", 401)
      );
      stop(callback);
    };
    deadline.addEventListener("abort", aborted, { once: true });
    try {
      callbackOrigin = await listen(callback);
      deadline.throwIfAborted();
      const redirectUri = `${callbackOrigin}${CALLBACK_PATH}`;
      let credentials = saved;
      if (!credentials) {
        const { response, value } = await jsonRequest(metadata.registration!, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_name: "JumpServer Luna",
            application_type: "native",
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            scope: SCOPE
          })
        });
        if (!response.ok || typeof value?.client_id !== "string" || !value.client_id || value.client_secret) {
          throw new McpError("registration_failed", "JumpServer refused MCP client registration", 403);
        }
        credentials = {
          version: 1,
          resource: options.url,
          issuer: metadata.issuer,
          clientId: value.client_id,
          subject: options.expectedUserId
        };
        await saveCredentials(credentials);
      }
      const authorization = new URL(metadata.authorization);
      authorization.search = new URLSearchParams({
        response_type: "code",
        client_id: credentials.clientId,
        redirect_uri: redirectUri,
        scope: SCOPE,
        resource: options.url,
        state,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256"
      }).toString();
      await assertActive();
      await abortable(options.openExternal(authorization.href), deadline);
      const code = await abortable(codePromise, deadline);
      const { response, value } = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: credentials.clientId,
        redirect_uri: redirectUri
      });
      if (!response.ok) throw new McpError("authorization_failed", "JumpServer MCP token exchange failed", 401);
      credentials.tokens = tokenPair(value);
      await verifyIdentity(credentials);
      await saveCredentials(credentials);
      unpersistedTokens.delete(credentialFile);
      return credentials;
    } finally {
      deadline.removeEventListener("abort", aborted);
      stop(callback);
    }
  }

  async function accessToken(interactive = false, rejectedToken?: string): Promise<string> {
    return exclusive(credentialFile, signal, async () => {
      await assertActive();
      let credentials = await loadCredentials();
      if (!unpersistedTokens.has(credentialFile) && credentials?.tokens) {
        const current = credentials.tokens;
        if (Date.now() < current.refreshAt && (!rejectedToken || rejectedToken !== current.access)) {
          await verifyIdentity(credentials);
          return current.access;
        }
        if (current.refresh) {
          const { response, value } = await exchange({
            grant_type: "refresh_token",
            refresh_token: current.refresh,
            client_id: credentials.clientId
          });
          if (response.ok) {
            unpersistedTokens.add(credentialFile);
            credentials.tokens = tokenPair(value, current);
            await verifyIdentity(credentials);
            await saveCredentials(credentials);
            unpersistedTokens.delete(credentialFile);
            return credentials.tokens.access;
          }
          if (!permanentTokenErrors.has(value?.error))
            throw new McpError("refresh_failed", "JumpServer MCP authorization could not be refreshed", 503);
        }
        credentials.tokens = undefined;
        await saveCredentials(credentials);
      }
      if (!interactive)
        throw new McpError("authorization_required", "Reconnect the assistant to authorize JumpServer MCP", 401);
      credentials = await authorize(credentials);
      return credentials.tokens!.access;
    });
  }

  await accessToken(true);
  const localToken = randomBytes(32).toString("base64url");
  let origin = "";
  async function proxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.url !== "/mcp" || !["POST", "GET", "DELETE"].includes(req.method ?? "")) {
      throw new McpError("not_found", "Unknown local MCP route", 404);
    }
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      !equalSecret(req.headers.authorization ?? "", `Bearer ${localToken}`)
    ) {
      throw new McpError("unauthorized", "Invalid local MCP authorization", 401);
    }
    await assertActive();
    if (Number(req.headers["content-length"] ?? 0) > MAX_REQUEST_BYTES) {
      req.resume();
      throw new McpError("request_too_large", "MCP request exceeds the size limit", 413);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_REQUEST_BYTES) {
        req.resume();
        throw new McpError("request_too_large", "MCP request exceeds the size limit", 413);
      }
      chunks.push(Buffer.from(chunk));
    }
    const disconnected = new AbortController();
    res.on("close", () => disconnected.abort());
    const requestSignal = AbortSignal.any([signal, disconnected.signal]);
    const payload = Buffer.concat(chunks);
    if (req.method === "POST") {
      let message: any;
      try {
        message = JSON.parse(payload.toString("utf8"));
      } catch {
        throw new McpError("invalid_request", "Expected one JSON-RPC message", 400);
      }
      if (
        !record(message) ||
        message.jsonrpc !== "2.0" ||
        (message.method !== undefined
          ? typeof message.method !== "string"
          : !Object.hasOwn(message, "id") || (!Object.hasOwn(message, "result") && !record(message.error)))
      ) {
        throw new McpError("invalid_request", "Expected one JSON-RPC message", 400);
      }
      if (message.method === "tools/call") {
        if (
          !record(message.params) ||
          typeof message.params.name !== "string" ||
          !message.params.name ||
          !["string", "number"].includes(typeof message.id)
        ) {
          throw new McpError("invalid_request", "Invalid MCP tool request", 400);
        }
        await assertActive();
        if (
          options.approve &&
          (await abortable(
            options.approve(
              {
                name: message.params.name,
                arguments: message.params.arguments
              },
              requestSignal
            ),
            requestSignal
          )) !== true
        ) {
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [{ type: "text", text: "JumpServer tool execution was declined." }],
                isError: true
              }
            })
          );
          return;
        }
        await assertActive();
      }
    }
    const headers: Record<string, string> = {};
    for (const key of ["accept", "content-type", "mcp-protocol-version", "mcp-session-id", "last-event-id"]) {
      if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
    }
    let token = await accessToken();
    const forward = async () => {
      await assertActive();
      return request(options.url, {
        method: req.method,
        credentials: "omit",
        headers: { ...headers, Authorization: `Bearer ${token}` },
        ...(req.method === "POST" ? { body: payload } : {}),
        redirect: "error",
        signal: AbortSignal.any([signal, disconnected.signal, AbortSignal.timeout(120_000)])
      });
    };
    let upstream = await forward();
    if (upstream.status === 401) {
      // Core/Koko rejects OAuth before dispatch. Only that refusal is retried;
      // network failures, 5xx, tool errors and uncertain execution are never replayed.
      await upstream.body?.cancel();
      token = await accessToken(false, token);
      upstream = await forward();
    }
    for (const key of ["content-type", "mcp-session-id", "mcp-protocol-version", "retry-after", "allow"]) {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    }
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(upstream.status);
    const reader = upstream.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }
    let receivedBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES)
          throw new McpError("response_too_large", "MCP response exceeds the size limit");
        if (!res.write(value))
          await abortable(
            new Promise<void>((accept) => res.once("drain", accept)),
            AbortSignal.any([signal, disconnected.signal])
          );
      }
      res.end();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const server = createServer((req, res) => {
    void proxy(req, res).catch((error) => sendError(res, error));
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.maxConnections = 32;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    controller.abort();
    stop(server);
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    origin = await listen(server);
    await assertActive();
  } catch (error) {
    close();
    throw error;
  }
  return { connection: { url: `${origin}/mcp`, headers: { Authorization: `Bearer ${localToken}` } }, close };
}
