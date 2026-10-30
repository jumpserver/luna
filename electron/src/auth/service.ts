import { compactApiErrorBody } from "../../../ui/utils/apiError";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { app, net, safeStorage } from "electron";
import { CLIENT_AUTH_CALLBACK } from "../shared/client-protocol";
import { electronLog } from "../shared/debug-log";
import { isTrustedCertificateHost, parseUrl, siteHostname } from "../shared/url";
import { isOAuthCallbackUrl, parseOAuthCallback } from "./oauth-callback";
import { checkSiteCompatibility, normalizeCompatibilitySite } from "./compatibility";
import type { ClientLoginSession } from "../../../ui/types/index";

// Main-process-only identity: keep the original object, never reconstruct it from renderer data.
export interface ClientSessionBinding {
  readonly sessionKey: string;
  readonly origin: string;
}

interface ClientSessionBindingState extends ClientSessionBinding {
  unlockedAt: number;
  lastIdleSeconds?: number;
  idleNoticeRevision?: number;
  locked?: boolean;
  serverClock?: { serverTime: number; observedAt: number };
  verifying?: Promise<unknown>;
  lockRequest?: Promise<void>;
}

const OAUTH_WELL_KNOWN = "/core/auth/oauth2-provider/.well-known/oauth-authorization-server";
const OAUTH_AUTHORIZE = "/core/auth/oauth2-provider/authorize/";
const OAUTH_TOKEN = "/core/auth/oauth2-provider/token/";
const OAUTH_REVOKE = "/core/auth/oauth2-provider/revoke/";
const CLIENT_SESSION_REVOKE = "/api/v1/authentication/client-login-session/revoke/";
const CLIENT_SESSION_STATUS = "/api/v1/authentication/client-login-session/status/";
const CLIENT_SESSION_CHECK_INTERVAL = 30_000;
const CLIENT_SESSION_LOCK = "/api/v1/authentication/client-login-session/lock/";
const CLIENT_SESSION_UNLOCK = "/api/v1/authentication/client-login-session/unlock/";
const USER_PROFILE = "/api/v1/users/profile/";
const USER_PERMISSIONS = "/api/v1/users/profile/permissions/";
const CURRENT_ORG = "/api/v1/orgs/orgs/current/";
const PUBLIC_SETTINGS = "/api/v1/settings/public/";
const DEV_CALLBACK = "http://127.0.0.1:14876/auth/callback";
const DEEP_LINK_CALLBACK = CLIENT_AUTH_CALLBACK;

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

function parseOAuthError(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.error === "string" ? payload.error : "";
  } catch {
    return "";
  }
}

function parseClientLoginReason(text: string) {
  try {
    const reason = JSON.parse(text)?.client_login_reason;
    if (["policy_changed", "absolute_timeout", "security_revoke", "app_exit", "logout"].includes(reason))
      return reason as string;
  } catch {
    // An unstructured error cannot establish why a login ended.
  }
  return "unknown";
}

function parseClientLoginSession(payload: unknown): ClientLoginSession | undefined {
  try {
    const response = (typeof payload === "string" ? JSON.parse(payload) : payload) as Record<string, unknown>;
    const value = response?.client_login_session as Record<string, unknown>;
    if (!value || typeof value !== "object") return;
    const timestamp = (date: unknown) =>
      typeof date === "string" && date.length <= 64 && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date)
        ? Date.parse(date)
        : NaN;
    const start = timestamp(value.authenticated_at);
    const server = timestamp(value.server_time);
    const expires = value.expires_at === null ? null : timestamp(value.expires_at);
    const policyExpires = value.policy_expires_at == null ? null : timestamp(value.policy_expires_at);
    const effectiveExpires = value.effective_expires_at == null ? expires : timestamp(value.effective_expires_at);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(server) ||
      server < start ||
      (expires !== null && (!Number.isFinite(expires) || expires < start)) ||
      (policyExpires !== null && (!Number.isFinite(policyExpires) || policyExpires < start)) ||
      (effectiveExpires !== null && (!Number.isFinite(effectiveExpires) || effectiveExpires < start))
    )
      return;
    return {
      authenticated_at: String(value.authenticated_at),
      expires_at: expires === null ? null : String(value.expires_at),
      policy_expires_at: policyExpires === null ? null : String(value.policy_expires_at),
      effective_expires_at: effectiveExpires === null ? null : new Date(effectiveExpires).toISOString(),
      expiry_reason: value.expiry_reason === "policy_changed" ? "policy_changed" : "absolute_timeout",
      server_time: String(value.server_time),
      ...(typeof value.locked === "boolean" ? { locked: value.locked } : {})
    };
  } catch {
    // Display metadata must never turn an otherwise valid login into an auth failure.
  }
}

function clientLoginSessionHeaders(token, bearer: string): Record<string, string> {
  if (token?.access_token !== bearer || !token.client_login_session_receipt) return {};
  return { "X-JMS-Client-Login-Session": token.client_login_session_receipt };
}

function validateClientLoginPolicy(policy) {
  if (
    !policy ||
    typeof policy.reauth_on_exit !== "boolean" ||
    !Number.isInteger(policy.idle_lock_time) ||
    policy.idle_lock_time < 0 ||
    !Number.isInteger(policy.max_session_time) ||
    policy.max_session_time < 0
  )
    throw new Error("OAuth response contains an invalid client login policy");
  return {
    reauth_on_exit: policy.reauth_on_exit,
    idle_lock_time: policy.idle_lock_time,
    max_session_time: policy.max_session_time
  };
}

function requestSite(session, request) {
  if (request.service !== "kael") return session.origin;

  const configured = String(process.env.JMS_KAEL_DESKTOP_URL || process.env.JMS_KAEL_DEV_URL || "").trim();
  if (configured) {
    const parsed = parseUrl(configured);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("Kael endpoint must be an HTTP/HTTPS URL without embedded credentials");
    }
    return configured.replace(/\/+$/, "");
  }

  // The development renderer is not the selected site's API gateway.
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
  return Number.isInteger(status) && status >= 200 && status < 300;
}

