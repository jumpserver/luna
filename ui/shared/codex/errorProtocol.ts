export type LocalAiErrorCode =
  | "LOCAL_AI_INVALID_SETTINGS"
  | "LOCAL_AI_EXECUTABLE_INVALID"
  | "LOCAL_AI_EXECUTABLE_NOT_FOUND"
  | "LOCAL_AI_ENGINE_NOT_INSTALLED"
  | "LOCAL_AI_ENGINE_UNAVAILABLE"
  | "LOCAL_AI_ENGINE_VERSION_UNSUPPORTED"
  | "LOCAL_AI_API_KEY_REQUIRED"
  | "LOCAL_AI_MODEL_REQUIRED"
  | "LOCAL_AI_BASE_URL_INVALID"
  | "LOCAL_AI_BASE_URL_UNSUPPORTED"
  | "LOCAL_AI_CREDENTIAL_STORAGE_UNAVAILABLE"
  | "LOCAL_AI_DISABLED"
  | "LOCAL_AI_BUSY"
  | "LOCAL_AI_TIMEOUT"
  | "LOCAL_AI_INVALID_RESPONSE"
  | "LOCAL_AI_RUNTIME_FAILED"
  | "LOCAL_AI_PROVIDER_ERROR"
  | "LOCAL_AI_INTERNAL_ERROR";

const settingsCommands = new Set([
  "local_codex_configure",
  "local_codex_probe",
  "local_codex_models",
  "local_codex_test"
]);
export const isLocalAiSettingsCommand = (command: unknown) =>
  typeof command === "string" && settingsCommands.has(command);

export interface LocalAiErrorData {
  code?: LocalAiErrorCode;
  message: string;
  status?: number;
  providerCode?: string;
  codexCode?: string;
  rpcCode?: number;
  param?: string;
}

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const status = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : undefined;

/** Read structured fields before inspecting legacy Electron or provider message bodies. */
export function readLocalAiError(error: unknown): LocalAiErrorData {
  if (error instanceof LocalAiError) return { ...error.details, code: error.code, message: error.message };
  const result: LocalAiErrorData = { message: "" };
  let current = error;
  let textStatus: number | undefined;
  for (let depth = 0; depth < 4; depth++) {
    const source = record(current) ? current : { message: current };
    const code = text(source.code);
    if (depth === 0 && code.startsWith("LOCAL_AI_")) result.code = code as LocalAiErrorCode;
    else if (code) result.providerCode = code;
    if (typeof source.code === "number") result.rpcCode = source.code;
    result.providerCode = text(source.providerCode) || result.providerCode || text(source.type) || undefined;
    result.codexCode = text(source.codexCode) || result.codexCode;
    result.param = text(source.param) || result.param;
    result.rpcCode = typeof source.rpcCode === "number" ? source.rpcCode : result.rpcCode;
    result.status ??=
      status(source.status) ??
      status(source.statusCode) ??
      status(source.httpStatusCode) ??
      status(source.data?.httpStatusCode);
    const info = source.codexErrorInfo ?? source.data?.codexErrorInfo;
    if (typeof info === "string") result.codexCode = info;
    else if (record(info)) {
      const variant = Object.keys(info)[0];
      if (variant) {
        result.codexCode = variant;
        result.status ??= status(info[variant]?.httpStatusCode);
      }
    }
    const message = text(source.message)
      .trim()
      .replace(/^(?:Error invoking remote method ['"][^'"]+['"]:\s*|(?:Error|TypeError):\s*)+/i, "");
    if (message) result.message = message;
    const bodyTexts = [message, text(source.additionalDetails)];
    textStatus ??= status(Number(bodyTexts.join("\n").match(/\b(?:HTTP\s+|status[=: ]+)([1-5]\d{2})\b/i)?.[1]));
    // IPC data is already normalized; only third-party bodies need further parsing.
    if (result.code) break;
    if (record(source.error)) {
      current = source.error;
      continue;
    }
    let parsed = false;
    for (const bodyText of bodyTexts) {
      const json = bodyText.indexOf("{");
      if (json < 0) continue;
      try {
        const body = JSON.parse(bodyText.slice(json));
        if (record(body)) {
          current = body;
          parsed = true;
          break;
        }
      } catch {
        // A provider's plain-text error remains available as the final fallback.
      }
    }
    if (!parsed) break;
  }
  result.status ??= textStatus;
  for (const key of ["status", "providerCode", "codexCode", "rpcCode", "param"] as const) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

export function serializeLocalAiError(
  error: unknown,
  fallback: LocalAiErrorCode = "LOCAL_AI_INTERNAL_ERROR",
  secret = ""
) {
  const data = readLocalAiError(error);
  if (secret) {
    for (const key of ["message", "providerCode", "codexCode", "param"] as const) {
      if (data[key]) data[key] = data[key].split(secret).join("[redacted]");
    }
  }
  return { ...data, code: data.code || fallback };
}

export class LocalAiError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
    message: string,
    readonly details: Omit<LocalAiErrorData, "code" | "message"> = {}
  ) {
    super(message);
  }
  static from(error: unknown, fallback: LocalAiErrorCode = "LOCAL_AI_INTERNAL_ERROR", secret = "") {
    const { code, message, ...details } = serializeLocalAiError(error, fallback, secret);
    return new LocalAiError(code, message, details);
  }
}

/** Electron does not preserve custom Error properties; send plain data over IPC. */
export async function withLocalAiErrors<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    return { __localAiError: serializeLocalAiError(error) };
  }
}

export function unwrapLocalAiResult<T>(result: T): T {
  const value: unknown = result;
  if (record(value) && record(value.__localAiError)) throw LocalAiError.from(value.__localAiError);
  return result;
}
