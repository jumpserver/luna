import type { ClientLoginPolicy, ClientLoginReason } from "../types/index";

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

// Keep remembered account preferences, but never serialize a process-only bearer credential.
export function serializeUserInfo(state: unknown): string {
  return JSON.stringify(state, (_key, value) => {
    if (value && typeof value === "object" && value.clientLoginPolicy?.reauth_on_exit && "bearerToken" in value) {
      return { ...value, bearerToken: "" };
    }
    return value;
  });
}
