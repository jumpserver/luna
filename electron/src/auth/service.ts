import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { app, net, safeStorage } from "electron";
import { electronLog } from "../shared/debug-log";
import { parseUrl } from "../shared/url";
import { parseOAuthCallback } from "./oauth-callback";

const OAUTH_WELL_KNOWN = "/core/auth/oauth2-provider/.well-known/oauth-authorization-server";
const OAUTH_AUTHORIZE = "/core/auth/oauth2-provider/authorize/";
const OAUTH_TOKEN = "/core/auth/oauth2-provider/token/";
const OAUTH_REVOKE = "/core/auth/oauth2-provider/revoke/";
const USER_PROFILE = "/api/v1/users/profile/";
const USER_PERMISSIONS = "/api/v1/users/profile/permissions/";
const CURRENT_ORG = "/api/v1/orgs/orgs/current/";
const PUBLIC_SETTINGS = "/api/v1/settings/public/";
const CLIENT_VERSIONS = "/api/v1/settings/client/versions/";
const DEV_CALLBACK = "http://127.0.0.1:14876/auth/callback";
const DEEP_LINK_CALLBACK = "jms://auth/callback";

function endpoint(site, endpointPath) {
  return `${site.replace(/\/+$/, "")}${endpointPath}`;
}

function parseJsonResponse(text: string) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error("API returned invalid JSON", { cause });
  }
}

function requestSite(session, request) {
  if (request.service !== "chat-ai") return session.origin;

  const configured = String(process.env.JMS_AI_DESKTOP_URL || process.env.JMS_AI_DEV_URL || "").trim();
  if (configured) {
    const parsed = parseUrl(configured);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("Chat AI endpoint must be an HTTP/HTTPS URL without embedded credentials");
    }
    return configured.replace(/\/+$/, "");
  }

  if (process.env.JMS_ELECTRON_DEV === "1") {
    const rendererUrl = String(process.env.JMS_ELECTRON_RENDERER_URL || "").trim();
    if (rendererUrl) {
      const renderer = parseUrl(rendererUrl);
      if (["http:", "https:"].includes(renderer.protocol) && renderer.hostname) return renderer.origin;
    }
    const site = parseUrl(session.origin);
    if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) {
      site.port = "8088";
      return site.origin;
    }
  }
  return session.origin;
}

