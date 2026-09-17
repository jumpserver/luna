import type { FaceLiveHostMessage, FaceLivePageMode } from "~/types/face";

export const FACE_LIVE_MESSAGE_SOURCE = "jumpserver-facelive" as const;
export const FACE_CAPTURE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const trimPath = (path: string) => {
  const normalized = `/${String(path || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
};

export function isFaceCaptureToken(value: unknown): value is string {
  return typeof value === "string" && FACE_CAPTURE_TOKEN_PATTERN.test(value.trim());
}

export function resolveJumpServerPrefix(sitePath = "/", rendererPath = "/") {
  for (const candidate of [rendererPath, sitePath]) {
    const normalized = trimPath(candidate);
    const match = normalized.match(/^(.*)\/(?:luna|core|ui)(?:\/|$)/);
    if (match) return trimPath(match[1] || "");
  }

  return trimPath(sitePath);
}

export function buildFaceLivePageUrl(options: {
  mode?: FaceLivePageMode;
  rendererPath?: string;
  siteUrl: string;
  token: string;
}) {
  const site = new URL(options.siteUrl);
  const prefix = resolveJumpServerPrefix(site.pathname, options.rendererPath);
  const mode = options.mode || "capture";
  site.pathname = `${prefix}/luna/facelive/${mode}`.replace(/\/{2,}/g, "/");
  site.search = "";
  site.hash = "";
  site.searchParams.set("token", options.token);
  return site.href;
}

export function buildFaceLiveRendererPageUrl(options: {
  rendererUrl: string;
  siteUrl: string;
  token: string;
  mode?: FaceLivePageMode;
}) {
  const page = new URL(options.rendererUrl);
  const prefix = resolveJumpServerPrefix(page.pathname, page.pathname);
  page.pathname = `${prefix}/luna/facelive/${options.mode || "capture"}`.replace(/\/{2,}/g, "/");
  page.search = "";
  page.hash = "";
  page.searchParams.set("token", options.token);
  page.searchParams.set("site", options.siteUrl);
  return page.href;
}

export function buildFaceLiveWebSocketUrl(options: {
  mode: FaceLivePageMode;
  rendererPath?: string;
  siteUrl: string;
  socketBaseUrl?: string;
  token: string;
}) {
  const page = new URL(options.siteUrl);
  const socketBaseUrl = options.socketBaseUrl?.trim();
  const site = socketBaseUrl ? new URL(socketBaseUrl, page) : page;
  const prefix = resolveJumpServerPrefix(site.pathname, socketBaseUrl ? site.pathname : options.rendererPath);
  site.protocol = ["https:", "wss:"].includes(site.protocol) ? "wss:" : "ws:";
  site.username = "";
  site.password = "";
  site.pathname = `${prefix}/ws/facelive/capture/`.replace(/\/{2,}/g, "/");
  site.search = "";
  site.hash = "";
  site.searchParams.set("token", options.token);
  site.searchParams.set("mode", options.mode);
  return site.href;
}

export function isFaceLiveHostMessage(value: unknown): value is FaceLiveHostMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<FaceLiveHostMessage>;
  return (
    message.source === FACE_LIVE_MESSAGE_SOURCE &&
    typeof message.event === "string" &&
    (message.mode === "capture" || message.mode === "monitor")
  );
}

export function createFaceMonitorToken(cryptoApi: Crypto = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID().replaceAll("-", "");
  if (typeof cryptoApi?.getRandomValues !== "function") throw new Error("Secure random values are unavailable");

  const bytes = cryptoApi.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

const monitorTokens = new Map<string, string>();

export function getOrCreateFaceMonitorToken(scope: string) {
  const key = scope || "default";
  const existing = monitorTokens.get(key);
  if (existing) return existing;
  const token = createFaceMonitorToken();
  monitorTokens.set(key, token);
  return token;
}

export function collectActiveFaceMonitorTokens(
  tabs: Array<{
    panes?: Array<{
      status?: string;
      payload?: unknown;
    }>;
  }>
) {
  const tokens = new Map<string, number>();
  for (const tab of tabs) {
    for (const pane of tab.panes || []) {
      if (["disconnected", "failed"].includes(String(pane.status || ""))) continue;
      if (!pane.payload || typeof pane.payload !== "object") continue;
      const payload = pane.payload as Record<string, unknown>;
      const nestedToken = payload.token && typeof payload.token === "object" ? payload.token : null;
      const value = payload.face_monitor_token ?? (nestedToken as Record<string, unknown> | null)?.face_monitor_token;
      if (!isFaceCaptureToken(value)) continue;
      tokens.set(value, (tokens.get(value) || 0) + 1);
    }
  }
  return Array.from(tokens, ([token, sessions]) => ({ token, sessions }));
}
