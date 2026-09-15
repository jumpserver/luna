import type { Readable } from "node:stream";
import { normalizedWebOrigin } from "@jumpserver/web-proxy/credentials";
import { createLocalCredentialSession } from "@jumpserver/web-proxy/local-credentials";
import { webProxyNavigationPolicy } from "@jumpserver/web-proxy/script";

export function standaloneLaunch() {
  return {
    targetUrl: "https://www.jumpserver.org/",
    safeMode: false,
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
  const localSession = createLocalCredentialSession(target.toString(), data.login);
  return {
    targetUrl: target.toString(),
    safeMode: data.safe_mode,
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
