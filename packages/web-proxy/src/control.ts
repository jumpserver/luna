import http from "node:http";

function controlUrl(proxyUrl, path) {
  let proxy: URL;
  try {
    proxy = proxyUrl instanceof URL ? proxyUrl : new URL(proxyUrl);
  } catch (cause) {
    throw new Error("Koko Web Proxy 地址不是有效 URL", { cause });
  }
  if (proxy.protocol !== "http:" || !proxy.hostname || proxy.username || proxy.password) {
    throw new Error("Koko Web Proxy 地址必须是不含凭据的 HTTP URL");
  }

  const target = new URL(path, proxy);
  if (target.origin !== proxy.origin || !target.pathname.startsWith("/_jumpserver/")) {
    throw new Error("无效的 Koko Web Proxy 控制接口地址");
  }
  return {
    proxy,
    target
  };
}

interface WebProxyControlOptions {
  body?: string | Uint8Array | null;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
  proxyAuth?: { username: string; password: string };
}

export async function requestWebProxyControl(proxyUrl, path, options: WebProxyControlOptions = {}): Promise<Response> {
  const { proxy, target } = controlUrl(proxyUrl, path);
  const body = options.body == null ? null : Buffer.from(options.body);
  const headers = { ...options.headers };
  if (options.proxyAuth) {
    headers["Proxy-Authorization"] =
      `Basic ${Buffer.from(`${options.proxyAuth.username}:${options.proxyAuth.password}`).toString("base64")}`;
  }
  if (body && !Object.keys(headers).some((name) => name.toLowerCase() === "content-length")) {
    headers["content-length"] = String(body.length);
  }

  return await new Promise<Response>((resolve, reject) => {
    const request = http.request(
      {
        hostname: proxy.hostname.replace(/^\[|\]$/g, ""),
        port: proxy.port || 80,
        method: options.method || "GET",
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host },
        signal: options.signal
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 500;
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(name, item);
            } else if (value !== undefined) {
              responseHeaders.set(name, String(value));
            }
          }
          const responseBody = [101, 204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
          resolve(
            new Response(responseBody, {
              status,
              statusText: response.statusMessage,
              headers: responseHeaders
            })
          );
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}
