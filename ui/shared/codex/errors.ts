import { localAiMessages } from "./messages";
import { readLocalAiError } from "./errorProtocol";
import type { LocalAiErrorCode } from "./errorProtocol";

const internalMessages: Record<
  Exclude<LocalAiErrorCode, "LOCAL_AI_PROVIDER_ERROR">,
  keyof typeof localAiMessages.en.errors
> = {
  LOCAL_AI_INVALID_SETTINGS: "settingsInvalid",
  LOCAL_AI_EXECUTABLE_INVALID: "executableInvalid",
  LOCAL_AI_EXECUTABLE_NOT_FOUND: "executableNotFound",
  LOCAL_AI_ENGINE_NOT_INSTALLED: "engineNotInstalled",
  LOCAL_AI_ENGINE_UNAVAILABLE: "engineUnavailable",
  LOCAL_AI_ENGINE_VERSION_UNSUPPORTED: "engineVersionUnsupported",
  LOCAL_AI_API_KEY_REQUIRED: "apiKeyRequired",
  LOCAL_AI_MODEL_REQUIRED: "modelRequired",
  LOCAL_AI_BASE_URL_INVALID: "baseUrlInvalid",
  LOCAL_AI_BASE_URL_UNSUPPORTED: "baseUrlUnsupported",
  LOCAL_AI_CREDENTIAL_STORAGE_UNAVAILABLE: "credentialStorageUnavailable",
  LOCAL_AI_DISABLED: "disabled",
  LOCAL_AI_BUSY: "busy",
  LOCAL_AI_TIMEOUT: "timeout",
  LOCAL_AI_INVALID_RESPONSE: "responseInvalid",
  LOCAL_AI_RUNTIME_FAILED: "runtimeFailed",
  LOCAL_AI_INTERNAL_ERROR: "failed"
};

/** Friendly messages for local AI configuration actions. */
export function formatLocalAiError(error: unknown, locale = "en") {
  const messages = (localAiMessages[locale as keyof typeof localAiMessages] || localAiMessages.en).errors;
  const { code, message, status, providerCode, codexCode, rpcCode, param } = readLocalAiError(error);
  if (code && code !== "LOCAL_AI_PROVIDER_ERROR") {
    const key = internalMessages[code];
    return key ? messages[key] : messages.failed;
  }
  if (
    status === 401 ||
    codexCode === "unauthorized" ||
    ["invalid_api_key", "authentication_error", "unauthorized"].includes(providerCode || "")
  )
    return messages.authenticationFailed;
  if (status === 403) return messages.permissionDenied;
  if (status === 429 || codexCode === "rateLimitExceeded" || providerCode === "rate_limit_exceeded")
    return messages.rateLimited;
  if (codexCode === "modelNotFound" || ["model_not_found", "model_not_available"].includes(providerCode || ""))
    return messages.modelUnavailable;
  if (
    (status && status >= 500) ||
    ["internalServerError", "serverOverloaded", "flexUnavailable"].includes(codexCode || "")
  )
    return messages.serviceUnavailable;
  // Generic badRequest/invalid_request codes do not identify a specific field; inspect the detail.
  if (
    ["unsupported_reasoning_effort", "invalid_reasoning_effort"].includes(providerCode || "") ||
    (param && /reasoning[_. ]?effort/i.test(param)) ||
    (/reasoning[_ ]effort/i.test(message) &&
      /must be|unsupported|not supported|invalid|does not support/i.test(message))
  ) {
    const allowed = message.match(/must be\s+(.+?)(?:,?\s+(?:or\s+)?an integer\b|\s+in\b|[.;]|$)/i)?.[1];
    const levels = [...new Set(allowed?.match(/\b(?:none|minimal|low|medium|high|xhigh|max|ultra)\b/gi) || [])];
    return levels.length
      ? messages.reasoningAllowed.replace("{levels}", levels.join(" / "))
      : messages.reasoningUnsupported;
  }
  if (/requested model is unavailable|model_not_found/i.test(message)) return messages.modelUnavailable;
  if (/\bHTTP\s+401\b|\b401 Unauthorized\b/i.test(message)) return messages.authenticationFailed;
  if (
    status === 400 ||
    codexCode === "badRequest" ||
    [-32600, -32602].includes(rpcCode ?? 0) ||
    ["invalid_request", "invalid_request_error"].includes(providerCode || "")
  )
    return messages.requestInvalid;
  return message || messages.failed;
}
