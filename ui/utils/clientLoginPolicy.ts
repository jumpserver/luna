import type { ClientLoginPolicy, ClientLoginReason, ClientLoginSession } from "../types/index";
import { toIntlLocale } from "../../i18n/language";

const clientLoginReasonMessages: Record<ClientLoginReason, string> = {
  policy_changed: "Login.ExpiredPolicyChanged",
  absolute_timeout: "Login.ExpiredLifetime",
  idle_timeout: "Login.ExpiredIdle",
  security_revoke: "Login.ExpiredRevoked",
  app_exit: "Login.ExpiredAppExit",
  logout: "Login.ExpiredLogout",
  unknown: "Login.ExpiredUnknown"
};

export const normalizeClientLoginReason = (reason: unknown): ClientLoginReason =>
  typeof reason === "string" && Object.hasOwn(clientLoginReasonMessages, reason)
    ? (reason as ClientLoginReason)
    : "unknown";

export const clientLoginReasonMessageKey = (reason: unknown) =>
  clientLoginReasonMessages[normalizeClientLoginReason(reason)];

export const clientLoginPolicyEnabled = (policy?: ClientLoginPolicy) =>
  Boolean(policy && (policy.reauth_on_exit || policy.max_idle_time || policy.max_session_time));

export function formatClientLoginTimestamp(value: string | null | undefined, locale = "en"): string {
  const timestamp = typeof value === "string" && value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(timestamp);
}

export function formatClientLoginDuration(seconds: number, locale = "en"): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  let remaining = Math.floor(seconds);
  const parts: string[] = [];
  for (const [unit, size] of [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ] as const) {
    const value = Math.floor(remaining / size);
    remaining %= size;
    if (value || (unit === "second" && !parts.length)) {
      parts.push(
        new Intl.NumberFormat(toIntlLocale(locale), { style: "unit", unit, unitDisplay: "long" }).format(value)
      );
    }
  }
  return new Intl.ListFormat(toIntlLocale(locale), { style: "short", type: "unit" }).format(parts);
}

/** Explain a server-confirmed expiry using the same server snapshot, without trusting the local clock. */
export function clientLoginExpiryMessage(
  reason: unknown,
  _policy?: ClientLoginPolicy,
  session?: ClientLoginSession,
  locale = "en"
): { key: string; params: Record<string, string> } {
  const fallback = { key: clientLoginReasonMessageKey(reason), params: {} };
  if (!session) return fallback;
  const now = Date.parse(session.server_time);
  if (!Number.isFinite(now)) return fallback;
  if (reason === "absolute_timeout") {
    const expiresAt = session.expires_at ? Date.parse(session.expires_at) : NaN;
    if (Number.isFinite(expiresAt) && now >= expiresAt) {
      return {
        key: "Login.ExpiredLifetimeDetail",
        params: {
          expiresAt: formatClientLoginTimestamp(session.expires_at, locale)
        }
      };
    }
  }
  if (reason === "idle_timeout") {
    const lastActivity = Date.parse(session.last_activity_at);
    const idleDeadline = session.idle_expires_at ? Date.parse(session.idle_expires_at) : NaN;
    const limitSeconds = (idleDeadline - lastActivity) / 1000;
    const idleSeconds = (now - lastActivity) / 1000;
    if (Number.isFinite(limitSeconds) && limitSeconds > 0 && now >= idleDeadline) {
      return {
        key: "Login.ExpiredIdleDetail",
        params: {
          duration: formatClientLoginDuration(idleSeconds, locale),
          limit: formatClientLoginDuration(limitSeconds, locale)
        }
      };
    }
  }
  return fallback;
}

// Keep remembered account preferences, but never serialize a process-only bearer credential.
export function serializeUserInfo(state: unknown): string {
  return JSON.stringify(state, (_key, value) => {
    if (value && typeof value === "object" && value.clientLoginPolicy?.reauth_on_exit && "bearerToken" in value) {
      return { ...value, bearerToken: "" };
    }
    return value;
  });
}
