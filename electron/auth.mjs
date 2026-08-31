import { app, net, safeStorage } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { responseSucceeded } from "./http-status.mjs";

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
const DEEP_LINK_CALLBACK = "jms2://auth/callback";

function endpoint(site, endpointPath) {
  return `${site.replace(/\/+$/, "")}${endpointPath}`;
}

function requestSite(session, request) {
  if (request.service !== "chat-ai" && request.service !== "agent") return session.origin;

  const agent = request.service === "agent";
  const configured = String(
    agent
      ? process.env.JMS_AGENT_DESKTOP_URL || process.env.JMS_AGENT_DEV_URL || ""
      : process.env.JMS_AI_DESKTOP_URL || process.env.JMS_AI_DEV_URL || ""
  ).trim();
  if (configured) {
    const parsed = new URL(configured);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error(
        `${agent ? "Koko Agent" : "Chat AI"} endpoint must be an HTTP/HTTPS URL without embedded credentials`
      );
    }
    return configured.replace(/\/+$/, "");
  }

  if (process.env.JMS_ELECTRON_DEV === "1") {
    const rendererUrl = String(process.env.JMS_ELECTRON_RENDERER_URL || "").trim();
    if (rendererUrl) {
      const renderer = new URL(rendererUrl);
      if (["http:", "https:"].includes(renderer.protocol) && renderer.hostname) return renderer.origin;
    }
    const site = new URL(session.origin);
    if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) {
      site.port = agent ? "5003" : "8088";
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

function requestHeaders(request) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers || {})) {
    const normalized = name.toLowerCase();
    if (["authorization", "cookie", "host", "origin", "referer"].includes(normalized)) continue;
    headers[name] = String(value);
  }
  return headers;
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
  constructor(emitEvent) {
    this.emitEvent = emitEvent;
    this.sessions = new Map();
    this.currentSessionKey = "";
    this.tokens = {};
    this.pendingAuth = null;
    this.callbackServer = null;
    this.redirectUri = DEEP_LINK_CALLBACK;
    this.tokenFile = path.join(app.getPath("userData"), "oauth-tokens.json");
  }

  async initialize() {
    if (!safeStorage.isEncryptionAvailable()) return;
    try {
      const envelope = JSON.parse(await readFile(this.tokenFile, "utf8"));
      const decrypted = safeStorage.decryptString(Buffer.from(envelope.payload, "base64"));
      this.tokens = JSON.parse(decrypted);
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
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("site must use HTTP or HTTPS");
    this.currentSessionKey = sessionKey;
    this.sessions.set(sessionKey, { sessionKey, origin: origin.replace(/\/+$/, ""), bearerToken, orgId });
  }

  setCurrentOrg(orgId) {
    const session = this.currentSession();
    session.orgId = orgId || "";
  }

  currentSession() {
    const session = this.sessions.get(this.currentSessionKey);
    if (!session) throw new Error("missing current api session");
    return session;
  }

  async startCallbackServer() {
    if (this.callbackServer) return;
    const server = createServer((request, response) => {
      const callbackUrl = new URL(request.url || "/", "http://127.0.0.1:14876");
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
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(14876, "127.0.0.1", resolve);
      });
      this.callbackServer = server;
      this.redirectUri = DEV_CALLBACK;
    } catch (error) {
      server.close();
      if (error?.code !== "EADDRINUSE") throw error;
      this.callbackServer = null;
      this.redirectUri = DEEP_LINK_CALLBACK;
    }
  }

  handleCallback(rawUrl) {
    if (!this.pendingAuth) return false;
    const url = new URL(rawUrl);
    const code = url.searchParams.get("code");
    if (!code) return false;
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve({ code, state: url.searchParams.get("state") });
    return true;
  }

  cancelAuth() {
    if (!this.pendingAuth) return;
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve(null);
  }

  async requestApiResponse(site, requestPath, { bearerToken = "", orgId = "", timeout = 30_000 } = {}) {
    const url = endpoint(site, requestPath);
    const headers = { "X-TZ": timezoneOffset(), Referer: new URL(url).origin };
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
    let oauthConfig;
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
    const authorizeUrl = new URL(endpoint(site, OAUTH_AUTHORIZE));
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "write read");

    this.cancelAuth();
    const callback = new Promise((resolve) => {
      this.pendingAuth = { resolve };
    });
    this.emitEvent("auth_url", authorizeUrl.toString());
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
    const payload = JSON.parse(text);
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
    let settings = {};
    if (publicSettings.success) {
      try {
        settings = JSON.parse(publicSettings.data);
      } catch {}
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
    const url = new URL(endpoint(requestSite(session, request), request.path));
    for (const [key, value] of Object.entries(request.query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
      else url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    const headers = {
      ...requestHeaders(request),
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
      throw new Error(`api request failed: status=${response.status}, body=${text}`);
    }
    if (!text.trim()) return null;
    return JSON.parse(text);
  }

  async apiStreamRequest(request, { signal, onChunk } = {}) {
    const session = this.currentSession();
    const bearer = await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
    session.bearerToken = bearer;
    const url = new URL(endpoint(requestSite(session, request), request.path));
    for (const [key, value] of Object.entries(request.query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
      else url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    const headers = {
      ...requestHeaders(request),
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

    const base = new URL(baseUrl);
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
      throw new Error(`create koko connect ticket failed: status=${response.status}, body=${text}`);
    }
    return JSON.parse(text);
  }

  async logout({ site, sessionId }) {
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
    } catch {}
  }
}
