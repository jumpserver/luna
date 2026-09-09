import type { Readable } from "node:stream";
import { normalizedWebOrigin } from "@jumpserver/web-proxy/credentials";
import { createLocalCredentialSession } from "@jumpserver/web-proxy/local-credentials";
import { webProxyNavigationPolicy } from "@jumpserver/web-proxy/script";

export function standaloneLaunch() {
  return {
    targetUrl: "https://www.jumpserver.org/",
    proxyUrl: "",
    tokenId: "",
    tokenValue: "",
    safeMode: false,
    recordingEnabled: false,
    allowedUrls: [],
    localSession: null,
    standalone: true
  };
}

export function parseLaunch(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("缺少 Web applet 启动参数");
  const data = value as Record<string, unknown>;
  const text = (key: string, max = 2048) => {
    const value = data[key];
    if (typeof value !== "string" || !value || value.length > max) throw new Error(`无效启动参数：${key}`);
    return value;
  };
  const target = new URL(text("target_url"));
  normalizedWebOrigin(target);
  const allowedUrls = data.allowed_urls === undefined ? [] : data.allowed_urls;
  webProxyNavigationPolicy(target, allowedUrls);
  if (typeof data.safe_mode !== "boolean") throw new Error("缺少安全模式配置");
  if (data.recording_enabled !== undefined && typeof data.recording_enabled !== "boolean")
    throw new Error("录像开关无效");
  const recordingEnabled = data.recording_enabled === true;
  let proxyUrl = "";
  let tokenId = "";
  let tokenValue = "";
  if (recordingEnabled) {
    const proxy = new URL(text("proxy_url"));
    if (
      proxy.protocol !== "http:" ||
      !proxy.hostname ||
      proxy.username ||
      proxy.password ||
      proxy.search ||
      proxy.hash ||
      proxy.pathname !== "/"
    )
      throw new Error("Koko Web Proxy 地址无效");
    proxyUrl = proxy.origin;
    tokenId = text("token_id", 256);
    tokenValue = text("token_value", 512);
  }
  const localSession = recordingEnabled ? null : createLocalCredentialSession(target.toString(), data.login);
  return {
    targetUrl: target.toString(),
    proxyUrl,
    tokenId,
    tokenValue,
    safeMode: data.safe_mode,
    recordingEnabled,
    allowedUrls,
    localSession,
    standalone: false
  };
}

export async function readLaunch(input: Readable) {
  // A terminal or an inherited null stdin means the executable was launched
  // directly instead of by Tinker.
  if ((input as Readable & { isTTY?: boolean }).isTTY) return standaloneLaunch();
  // Bounded inherited pipe; credentials never enter process arguments or files.
  // 128 script steps plus the account secret must fit in this envelope.
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => input.destroy(new Error("等待启动参数超时")), 15_000);
  try {
    for await (const chunk of input) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 1_048_576) throw new Error("启动参数过长");
      chunks.push(buffer);
    }
    if (size === 0) return standaloneLaunch();
    return parseLaunch(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally {
    clearTimeout(timer);
    for (const chunk of chunks) chunk.fill(0);
  }
}
