import type { ConnectionTokenReuseResponse, TokenResponse } from "~/types";

export const DATABASE_GUIDE_PROTOCOLS = new Set([
  "mysql",
  "mariadb",
  "postgresql",
  "redis",
  "oracle",
  "sqlserver",
  "mongodb"
]);

export function isDatabaseGuideProtocol(protocol: string | undefined) {
  return DATABASE_GUIDE_PROTOCOLS.has((protocol || "").toLowerCase());
}

export function shouldShowConnectionTokenReuse(enabled: boolean | undefined, tokenId?: string) {
  return enabled === true && Boolean(tokenId);
}

export function applyConnectionTokenReuse<T extends Pick<TokenResponse, "id" | "date_expired" | "is_reusable">>(
  token: T,
  result: ConnectionTokenReuseResponse
): T {
  return Object.assign(token, {
    id: result.id || token.id,
    date_expired: result.date_expired,
    is_reusable: result.is_reusable
  });
}

function firstErrorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstErrorMessage(item);
      if (message) return message;
    }
  }
  return "";
}

function asRequestError(error: unknown): { status: number; data: unknown; message: string } | null {
  if (!error || typeof error !== "object") return null;
  const status = Number((error as { status?: unknown }).status);
  if (!Number.isFinite(status)) return null;
  return {
    status,
    data: "data" in error ? (error as { data: unknown }).data : undefined,
    message: error instanceof Error ? error.message : firstErrorMessage((error as { message?: unknown }).message)
  };
}

export function resolveConnectionTokenReuseError(error: unknown, translate: (key: string) => string): string {
  const requestError = asRequestError(error);
  if (requestError) {
    if (requestError.status === 404) return translate("ConnectionGuide.TokenExpired");

    const data = requestError.data;
    const message =
      firstErrorMessage(data) ||
      (data && typeof data === "object"
        ? firstErrorMessage((data as Record<string, unknown>).msg) ||
          firstErrorMessage((data as Record<string, unknown>).detail) ||
          firstErrorMessage((data as Record<string, unknown>).error) ||
          firstErrorMessage((data as Record<string, unknown>).is_reusable) ||
          firstErrorMessage((data as Record<string, unknown>).non_field_errors)
        : "");
    if (message) {
      return /token expired/i.test(message) ? translate("ConnectionGuide.TokenExpired") : message;
    }
    if (requestError.message) return requestError.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return translate("ConnectionGuide.TokenExpired");
}