function requestHeaders(request) {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers || {})) {
    const normalized = name.toLowerCase();
    if (["authorization", "cookie", "host", "origin", "referer", "x-jms-client-login-session"].includes(normalized))
      continue;
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
  // ponytail: migration keeps legacy dynamic state; replace with explicit auth/session types when strict mode is enabled.
  [key: string]: any;

  constructor(emitEvent) {
    this.emitEvent = emitEvent;
    this.sessions = new Map();
    this.currentSessionKey = "";
    this.tokens = {};
    this.restoredSessionIds = new Set();
    this.persistingTokens = Promise.resolve();
    this.refreshingTokens = new Map();
    this.sessionBindings = new WeakMap<object, ClientSessionBindingState>();
    this.pendingAuth = null;
    this.callbackServer = null;
    this.redirectUri = DEEP_LINK_CALLBACK;
    this.tokenFile = path.join(app.getPath("userData"), "oauth-tokens.json");
    this.trustedHosts = new Set();
    this.connectionGeneration = 0;
    this.pendingConnection = null;
    this.pendingCompatibility = null;
    this.sessionMonitor = null;
    this.sessionMonitoringEnabled = false;
    this.checkingSessions = false;
    this.lockRevision = 0;
    this.policyNotices = [];
  }

  startSessionMonitor() {
    if (this.sessionMonitoringEnabled) return;
    this.sessionMonitoringEnabled = true;
    this.scheduleSessionCheck();
  }

  stopSessionMonitor() {
    this.sessionMonitoringEnabled = false;
    clearTimeout(this.sessionMonitor);
    this.sessionMonitor = null;
  }

  scheduleSessionCheck() {
    if (!this.sessionMonitoringEnabled) return;
    clearTimeout(this.sessionMonitor);
    this.sessionMonitor = null;
    if (this.checkingSessions) return;
    const session = this.sessions.get(this.currentSessionKey);
    if (!session || !this.tokens[session.sessionKey]) return;
    // Main-process timers keep running when the renderer is hidden or unfocused.
    this.sessionMonitor = setTimeout(
      () => void this.checkSessions(),
      Math.max(0, (session.nextCheckAt || 0) - performance.now())
    );
    this.sessionMonitor.unref();
  }

  recordSessionValidation(session, bearer) {
    if (
      !session ||
      this.sessions.get(session.sessionKey) !== session ||
      this.currentSessionKey !== session.sessionKey ||
      this.tokens[session.sessionKey]?.access_token !== bearer
    )
      return;
    session.nextCheckAt = performance.now() + CLIENT_SESSION_CHECK_INTERVAL;
    this.scheduleSessionCheck();
  }

  async checkSessions(force = false) {
    if (this.checkingSessions) return;
    this.checkingSessions = true;
    try {
      // Only monitor the login currently in use. Switching/restoring accounts validates
      // them separately; saved and inactive accounts must not generate background traffic.
      const session = this.sessions.get(this.currentSessionKey);
      const stored = session && this.tokens[session.sessionKey];
      if (!stored || (!force && session.nextCheckAt > performance.now())) return;
      // Network failures also wait for the next interval, without a retry storm.
      session.nextCheckAt = performance.now() + CLIENT_SESSION_CHECK_INTERVAL;
      try {
        if (stored.client_lock_pending) await this.syncSessionLock(this.sessionBinding(session.sessionKey));
        const bearer = await this.freshToken(session.origin, session.sessionKey);
        if (
          this.sessions.get(session.sessionKey) !== session ||
          this.currentSessionKey !== session.sessionKey ||
          this.tokens[session.sessionKey]?.access_token !== bearer
        )
          return;
        // A successful refresh already validated this login on the server.
        if (this.tokens[session.sessionKey] !== stored) return;
        const response = await this.requestApiResponse(session.origin, CLIENT_SESSION_STATUS, {
          bearerToken: bearer,
          clientLoginSessionReceipt: this.tokens[session.sessionKey]?.client_login_session_receipt,
          timeout: 10_000
        });
        if (this.sessions.get(session.sessionKey) !== session || this.currentSessionKey !== session.sessionKey) return;
        if (responseSucceeded(response.status)) {
          const metadata = parseJsonResponse(response.data);
          await this.applyClientLoginPolicy(
            session.origin,
            session.sessionKey,
            validateClientLoginPolicy(metadata.client_login_policy)
          );
          this.recordClientLoginSession(session.sessionKey, bearer, response.data);
          this.recordSessionValidation(session, bearer);
        }
        await this.handleUnauthorized(session, bearer, response.status, response.data);
      } catch (error) {
        if (
          error?.oauthError === "invalid_grant" &&
          this.tokens[session.sessionKey] === stored &&
          this.sessions.get(session.sessionKey) === session
        ) {
          await this.expireSession(session.sessionKey, error.clientLoginReason, error.clientLoginSession);
        }
        // Network/server errors are not evidence of expiry; retry on the next tick.
      }
    } finally {
      this.checkingSessions = false;
      this.scheduleSessionCheck();
    }
  }

  trustSite(site) {
    try {
      const host = siteHostname(site);
      if (host) this.trustedHosts.add(host);
    } catch {
      // Invalid URLs stay untrusted; parse/fetch still fail on the caller path.
    }
  }

  isTrustedSiteHost(hostname) {
    return isTrustedCertificateHost(this.trustedHosts, hostname);
  }

  fetchSite(url, init) {
    this.trustSite(url);
    return net.fetch(url, init);
  }

  async initialize() {
    const encryption = safeStorage.isEncryptionAvailable();
    electronLog.info(`auth initialize encryption=${encryption}`);
    if (!encryption) return;
    try {
      const envelope = JSON.parse(await readFile(this.tokenFile, "utf8"));
      const decrypted = safeStorage.decryptString(Buffer.from(envelope.payload, "base64"));
      this.tokens = JSON.parse(decrypted);
      this.restoredSessionIds = new Set(Object.keys(this.tokens));
      // Migrate any credentials written by an older client after this policy was enabled.
      for (const [sessionId, token] of Object.entries(this.tokens) as [string, any][]) {
        if (token.client_login_policy?.reauth_on_exit) delete this.tokens[sessionId];
      }
      await this.persistTokens();
      electronLog.info(`auth tokens restored sites=${Object.keys(this.tokens).length}`);
    } catch {
      this.tokens = {};
    }
  }

  async persistTokens() {
    // Serialize snapshots so a concurrent refresh cannot write credentials back after logout.
    this.persistingTokens = this.persistingTokens
      .catch(() => {})
      .then(async () => {
        if (!safeStorage.isEncryptionAvailable()) return;
        const persistent = Object.fromEntries(
          Object.entries(this.tokens).filter(([, token]: [string, any]) => !token.client_login_policy?.reauth_on_exit)
        );
        const encrypted = safeStorage.encryptString(JSON.stringify(persistent));
        const tempFile = `${this.tokenFile}.pending`;
        await mkdir(path.dirname(this.tokenFile), { recursive: true });
        await writeFile(tempFile, `${JSON.stringify({ version: 1, payload: encrypted.toString("base64") })}\n`, {
          mode: 0o600
        });
        await rename(tempFile, this.tokenFile);
      });
    return this.persistingTokens;
  }

  async fetchOAuthConfig(site, sessionId) {
    const response = await this.fetchSite(endpoint(site, OAUTH_WELL_KNOWN), {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000)
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `OAuth config endpoint returned ${response.status}: ${compactApiErrorBody(text, response.headers.get("content-type") || "")}`
      );
    const config = parseJsonResponse(text);
    // Missing metadata is the legacy server contract. Malformed policy data must not enable restoration.
    const policy =
      config.client_login_policy === undefined
        ? { reauth_on_exit: false, idle_lock_time: 0, max_session_time: 0 }
        : validateClientLoginPolicy(config.client_login_policy);
    config.client_login_policy = policy;
    await this.applyClientLoginPolicy(site, sessionId, policy);
    return config;
  }

  async applyClientLoginPolicy(site, sessionId, policy) {
    let changed = false;
    for (const [key, stored] of Object.entries(this.tokens) as [string, any][]) {
      if (key !== sessionId && stored.origin !== site) continue;
      changed ||=
        stored.origin !== site ||
        JSON.stringify(stored.client_login_policy) !== JSON.stringify(policy) ||
        this.restoredSessionIds.has(key);
      stored.origin = site;
      stored.client_login_policy = policy;
      if (policy.reauth_on_exit && this.restoredSessionIds.has(key)) delete this.tokens[key];
      this.restoredSessionIds.delete(key);
    }
    if (changed) {
      await this.persistTokens();
      this.lockRevision += 1;
      this.emitEvent("client-lock-changed");
      this.emitEvent("client-login-policy", { sessionId, policy }, "main");
    }
    this.restoredSessionIds.delete(sessionId);
    return changed;
  }

  setSession({ sessionKey, origin, connectionId, orgId = "" }) {
    if (!sessionKey || !origin) throw new Error("session key and origin are required");
    origin = normalizeCompatibilitySite(origin);
    const current = this.sessions.get(this.currentSessionKey);
    const pending = this.pendingConnection;
    const approved =
      pending &&
      pending.generation === this.connectionGeneration &&
      pending.generation === connectionId &&
      pending.site === origin &&
      pending.sessionId === sessionKey;
    if (connectionId !== undefined && !approved) return { status: "stale" };
    // A renderer can update the active organization, but cannot approve a new connection.
    if (!approved && (current?.sessionKey !== sessionKey || current?.origin !== origin)) return { status: "stale" };
    const bearerToken = approved ? pending.bearer : current.bearerToken;
    this.currentSessionKey = sessionKey;
    if (approved) {
      this.sessions.set(sessionKey, {
        sessionKey,
        origin,
        bearerToken,
        orgId,
        nextCheckAt: performance.now() + CLIENT_SESSION_CHECK_INTERVAL
      });
    } else {
      // Ordinary renderer/org synchronization must preserve shared request limits.
      current.orgId = orgId;
    }
    if (approved) {
      if (this.tokens[sessionKey]) this.tokens[sessionKey].username = pending.username;
      this.pendingConnection = null;
      this.pendingCompatibility = null;
      const binding = this.sessionBinding(sessionKey);
      if (binding) binding.unlockedAt = performance.now();
      this.lockRevision += 1;
    }
    this.scheduleSessionCheck();
    electronLog.info(`auth session ${parseUrl(origin).origin}`);
    return { status: "success" };
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
    if (this.callbackServer) {
      if (!this.callbackServer.listening) await once(this.callbackServer, "listening");
      return;
    }
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
    this.callbackServer = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(14876, "127.0.0.1", resolve);
      });
      this.redirectUri = DEV_CALLBACK;
      electronLog.info(`auth callback server ${this.redirectUri}`);
    } catch (error) {
      server.close();
      this.callbackServer = null;
      if (error?.code !== "EADDRINUSE") throw error;
      throw new Error("OAuth callback port 14876 is already in use. Close the other development client and retry.");
    }
  }

  isOAuthCallbackUrl(rawUrl) {
    return isOAuthCallbackUrl(rawUrl);
  }

  handleCallback(rawUrl) {
    const parsed = parseOAuthCallback(rawUrl);
    if (!parsed) return false;
    if (!this.pendingAuth || parsed.state !== this.pendingAuth.state) {
      electronLog.warn("auth callback ignored: no matching login request");
      return false;
    }
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve(parsed);
    electronLog.info("auth callback resolved");
    return true;
  }

  cancelAuth() {
    this.connectionGeneration += 1;
    this.pendingConnection = null;
    this.pendingCompatibility = null;
    if (!this.pendingAuth) return;
    const pending = this.pendingAuth;
    this.pendingAuth = null;
    pending.resolve(null);
    electronLog.info("auth cancelled");
  }

  async requestApiResponse(
    site,
    requestPath,
    { bearerToken = "", clientLoginSessionReceipt = "", orgId = "", timeout = 30_000 } = {}
  ) {
    const url = endpoint(site, requestPath);
    const headers: Record<string, string> = { "X-TZ": timezoneOffset(), Referer: parseUrl(url).origin };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    if (bearerToken && clientLoginSessionReceipt) headers["X-JMS-Client-Login-Session"] = clientLoginSessionReceipt;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    try {
      const response = await this.fetchSite(url, { headers, cache: "no-store", signal: AbortSignal.timeout(timeout) });
      return toApiResponse(response.status, await response.text());
    } catch (error) {
      return { status: 0, data: `request failed: ${error}`, success: false };
    }
  }

  checkCompatibility({ site }) {
    return checkSiteCompatibility(site, app.getVersion(), (url, init) => this.fetchSite(url, init));
  }

  async prepareConnection(site, sessionId, compatibilityConfirmationId?: number, restoreActiveSession = false) {
    site = normalizeCompatibilitySite(site);
    if (compatibilityConfirmationId !== undefined) {
      const pending = this.pendingCompatibility;
      if (
        !pending ||
        pending.generation !== this.connectionGeneration ||
        pending.generation !== compatibilityConfirmationId ||
        pending.site !== site ||
        pending.sessionId !== sessionId
      ) {
        return { status: "stale" };
      }
      // Keep confirmation scoped to this connection, including restoration retries.
      return { status: "ready", generation: pending.generation, site };
    }
    this.cancelAuth();
    const generation = this.connectionGeneration;
    const current = restoreActiveSession ? this.sessions.get(this.currentSessionKey) : null;
    // The active connection already passed or confirmed its compatibility check.
    if (current?.sessionKey === sessionId && current.origin === site && this.tokens[sessionId]) {
      return { status: "ready", generation, site };
    }
    const compatibility = await this.checkCompatibility({ site });
    if (generation !== this.connectionGeneration) return { status: "stale" };
    if (compatibility.status !== "compatible") {
      this.pendingCompatibility = { generation, site, sessionId };
      return { status: "confirmation-required", compatibility, compatibility_confirmation_id: generation };
    }
    return { status: "ready", generation, site: compatibility.site };
  }

  approveConnection(attempt, sessionId, payload) {
    if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
    if (!payload.profile?.success) return payload;
    let profile;
    try {
      profile = JSON.parse(payload.profile.data);
    } catch {
      return { ...payload, status: "failure" };
    }
    if (!profile || typeof profile.id !== "string" || !profile.id.trim()) return { ...payload, status: "failure" };
    this.pendingConnection = {
      generation: attempt.generation,
      site: attempt.site,
      sessionId,
      bearer: payload.bearer,
      username: String(profile.username || profile.name || "")
    };
    return { ...payload, connection_id: attempt.generation };
  }

  async syncBackendLanguage({ language }) {
    if (typeof language !== "string" || !/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(language)) {
      throw new Error("Invalid language code");
    }
    this.currentLanguage = language;
    const session = this.sessions.get(this.currentSessionKey);
    if (!session) return;

    // Electron net.fetch rejects manual redirects. Follow the cookie-setting
    // endpoint's redirect, without parsing its HTML response as JSON.
    const response = await this.fetchSite(endpoint(session.origin, `/core/i18n/${language}/`), {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new Error(`Language synchronization failed: status=${response.status}`);
    }
  }

  async authLogin({ site, sessionId, compatibilityConfirmationId = undefined }) {
    const attempt = await this.prepareConnection(site, sessionId, compatibilityConfirmationId);
    if (attempt.status !== "ready") return attempt;
    site = attempt.site;
    electronLog.info(`auth login start ${site}`);
    await this.startCallbackServer();
    if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
    let oauthConfig;
    try {
      oauthConfig = await this.fetchOAuthConfig(site, sessionId);
    } catch (error) {
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      const message = `Failed to fetch OAuth config: ${error}`;
      this.emitEvent("login-failed-detected", {
        status: "failure",
        reason: "invalid-site",
        message,
        site
      });
      throw new Error(message);
    }

    if (attempt.generation !== this.connectionGeneration) return { status: "stale" };

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
    authorizeUrl.searchParams.set("client_login_policy_version", "1");

    const callback = new Promise<ReturnType<typeof parseOAuthCallback>>((resolve) => {
      this.pendingAuth = { state, resolve };
    });
    this.emitEvent("auth_url", authorizeUrl.toString());
    const result = await callback;
    if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
    if (!result) return null;
    if (result.state !== state) throw new Error("OAuth state mismatch");
    if (result.error) throw new Error(`OAuth authorization failed: ${result.error}`);

    try {
      const token = await this.exchangeToken(site, {
        grant_type: "authorization_code",
        code: result.code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier
      });
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      // Policy may change while the user authenticates in the browser. Token issuance
      // is the authoritative point; discovery is only a legacy-server fallback.
      const policy = token.client_login_policy ?? oauthConfig.client_login_policy;
      if (token.client_login_policy) await this.applyClientLoginPolicy(site, sessionId, policy);
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      const payload = {
        ...(await this.buildLoginPayload(site, token.access_token, token.client_login_session_receipt)),
        client_login_policy: policy,
        client_login_session: token.client_login_session
      };
      const approved = this.approveConnection(attempt, sessionId, payload);
      if (!approved.connection_id) {
        return approved.status === "success" ? { ...approved, status: "failure" } : approved;
      }
      this.tokens[sessionId] = {
        ...token,
        client_id: clientId,
        origin: site,
        client_login_policy: policy,
        username: JSON.parse(payload.profile.data).username,
        client_locked: false
      };
      this.restoredSessionIds.delete(sessionId);
      this.recordClientLoginSession(sessionId, token.access_token, token);
      await this.persistTokens();
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      electronLog.info(`auth login success ${site}`);
      return approved;
    } catch (error) {
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      throw error;
    }
  }

  async exchangeToken(site, parameters) {
    const response = await this.fetchSite(endpoint(site, OAUTH_TOKEN), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(parameters).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(
        `Token exchange failed: status=${response.status}, body=${compactApiErrorBody(text, response.headers.get("content-type") || "")}`
      ) as Error & { oauthError?: string; clientLoginReason?: string; clientLoginSession?: ClientLoginSession };
      error.oauthError = parseOAuthError(text);
      error.clientLoginReason = parseClientLoginReason(text);
      error.clientLoginSession = parseClientLoginSession(text);
      throw error;
    }
    const payload = parseJsonResponse(text);
    if (!payload.access_token) throw new Error("Token exchange response did not include access_token");
    const expiresIn = Number(payload.expires_in);
    return {
      access_token: String(payload.access_token),
      refresh_token: payload.refresh_token ? String(payload.refresh_token) : null,
      expires_in: Number.isFinite(expiresIn) ? expiresIn : null,
      expires_at: expiresAt(expiresIn),
      client_login_session: parseClientLoginSession(payload),
      client_login_session_receipt:
        typeof payload.client_login_session_receipt === "string" &&
        payload.client_login_session_receipt.length <= 4096 &&
        /^[A-Za-z0-9_.:-]+$/.test(payload.client_login_session_receipt)
          ? payload.client_login_session_receipt
          : "",
      ...(payload.client_login_policy !== undefined
        ? { client_login_policy: validateClientLoginPolicy(payload.client_login_policy) }
        : {})
    };
  }

  listAuthenticatedAccounts() {
    const now = Math.floor(Date.now() / 1000);
    return Object.entries(this.tokens)
      .filter(([, token]: [string, any]) =>
        Boolean(token.access_token && (!token.expires_at || token.expires_at > now || token.refresh_token))
      )
      .map(([sessionId]) => sessionId);
  }

  async freshToken(site, sessionId, provided = "") {
    const stored = this.tokens[sessionId];
    if (!stored) {
      if (provided) return provided;
      throw Object.assign(new Error(`no access token available for site ${site}`), { oauthError: "invalid_grant" });
    }
    const refreshWindow =
      Number.isFinite(stored.expires_in) && stored.expires_in > 0 ? Math.min(60, stored.expires_in / 10) : 60;
    if (!stored.expires_at || stored.expires_at > Math.floor(Date.now() / 1000) + refreshWindow)
      return stored.access_token;
    if (!stored.refresh_token)
      throw Object.assign(new Error(`refresh_token missing for site ${site}`), { oauthError: "invalid_grant" });

    const activeRefresh = this.refreshingTokens.get(sessionId);
    if (activeRefresh) return activeRefresh;

    const refresh = (async () => {
      try {
        const refreshed = await this.exchangeToken(site, {
          grant_type: "refresh_token",
          refresh_token: stored.refresh_token,
          client_id: stored.client_id || "",
          ...(stored.client_login_session_receipt
            ? { client_login_session_receipt: stored.client_login_session_receipt }
            : {})
        });
        const current = this.tokens[sessionId];
        if (current !== stored) {
          if (current?.access_token) return current.access_token;
          throw new Error(`auth session changed for site ${site}`);
        }
        this.tokens[sessionId] = {
          ...stored,
          ...refreshed,
          client_locked: stored.client_locked,
          refresh_token: refreshed.refresh_token || stored.refresh_token,
          client_id: stored.client_id || ""
        };
        // Rotation preserves the interactive login; a new OAuth login never inherits this identity.
        const binding = this.sessionBindings?.get(stored);
        if (binding) this.sessionBindings.set(this.tokens[sessionId], binding);
        if (refreshed.client_login_policy) {
          const changed = await this.applyClientLoginPolicy(site, sessionId, refreshed.client_login_policy);
          if (!changed) await this.persistTokens();
        } else {
          await this.persistTokens();
        }
        this.recordClientLoginSession(sessionId, refreshed.access_token, refreshed);
        this.recordSessionValidation(this.sessions.get(sessionId), refreshed.access_token);
        return refreshed.access_token;
      } catch (error) {
        if (error?.oauthError === "invalid_grant" && this.tokens[sessionId] === stored) {
          await this.expireSession(sessionId, error.clientLoginReason, error.clientLoginSession);
        }
        throw error;
      }
    })();
    this.refreshingTokens.set(sessionId, refresh);
    try {
      return await refresh;
    } finally {
      if (this.refreshingTokens.get(sessionId) === refresh) this.refreshingTokens.delete(sessionId);
    }
  }

  recordClientLoginSession(sessionId, bearer, payload) {
    const token = this.tokens[sessionId];
    if (!token || token.access_token !== bearer || !payload) return;
    if (typeof payload === "object" && !payload.client_login_session) return;
    const info = parseClientLoginSession(payload);
    if (!info) return;
    const previous = token.client_login_session;
    if (previous && Date.parse(previous.server_time) > Date.parse(info.server_time)) return;
    token.client_login_session = info;
    if (typeof info.locked === "boolean") {
      const locked = info.locked || token.client_lock_pending === true;
      if (token.client_locked !== locked) {
        token.client_locked = locked;
        this.lockRevision += 1;
        this.emitEvent("client-lock-changed");
        void this.persistTokens().catch((error) => electronLog.warn("failed to persist server lock", error));
      }
    }
    const binding = this.sessionBinding(sessionId);
    if (binding) binding.serverClock = { serverTime: Date.parse(info.server_time), observedAt: performance.now() };
    // Broadcast the same server snapshot to settings and main windows without another request.
    this.emitEvent("client-login-session", { sessionId, session: info });
  }

  async expireSession(sessionId, reason = "unknown", sessionInfo?: ClientLoginSession) {
    const token = this.tokens[sessionId];
    const existed = Boolean(this.tokens[sessionId] || this.sessions?.has(sessionId));
    this.lockState(this.sessionBindings?.get(token));
    delete this.tokens[sessionId];
    this.sessions?.delete(sessionId);
    if (this.currentSessionKey === sessionId) this.currentSessionKey = "";
    if (this.pendingConnection?.sessionId === sessionId) this.pendingConnection = null;
    this.scheduleSessionCheck();
    // Publish before awaiting disk IO: an old expiry must not arrive after a new login.
    if (existed)
      this.emitEvent(
        "auth-session-expired",
        {
          sessionId,
          reason,
          policy: token?.client_login_policy,
          session: sessionInfo
        },
        "main"
      );
    this.lockRevision += 1;
    this.emitEvent("client-lock-changed");
    try {
      await this.persistTokens();
    } catch (error) {
      electronLog.warn("failed to remove expired auth token", error);
    }
  }

  async handleUnauthorized(session, bearer, status, body = "") {
    let expired = status === 401;
    if (status === 403) {
      try {
        const payload = JSON.parse(body);
        if (payload?.code === "client_locked") {
          this.recordClientLoginSession(session.sessionKey, bearer, payload);
          return;
        }
        expired =
          ["not_authenticated", "authentication_failed"].includes(payload?.code) ||
          (payload?.code === "client_session_expired" &&
            (payload.client_login_reason === "unknown" || parseClientLoginReason(body) !== "unknown"));
      } catch {
        // Permission denials and non-JSON connector errors do not end authentication.
      }
    }
    if (!expired || this.tokens[session.sessionKey]?.access_token !== bearer) return;
    await this.expireSession(session.sessionKey, parseClientLoginReason(body), parseClientLoginSession(body));
  }

  async bootstrapAuthSession({ site, sessionId, compatibilityConfirmationId = undefined }) {
    const attempt = await this.prepareConnection(site, sessionId, compatibilityConfirmationId, true);
    if (attempt.status !== "ready") return attempt;
    site = attempt.site;
    try {
      // Only credentials restored from disk need a policy preflight. Active in-memory
      // sessions are already bound to the policy used by their real authentication.
      const restored = this.restoredSessionIds.has(sessionId);
      const config = restored
        ? await this.fetchOAuthConfig(site, sessionId)
        : { client_login_policy: this.tokens[sessionId]?.client_login_policy };
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      if (restored && config.client_login_policy?.reauth_on_exit && !this.tokens[sessionId]) {
        return {
          status: "auth-required",
          client_login_policy: config.client_login_policy,
          client_login_reason: "policy_changed"
        };
      }
      const bearer = await this.freshToken(site, sessionId);
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      const payload = {
        ...(await this.buildLoginPayload(site, bearer, this.tokens[sessionId]?.client_login_session_receipt)),
        client_login_policy: config.client_login_policy,
        client_login_session: this.tokens[sessionId]?.client_login_session
      };
      const status = payload.client_session_status;
      if (status?.success) this.recordClientLoginSession(sessionId, bearer, status.data);
      payload.client_login_session = this.tokens[sessionId]?.client_login_session;
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      if (payload.profile?.status === 401 || payload.profile?.status === 403) {
        const reason = parseClientLoginReason(payload.profile.data);
        const sessionInfo = parseClientLoginSession(payload.profile.data);
        await this.expireSession(sessionId, reason, sessionInfo);
        return {
          status: "auth-required",
          client_login_policy: config.client_login_policy,
          client_login_reason: reason,
          client_login_session: sessionInfo
        };
      }
      return this.approveConnection(attempt, sessionId, payload);
    } catch (error) {
      if (attempt.generation !== this.connectionGeneration) return { status: "stale" };
      if (error?.oauthError === "invalid_grant") {
        return {
          status: "auth-required",
          client_login_reason: error.clientLoginReason || "unknown",
          client_login_session: error.clientLoginSession
        };
      }
      throw error;
    }
  }

  async buildLoginPayload(site, bearer, clientLoginSessionReceipt = "") {
    const credentials = { bearerToken: bearer, clientLoginSessionReceipt };
    const [profile, permissionOrgs, currentOrg, publicSettings, clientStatus] = await Promise.all([
      this.requestApiResponse(site, USER_PROFILE, credentials),
      this.requestApiResponse(site, USER_PERMISSIONS, credentials),
      this.requestApiResponse(site, CURRENT_ORG, credentials),
      this.requestApiResponse(site, PUBLIC_SETTINGS, credentials),
      this.requestApiResponse(site, CLIENT_SESSION_STATUS, credentials)
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
      profile: clientStatus.status === 401 ? clientStatus : profile,
      client_session_status: clientStatus,
      resolved_site: site,
      current_org: currentOrg,
      xpack_license_valid: settings.XPACK_LICENSE_IS_VALID === true,
      security_command_execution: settings.SECURITY_COMMAND_EXECUTION === true,
      permission_orgs: permissionOrgs
    };
  }

  sessionBinding(sessionKey: string): ClientSessionBindingState | null {
    const token = this.tokens[sessionKey];
    if (!token?.origin) return null;
    let binding = this.sessionBindings.get(token);
    if (!binding) {
      binding = { sessionKey, origin: token.origin, unlockedAt: performance.now() };
      this.sessionBindings.set(token, binding);
    }
    return binding;
  }

  captureSessionBinding(): ClientSessionBinding | null {
    const session = this.sessions.get(this.currentSessionKey);
    if (!session || this.tokens[session.sessionKey]?.origin !== session.origin) return null;
    return this.sessionBinding(session.sessionKey);
  }

  boundToken(binding?: ClientSessionBinding | null) {
    if (!binding) return;
    const token = this.tokens[binding.sessionKey];
    if (token?.origin === binding.origin && this.sessionBindings.get(token) === binding) return token;
  }

  getBoundSession(binding?: ClientSessionBinding | null) {
    const session = binding && this.sessions.get(binding.sessionKey);
    if (session?.origin === binding?.origin && this.boundToken(binding)) return session;
    throw new Error("Client login is no longer available");
  }

  lockState(binding?: ClientSessionBinding | null) {
    const token = this.boundToken(binding);
    const state = binding as ClientSessionBindingState | null | undefined;
    if (token && state) state.locked = token.client_locked === true;
    const locked = token ? token.client_locked === true : state?.locked === true;
    return {
      locked,
      expired: locked && !token,
      revision: this.lockRevision,
      sessionId: token || locked ? binding.sessionKey : "",
      origin: token || locked ? binding.origin : "",
      username: token?.username || "",
      idleLockTime: token?.client_login_policy?.idle_lock_time || 0
    };
  }

  lockIdleSessions(idleSeconds: number) {
    if (!Number.isFinite(idleSeconds) || idleSeconds < 0) return;
    const session = this.sessions.get(this.currentSessionKey);
    const token = session && this.tokens[session.sessionKey];
    const minutes = token?.client_login_policy?.idle_lock_time;
    if (!minutes || token.client_locked) return;
    const binding = this.sessionBinding(session.sessionKey);
    if (!binding) return;
    // Switching accounts or unlocking begins a fresh interval for the active login.
    const idle = Math.min(idleSeconds, (performance.now() - binding.unlockedAt) / 1000);
    if (idle >= minutes * 60) this.lockSessions();
  }

  lockSessions(manual = false) {
    const session = this.sessions.get(this.currentSessionKey);
    const token = session && this.tokens[session.sessionKey];
    if (!token || (!manual && !token.client_login_policy?.idle_lock_time) || token.client_locked) return;
    token.client_locked = true;
    token.client_lock_pending = true;
    this.lockRevision += 1;
    this.emitEvent("client-lock-changed");
    void this.persistTokens().catch((error) => electronLog.warn("failed to persist client lock", error));
    void this.syncSessionLock(this.sessionBinding(session.sessionKey)).catch((error) =>
      electronLog.warn("client lock pending server confirmation", error)
    );
  }

  async syncSessionLock(binding: ClientSessionBinding | null | undefined) {
    const token = this.boundToken(binding);
    if (!token?.client_lock_pending) return;
    const state = binding as ClientSessionBindingState;
    if (state.lockRequest) return state.lockRequest;
    const pending = (async () => {
      const session = this.getBoundSession(binding);
      const result = await this.sendApiRequest(session, {
        method: "POST",
        path: CLIENT_SESSION_LOCK,
        timeoutMs: 10_000
      });
      const current = this.boundToken(binding);
      if (!current) return;
      current.client_lock_pending = false;
      this.recordClientLoginSession(session.sessionKey, current.access_token, result);
      await this.persistTokens();
    })();
    state.lockRequest = pending;
    try {
      await pending;
    } finally {
      if (state.lockRequest === pending) delete state.lockRequest;
    }
  }

  updatePolicyNotices(idleSeconds: number) {
    const session = this.sessions.get(this.currentSessionKey);
    const token = session && this.tokens[session.sessionKey];
    const notices = [];
    const binding = token && this.sessionBinding(session.sessionKey);
    if (binding) {
      const info = token.client_login_session;
      const deadline = info?.effective_expires_at ?? info?.expires_at;
      const expires = deadline ? Date.parse(deadline) : NaN;
      const now = binding.serverClock
        ? binding.serverClock.serverTime + performance.now() - binding.serverClock.observedAt
        : Date.now();
      if (Number.isFinite(expires)) {
        const reason = info.expiry_reason === "policy_changed" ? "policy_changed" : "absolute_timeout";
        if (expires <= now && binding.serverClock) {
          // A server-confirmed fixed deadline cannot be extended by refresh or activity.
          void this.expireSession(session.sessionKey, reason, { ...info, server_time: new Date(now).toISOString() });
          return;
        }
        if (expires > now && expires - now <= 10 * 60_000) {
          notices.push({ id: `${session.sessionKey}:${reason}:${deadline}`, kind: reason, at: deadline });
        }
      }
      const minutes = token.client_login_policy?.idle_lock_time;
      if (!token.client_locked && minutes > 0 && Number.isFinite(idleSeconds) && idleSeconds >= 0) {
        const idle = Math.min(idleSeconds, (performance.now() - binding.unlockedAt) / 1000);
        // A new input starts a new warning, including after the previous one was dismissed.
        const resumed = binding.lastIdleSeconds !== undefined && idle < binding.lastIdleSeconds;
        if (resumed) {
          binding.idleNoticeRevision = (binding.idleNoticeRevision || 0) + 1;
        }
        binding.lastIdleSeconds = idle;
        const remainingSeconds = Math.ceil(minutes * 60 - idle);
        if (!resumed && idle > 0 && remainingSeconds > 0 && remainingSeconds < 60) {
          notices.push({
            id: `${session.sessionKey}:idle:${binding.unlockedAt}:${binding.idleNoticeRevision || 0}`,
            kind: "idle_lock",
            at: new Date(Date.now() + (minutes * 60 - idle) * 1000).toISOString(),
            remainingSeconds
          });
        }
      }
    }
    const next = { sessionId: session?.sessionKey || "", notices };
    if (JSON.stringify(this.policyNotices) === JSON.stringify(next)) return;
    this.policyNotices = next;
    this.emitEvent("client-policy-notices", next);
  }

  requireLockedSession(binding: ClientSessionBinding | null | undefined) {
    const session = this.getBoundSession(binding);
    if (!this.lockState(binding).locked) throw new Error("Client login is not locked");
    return session;
  }

  async lockInfo(binding: ClientSessionBinding | null | undefined) {
    const session = this.requireLockedSession(binding);
    await this.syncSessionLock(binding);
    const result = await this.sendApiRequest(session, {
      method: "GET",
      path: CLIENT_SESSION_UNLOCK,
      timeoutMs: 10_000
    });
    this.requireLockedSession(binding);
    if (typeof result?.has_password !== "boolean" || typeof result.settings_path !== "string") {
      throw new Error("Invalid client credential response");
    }
    const url = new URL(result.settings_path, session.origin);
    if (url.origin !== new URL(session.origin).origin || url.pathname !== "/ui/") {
      throw new Error("Invalid client credential settings URL");
    }
    return { hasPassword: result.has_password, settingsUrl: url.toString() };
  }

  async unlockSession(binding: ClientSessionBinding | null | undefined, { password }) {
    this.requireLockedSession(binding);
    if (typeof password !== "string" || !password || password.length > 128) {
      throw new Error("Client lock password is required");
    }
    const state = binding as ClientSessionBindingState;
    if (state.verifying) return state.verifying;
    const revision = this.lockRevision;
    const verification = (async () => {
      const session = this.requireLockedSession(binding);
      await this.syncSessionLock(binding);
      this.requireLockedSession(binding);
      const result = await this.sendApiRequest(session, {
        method: "POST",
        path: CLIENT_SESSION_UNLOCK,
        body: { password },
        timeoutMs: 15_000
      });
      this.requireLockedSession(binding);
      if (revision !== this.lockRevision || result?.verified !== true) {
        throw new Error("Client lock changed during verification. Please try again.");
      }
      this.recordClientLoginSession(session.sessionKey, this.boundToken(binding).access_token, result);
      this.boundToken(binding).client_locked = false;
      state.unlockedAt = performance.now();
      this.lockRevision += 1;
      this.emitEvent("client-lock-changed");
      await this.persistTokens();
      return this.lockState(binding);
    })();
    state.verifying = verification;
    try {
      return await verification;
    } finally {
      if (state.verifying === verification) delete state.verifying;
    }
  }

  async logoutLockedSession(binding: ClientSessionBinding | null | undefined) {
    const session = this.requireLockedSession(binding);
    await this.logout({ site: session.origin, sessionId: session.sessionKey });
    this.emitEvent("auth-session-expired", { sessionId: session.sessionKey, reason: "logout" }, "main");
    this.emitEvent("client-lock-changed");
    return this.lockState(binding);
  }

  async apiRequest(request, binding?: ClientSessionBinding | null) {
    const session = binding ? this.getBoundSession(binding) : this.currentSession();
    if (binding && this.lockState(binding).locked) throw new Error("Client login is locked");
    return this.sendApiRequest(session, request);
  }

  async sendApiRequest(session, request, bearer = "") {
    bearer ||= await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
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
      Accept: "application/json",
      ...requestHeaders(request),
      ...clientLoginSessionHeaders(request.service === "kael" ? undefined : this.tokens?.[session.sessionKey], bearer),
      "X-TZ": timezoneOffset(),
      Referer: url.origin,
      Authorization: `Bearer ${bearer}`
    };
    const orgId = request.orgId || session.orgId;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    const hasBody = request.body !== undefined && request.body !== null;
    if (hasBody) headers["Content-Type"] = "application/json";
    const response = await this.fetchSite(url.toString(), {
      method: request.method,
      ...(request.timeoutMs !== undefined || request.service === "kael"
        ? { signal: AbortSignal.timeout(request.timeoutMs ?? 15_000) }
        : {}),
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined
    });
    const text = await response.text();
    if (!responseSucceeded(response.status)) {
      if (request.service !== "kael") await this.handleUnauthorized(session, bearer, response.status, text);
      electronLog.warn(`api ${request.method} ${url.pathname} status=${response.status}`);
      throw new Error(
        `api ${request.method} ${url.pathname}: api request failed: status=${response.status}, body=${compactApiErrorBody(text, response.headers.get("content-type") || "")}`
      );
    }
    if (!text.trim()) return null;
    if (request.responseType === "text") return text;
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
      ...requestHeaders(request),
      ...clientLoginSessionHeaders(request.service === "kael" ? undefined : this.tokens?.[session.sessionKey], bearer),
      Accept: "text/event-stream",
      "X-TZ": timezoneOffset(),
      Referer: url.origin,
      Authorization: `Bearer ${bearer}`
    };
    const orgId = request.orgId || session.orgId;
    if (orgId) headers["X-JMS-ORG"] = orgId;
    const hasBody = request.body !== undefined && request.body !== null;
    if (hasBody) headers["Content-Type"] = "application/json";
    const response = await this.fetchSite(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      signal
    });
    if (!response.ok) {
      const text = await response.text();
      if (request.service !== "kael") await this.handleUnauthorized(session, bearer, response.status, text);
      throw new Error(
        `api ${request.method} ${url.pathname}: api stream request failed: status=${response.status}, body=${compactApiErrorBody(text, response.headers.get("content-type") || "")}`
      );
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

  async createKokoConnectTicket({ baseUrl, tokenId, orgId = "" }) {
    const session = this.currentSession();
    const bearer = await this.freshToken(session.origin, session.sessionKey, session.bearerToken);
    session.bearerToken = bearer;
    const ticketOrgId = orgId || session.orgId || "";

    const base = parseUrl(baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || !base.hostname || base.username || base.password) {
      throw new Error("Koko endpoint must be an HTTP/HTTPS URL without embedded credentials");
    }

    const url = new URL("koko/api/connect-ticket/", `${base.toString().replace(/\/+$/, "")}/`);
    const response = await this.fetchSite(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "X-JMS-ORG": ticketOrgId,
        "X-TZ": timezoneOffset(),
        Referer: url.origin
      },
      body: JSON.stringify({ token_id: tokenId, org_id: ticketOrgId })
    });
    const text = await response.text();
    if (response.status !== 201) {
      electronLog.warn(`koko connect ticket failed status=${response.status}`);
      throw new Error(
        `create koko connect ticket failed: status=${response.status}, body=${compactApiErrorBody(text, response.headers.get("content-type") || "")}`
      );
    }
    electronLog.info(`koko connect ticket ${base.origin}`);
    return parseJsonResponse(text);
  }

  hasExitSessions() {
    return Object.values(this.tokens).some((token: any) => token.client_login_policy?.reauth_on_exit);
  }

  async revokeOnExit() {
    await Promise.allSettled(
      Object.entries(this.tokens)
        .filter(([, token]: [string, any]) => token.client_login_policy?.reauth_on_exit)
        .map(([sessionId, token]: [string, any]) => this.logout({ site: token.origin, sessionId, reason: "app_exit" }))
    );
  }

  async logout({ site, sessionId, reason = "logout" }) {
    electronLog.info(`auth logout ${site}`);
    const token = this.tokens[sessionId];
    this.lockState(this.sessionBindings?.get(token));
    delete this.tokens[sessionId];
    this.sessions.delete(sessionId);
    this.scheduleSessionCheck();
    if (this.currentSessionKey === sessionId) this.currentSessionKey = "";
    if (this.pendingConnection?.sessionId === sessionId) this.cancelAuth();
    await this.persistTokens();
    if (!token) return;
    const policy = token.client_login_policy;
    if (policy && (policy.reauth_on_exit || policy.idle_lock_time || policy.max_session_time)) {
      try {
        const response = await this.fetchSite(endpoint(site, CLIENT_SESSION_REVOKE), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(3_000),
          body: JSON.stringify({ reason })
        });
        if (response.ok) return;
      } catch {
        // Expired access tokens and older servers use the OAuth revocation endpoint below.
      }
    }
    if (!token.refresh_token) return;
    try {
      await this.fetchSite(endpoint(site, OAUTH_REVOKE), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(3_000),
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
