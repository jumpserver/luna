import type { Readable } from "node:stream";
import { normalizedWebOrigin } from "@jumpserver/web-proxy/credentials";
import { createLocalCredentialSession } from "@jumpserver/web-proxy/local-credentials";
import { webProxyNavigationPolicy } from "@jumpserver/web-proxy/script";

export function standaloneLaunch() {
  return {
    language: undefined as string | undefined,
    targetUrl: "https://www.jumpserver.org/",
    safeMode: false,
    allowedUrls: [],
    localSession: null,
    standalone: true
  };
}

export function parseLaunch(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("缺少 Web applet 启动参数");
  // AppletArgs is shared by all applets. Only WebLite interprets Web asset settings.
  const data: Record<string, unknown> = "asset" in value ? appletLaunchData(value) : (value as Record<string, unknown>);
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
  const localSession = createLocalCredentialSession(target.toString(), data.login);
  return {
    language: typeof data.language === "string" ? data.language : undefined,
    targetUrl: target.toString(),
    safeMode: data.safe_mode,
    allowedUrls,
    localSession,
    standalone: false
  };
}

function appletLaunchData(data: Record<string, unknown>) {
  const object = (value: unknown): Record<string, any> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Applet 连接数据无效");
    return value;
  };
  const protocol = data.protocol;
  if (protocol !== "http" && protocol !== "https") throw new Error("Applet 连接协议不是 HTTP/HTTPS");
  const asset = object(data.asset);
  const raw = asset.address;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) throw new Error("Web 资产地址无效");
  const address = raw.trim();
  const target = new URL(address.includes("://") ? address : `${protocol}://${address}`);
  normalizedWebOrigin(target);
  const protocols = (value: unknown): Record<string, any>[] => {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error("Applet 协议配置无效");
    return value.map(object);
  };
  const port = protocols(asset.protocols).find((item) => item.name === protocol)?.port;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error("Web 资产端口无效");
  // URL.port omits explicit default ports. Preserve a port explicitly supplied in the address.
  const authority = (address.includes("://") ? address.split("://")[1] : address).split(/[/?#]/)[0];
  if (!/:\d+$/.test(authority) && port) target.port = String(port);
  const platform = data.platform == null ? {} : object(data.platform);
  const setting = object(protocols(platform.protocols).find((item) => item.name === protocol)?.setting ?? {});
  const spec = object(asset.spec_info ?? {});
  const account = data.account == null ? {} : object(data.account);
  const anonymous = account.username === "@ANON";
  const config = anonymous ? { autofill: "none" } : spec.autofill ? spec : setting;
  return {
    language: object(data.connect_options ?? {}).lang,
    target_url: target.toString(),
    safe_mode: setting.safe_mode ?? false,
    allowed_urls: spec.allowed_urls,
    login: {
      config,
      username: anonymous ? "" : account.username,
      password: anonymous ? "" : account.secret,
      secret_type: account.secret_type == null ? undefined : object(account.secret_type).value
    }
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
