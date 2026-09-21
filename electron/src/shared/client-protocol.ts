import type { App } from "electron";
import path from "node:path";

// The legacy client owns jms://. Keep registration and OAuth on the new scheme.
export const CLIENT_PROTOCOL = "jms2";
export const CLIENT_AUTH_CALLBACK = `${CLIENT_PROTOCOL}://auth/callback`;

export function normalizeClientProtocolUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return;
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (/^jms2%3a/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return;
    }
  }
  // Do not serialize asset URLs with URL: their base64 payload is case-sensitive.
  if (/^jms2:\/\//i.test(value)) return `${CLIENT_PROTOCOL}:${value.slice(value.indexOf(":") + 1)}`;
}

export interface ClientProtocolPayload {
  protocol?: string;
  asset?: { id?: unknown; [key: string]: unknown };
  token?: { id?: unknown; protocol?: string; [key: string]: unknown };
  file?: { content?: unknown; [key: string]: unknown };
  endpoint?: { host?: unknown; port?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

export function decodeClientProtocolPayload(raw: unknown): ClientProtocolPayload {
  const value = normalizeClientProtocolUrl(raw);
  const encoded = value?.startsWith(`${CLIENT_PROTOCOL}://`) ? value.slice(`${CLIENT_PROTOCOL}://`.length) : "";
  if (!encoded) throw new Error("invalid local client URL scheme");
  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("payload must be an object");
    return payload as ClientProtocolPayload;
  } catch (error) {
    throw new Error(`decode local client payload failed: ${error instanceof Error ? error.message : error}`);
  }
}

export function isWebAssetClientProtocolPayload(payload: ClientProtocolPayload) {
  return (
    ["http", "https"].includes(String(payload.protocol || "").toLowerCase()) &&
    typeof payload.asset?.id === "string" &&
    Boolean(payload.asset.id.trim())
  );
}

export function findClientProtocolUrl(argv: string[], additionalData?: unknown): string | undefined {
  if (additionalData && typeof additionalData === "object" && "protocolUrl" in additionalData) {
    const forwarded = normalizeClientProtocolUrl(additionalData.protocolUrl);
    if (forwarded) return forwarded;
  }
  for (const argument of argv) {
    const url = normalizeClientProtocolUrl(argument);
    if (url) return url;
  }
}

export function registerClientProtocol(
  app: Pick<App, "setAsDefaultProtocolClient">,
  runtime: Pick<NodeJS.Process, "platform" | "execPath" | "argv" | "defaultApp"> = process
) {
  if (runtime.defaultApp) {
    // macOS cannot launch an unpackaged Electron.app with our entry point.
    if (runtime.platform !== "win32" || !runtime.argv[1]) return;
    return app.setAsDefaultProtocolClient(CLIENT_PROTOCOL, runtime.execPath, [path.win32.resolve(runtime.argv[1])]);
  }
  return app.setAsDefaultProtocolClient(CLIENT_PROTOCOL);
}
