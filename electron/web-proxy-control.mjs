import http from "node:http";

function controlUrl(proxyUrl, path) {
  const proxy = proxyUrl instanceof URL ? proxyUrl : new URL(proxyUrl);
  if (proxy.protocol !== "http:" || !proxy.hostname || proxy.username || proxy.password) {
    throw new Error("Koko Web Proxy 地址必须是不含凭据的 HTTP URL");
  }

  const port = proxy.port || "80";
  return {
    proxy,
    target: new URL(path, `http://127.0.0.1:${port}/`)
  };
}

export async function requestWebProxyControl(proxyUrl, path, options = {}) {
  const { proxy, target } = controlUrl(proxyUrl, path);
  const body = options.body == null ? null : Buffer.from(options.body);
  const headers = { ...options.headers };
  if (body && !Object.keys(headers).some((name) => name.toLowerCase() === "content-length")) {
    headers["content-length"] = String(body.length);
  }

  return await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: proxy.hostname,
        port: proxy.port || 80,
        method: options.method || "GET",
        path: target.href,
        headers: { ...headers, host: target.host },
        signal: options.signal
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 500;
          resolve(
            new Response([101, 204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
              status,
              statusText: response.statusMessage,
              headers: response.headers
            })
          );
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}