function timezoneOffset() {
  const totalMinutes = -new Date().getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(totalMinutes) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(totalMinutes) % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function responseSucceeded(status) {
  return status === 200 || status === 201 || status === 204;
}

function toApiResponse(status, data) {
  return { status, data, success: responseSucceeded(status) };
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function expiresAt(expiresIn) {
  const seconds = Number(expiresIn);
  return Number.isFinite(seconds) ? Math.floor(Date.now() / 1000) + seconds : null;
}

export class DesktopAuthService {
  // ponytail: migration keeps legacy dynamic state; replace with explicit auth/session types when strict mode is enabled.
  [key: string]: any;

  constructor(emitEvent) {
    this.emitEvent = emitEvent;
    this.sessions = new Map();
    this.currentSessionKey = "";
    this.tokens = {};
    this.pendingAuth = null;
    this.queuedCallback = null;
    this.callbackServer = null;
    this.redirectUri = DEEP_LINK_CALLBACK;
    this.tokenFile = path.join(app.getPath("userData"), "oauth-tokens.json");
  }

  async initialize() {
    const encryption = safeStorage.isEncryptionAvailable();
    electronLog.info(`auth initialize encryption=${encryption}`);
    if (!encryption) return;
    try {
      const envelope = JSON.parse(await readFile(this.tokenFile, "utf8"));
      const decrypted = safeStorage.decryptString(Buffer.from(envelope.payload, "base64"));
      this.tokens = JSON.parse(decrypted);
      electronLog.info(`auth tokens restored sites=${Object.keys(this.tokens).length}`);
    } catch {
      this.tokens = {};
    }
  }

  async persistTokens() {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(this.tokens));
    const tempFile = `${this.tokenFile}.pending`;
    await mkdir(path.dirname(this.tokenFile), { recursive: true });
    await writeFile(tempFile, `${JSON.stringify({ version: 1, payload: encrypted.toString("base64") })}\n`, {
      mode: 0o600
    });
    await rename(tempFile, this.tokenFile);
  }

  setSession({ sessionKey, origin, bearerToken = "", orgId = "" }) {
    if (!sessionKey || !origin) throw new Error("session key and origin are required");
    const parsed = parseUrl(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("site must use HTTP or HTTPS");
    this.currentSessionKey = sessionKey;
    this.sessions.set(sessionKey, { sessionKey, origin: origin.replace(/\/+$/, ""), bearerToken, orgId });
    electronLog.info(`auth session ${parsed.origin}`);
  }

  setCurrentOrg(orgId) {
    const session = this.currentSession();
    session.orgId = orgId || "";
    electronLog.info(`auth org ${session.orgId || "(none)"}`);
  }

  currentSession() {
    const session = this.sessions.get(this.currentSessionKey);
    if (!session) throw new Error("missing current api session");
    return session;
  }

  async startCallbackServer() {
    // Packaged clients must use the JumpServer-registered deep link.
    // Binding the dev loopback callback would send http://127.0.0.1:14876, which production rejects.
    if (app.isPackaged && process.env.JMS_ELECTRON_DEV !== "1") {
      this.redirectUri = DEEP_LINK_CALLBACK;
      return;
    }
    if (this.callbackServer) return;
    const server = createServer((request, response) => {
      const callbackUrl = parseUrl(request.url || "/", "http://127.0.0.1:14876");
      if (callbackUrl.pathname !== "/auth/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      const accepted = this.handleCallback(callbackUrl.toString());
      response.writeHead(accepted ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        accepted
          ? "<!doctype html><meta charset=utf-8><title>JumpServer</title><p>登录完成，可以关闭此窗口。</p>"
          : "<!doctype html><meta charset=utf-8><title>JumpServer</title><p>登录回调已失效，请返回客户端重试。</p>"
      );
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(14876, "127.0.0.1", resolve);
      });
      this.callbackServer = server;
      this.redirectUri = DEV_CALLBACK;
      electronLog.info(`auth callback server ${this.redirectUri}`);
    } catch (error) {
      server.close();
      if (error?.code !== "EADDRINUSE") throw error;
      this.callbackServer = null;
      this.redirectUri = DEEP_LINK_CALLBACK;
      electronLog.warn(`auth callback server unavailable, using ${this.redirectUri}`);
    }
  }

  isOAuthCallbackUrl(rawUrl) {
    return Boolean(parseOAuthCallback(rawUrl));
  }

  handleCallback(rawUrl) {
    const parsed = parseOAuthCallback(rawUrl);
    if (!parsed) return false;
    if (!this.pendingAuth) {
      this.queuedCallback = parsed;
      electronLog.info("auth callback queued");
      return true;
    }
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve(parsed);
    electronLog.info("auth callback resolved");
    return true;
  }

  cancelAuth() {
    this.queuedCallback = null;
    if (!this.pendingAuth) return;
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve(null);
    electronLog.info("auth cancelled");
  }

  async requestApiResponse(site, requestPath, { bearerToken = "", orgId = "", timeout = 30_000 } = {}) {
    const url = endpoint(site, requestPath);
    const headers: Record<string, string> = { "X-TZ": timezoneOffset(), Referer: parseUrl(url).origin };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    try {
      const response = await net.fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
      return toApiResponse(response.status, await response.text());
    } catch (error) {
      return { status: 0, data: `request failed: ${error}`, success: false };
    }
  }

  async getVersionMessage() {
    return this.requestApiResponse(this.currentSession().origin, CLIENT_VERSIONS, { timeout: 10_000 });
  }

  async authLogin({ site, sessionId }) {
    electronLog.info(`auth login start ${site}`);
    let oauthConfig: { client_id?: string };
    try {
      const response = await net.fetch(endpoint(site, OAUTH_WELL_KNOWN), { signal: AbortSignal.timeout(10_000) });
      const text = await response.text();
      if (!response.ok) throw new Error(`OAuth config endpoint returned ${response.status}: ${text}`);
      oauthConfig = JSON.parse(text);
    } catch (error) {
      const message = `Failed to fetch OAuth config: ${error}`;
      this.emitEvent("login-failed-detected", {
        status: "failure",
        reason: "invalid-site",
        message,
        site
      });
      throw new Error(message);
    }

    const clientId = String(oauthConfig.client_id || "");
    if (!clientId) throw new Error("OAuth config did not provide client_id");
    const verifier = base64Url(randomBytes(32));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const state = base64Url(randomBytes(24));
    const redirectUri = this.redirectUri;
    const authorizeUrl = parseUrl(endpoint(site, OAUTH_AUTHORIZE));
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "write read");

    this.cancelAuth();
    const callback = new Promise<{ code: string; state: string | null } | null>((resolve) => {
      this.pendingAuth = { resolve };
    });
    this.emitEvent("auth_url", authorizeUrl.toString());
    if (this.queuedCallback && this.pendingAuth) {
      const queued = this.queuedCallback;
      const pending = this.pendingAuth;
      this.queuedCallback = null;
      this.pendingAuth = null;
      pending.resolve(queued);
    }
    const result = await callback;
    if (!result) return null;
    if (result.state && result.state !== state) throw new Error("OAuth state mismatch");

    const token = await this.exchangeToken(site, {
      grant_type: "authorization_code",
      code: result.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier
    });
    this.tokens[sessionId] = { ...token, client_id: clientId };
    await this.persistTokens();
    electronLog.info(`auth login success ${site}`);
    return this.buildLoginPayload(site, token.access_token);
  }

  async exchangeToken(site, parameters) {
    const response = await net.fetch(endpoint(site, OAUTH_TOKEN), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(parameters).toString(),
      redirect: "manual"
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Token exchange failed: status=${response.status}, body=${text}`);
    const payload = parseJsonResponse(text);
    if (!payload.access_token) throw new Error("Token exchange response did not include access_token");
    return {
      access_token: String(payload.access_token),
      refresh_token: payload.refresh_token ? String(payload.refresh_token) : null,
      expires_at: expiresAt(payload.expires_in)
    };
  }

  async freshToken(site, sessionId, provided = "") {
    const stored = this.tokens[sessionId];
    if (!stored) {
      if (provided) return provided;
      throw new Error(`no access token available for site ${site}`);
    }
    if (!stored.expires_at || stored.expires_at > Math.floor(Date.now() / 1000) + 60) return stored.access_token;
    if (!stored.refresh_token) throw new Error(`refresh_token missing for site ${site}`);
    const refreshed = await this.exchangeToken(site, {
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
      client_id: stored.client_id || ""
    });
    this.tokens[sessionId] = {
      ...refreshed,
      refresh_token: refreshed.refresh_token || stored.refresh_token,
      client_id: stored.client_id || ""
    };
    await this.persistTokens();
    return refreshed.access_token;
  }

  async bootstrapAuthSession({ site, sessionId }) {
    const bearer = await this.freshToken(site, sessionId);
    return this.buildLoginPayload(site, bearer);
  }

  async buildLoginPayload(site, bearer) {
    const [profile, permissionOrgs, currentOrg, publicSettings] = await Promise.all([
      this.requestApiResponse(site, USER_PROFILE, { bearerToken: bearer }),
      this.requestApiResponse(site, USER_PERMISSIONS, { bearerToken: bearer }),
      this.requestApiResponse(site, CURRENT_ORG, { bearerToken: bearer }),
      this.requestApiResponse(site, PUBLIC_SETTINGS, { bearerToken: bearer })
    ]);
    let settings: Record<string, unknown> = {};
    if (publicSettings.success) {
      try {
        settings = JSON.parse(publicSettings.data);
      } catch {
        // Public settings are optional during authentication bootstrap.
      }
    }
    return {
      status: "success",
      bearer,
      profile,
      resolved_site: site,
      current_org: currentOrg,
      xpack_license_valid: settings.XPACK_LICENSE_IS_VALID === true,
      security_command_execution: settings.SECURITY_COMMAND_EXECUTION === true,
      permission_orgs: permissionOrgs
    };
  }

  async apiRequest(request) {
    const session = this.currentSession();
    const bearer = await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
    session.bearerToken = bearer;
    const url = parseUrl(endpoint(requestSite(session, request), request.path));
    for (const [key, value] of Object.entries(request.query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    }
    const headers = {
      "X-TZ": timezoneOffset(),
      Referer: url.origin,
      Authorization: `Bearer ${bearer}`
    };
    const orgId = request.orgId || session.orgId;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    const hasBody = request.body !== undefined && request.body !== null;
    if (hasBody) headers["Content-Type"] = "application/json";
    const response = await net.fetch(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined
    });
    const text = await response.text();
    if (!responseSucceeded(response.status)) {
      electronLog.warn(`api ${request.method} ${url.pathname} status=${response.status}`);
      throw new Error(`api request failed: status=${response.status}, body=${text}`);
    }
    if (!text.trim()) return null;
    return parseJsonResponse(text);
  }

  async apiStreamRequest(
    request,
    { signal, onChunk }: { signal?: AbortSignal; onChunk?: (chunk: string) => void } = {}
  ) {
    const session = this.currentSession();
    const bearer = await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
    session.bearerToken = bearer;
    const url = parseUrl(endpoint(requestSite(session, request), request.path));
    for (const [key, value] of Object.entries(request.query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    }
    const headers = {
      Accept: "text/event-stream",
      "X-TZ": timezoneOffset(),
      Referer: url.origin,
      Authorization: `Bearer ${bearer}`
    };
    const orgId = request.orgId || session.orgId;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    const hasBody = request.body !== undefined && request.body !== null;
    if (hasBody) headers["Content-Type"] = "application/json";
    const response = await net.fetch(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`api stream request failed: status=${response.status}, body=${text}`);
    }
    if (!response.body) throw new Error("api stream response body is unavailable");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    while (true) {
      const { value, done } = await reader.read();
      const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
      if (chunk) onChunk?.(chunk);
      if (done) break;
    }
  }

  async createKokoConnectTicket({ baseUrl, tokenId }) {
    const session = this.currentSession();
    const bearer = await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
    session.bearerToken = bearer;

    const base = parseUrl(baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || !base.hostname || base.username || base.password) {
      throw new Error("Koko endpoint must be an HTTP/HTTPS URL without embedded credentials");
    }

    const url = new URL("koko/api/connect-ticket/", `${base.toString().replace(/\/+$/, "")}/`);
    const response = await net.fetch(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "X-JMS-ORG": session.orgId || "",
        "X-TZ": timezoneOffset(),
        Referer: url.origin
      },
      body: JSON.stringify({ token_id: tokenId, org_id: session.orgId || "" })
    });
    const text = await response.text();
    if (response.status !== 201) {
      electronLog.warn(`koko connect ticket failed status=${response.status}`);
      throw new Error(`create koko connect ticket failed: status=${response.status}, body=${text}`);
    }
    electronLog.info(`koko connect ticket ${base.origin}`);
    return parseJsonResponse(text);
  }

  async logout({ site, sessionId }) {
    electronLog.info(`auth logout ${site}`);
    const token = this.tokens[sessionId];
    delete this.tokens[sessionId];
    await this.persistTokens();
    if (!token?.refresh_token) return;
    try {
      await net.fetch(endpoint(site, OAUTH_REVOKE), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: token.refresh_token,
          token_type_hint: "refresh_token",
          client_id: token.client_id || ""
        }).toString()
      });
    } catch {
      // Revocation is best-effort after local credentials are removed.
    }
  }
}
