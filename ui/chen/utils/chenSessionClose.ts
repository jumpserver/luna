export const CHEN_ADMIN_TERMINATE_REASON = "admin_terminate";
export const CHEN_BACKEND_DISCONNECT_MESSAGE = "Chen session disconnected by backend";

export interface ChenSessionCloseFatal {
  message: string;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readChenSessionClosePayload(data: unknown) {
  if (!isRecord(data)) {
    return { reason: "", terminatedBy: "" };
  }

  return {
    reason: typeof data.reason === "string" ? data.reason : "",
    terminatedBy: typeof data.terminatedBy === "string" ? data.terminatedBy.trim() : ""
  };
}

export function resolveChenSessionCloseFatal(
  data: unknown,
  translate: (key: string, values?: Record<string, unknown>) => string
): ChenSessionCloseFatal {
  const payload = readChenSessionClosePayload(data);
  if (payload.reason !== CHEN_ADMIN_TERMINATE_REASON) {
    return { message: CHEN_BACKEND_DISCONNECT_MESSAGE, reason: "" };
  }

  return {
    message: translate("Chen.TerminatedByAdmin", { name: payload.terminatedBy }),
    reason: CHEN_ADMIN_TERMINATE_REASON
  };
}
