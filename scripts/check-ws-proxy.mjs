// Self-check for ui/modules/devWsProxy.ts (run: node scripts/check-ws-proxy.mjs)
// Requires Node >= 22.18 (native TypeScript type stripping).
import assert from "node:assert/strict";

const { collectWsRoutes, buildUpgradeHead } = await import("../ui/modules/devWsProxy.ts");

const routes = collectWsRoutes({
  "/koko/": { target: "http://localhost:5050", ws: true },
  "/koko/ws/": { target: "ws://localhost:5050", ws: true },
  "/api/": { target: "http://localhost:8080" },
  "/luna/koko/": {
    target: "http://localhost:5050",
    ws: true,
    rewrite: (path) => path.replace(/^\/luna/, "")
  }
});

assert.equal(routes.length, 3, "non-ws routes must be skipped");
assert.equal(routes[0].prefix, "/luna/koko/", "longest prefix must sort first");

const match = (url) => routes.find((r) => url.startsWith(r.prefix));
assert.equal(match("/koko/ws/terminal/?token=x").prefix, "/koko/ws/");
assert.equal(match("/luna/koko/ws/terminal/").prefix, "/luna/koko/");
assert.equal(match("/api/v1/x"), undefined);

const head = buildUpgradeHead(
  {
    method: "GET",
    url: "/luna/koko/ws/terminal/?token=x",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      upgrade: "websocket",
      "sec-websocket-key": "abc"
    }
  },
  match("/luna/koko/ws/terminal/?token=x")
);

assert.ok(head.startsWith("GET /koko/ws/terminal/?token=x HTTP/1.1\r\n"), "rewrite must strip /luna");
assert.ok(head.includes("\r\nhost: localhost:5050\r\n"), "host must point at target");
assert.ok(head.includes("\r\norigin: http://localhost:5050"), "origin must be rewritten");
assert.ok(!head.includes("localhost:3000"), "no dev-server host may leak upstream");
assert.ok(head.includes("sec-websocket-key: abc"), "ws handshake headers must pass through");
assert.ok(head.endsWith("\r\n\r\n"), "request head must be terminated");

// Check the actual dev gateway configuration, not only synthetic routes.
globalThis.defineNuxtConfig = (config) => config;
const { default: config } = await import("../nuxt.config.ts");
delete globalThis.defineNuxtConfig;
const proxy = config.vite.server.proxy;
const configuredRoutes = collectWsRoutes(proxy);
for (const [path, prefix] of [
  ["/koko/ws/terminal/", "/koko/"],
  ["/koko/ws/sftp/", "/koko/"],
  ["/koko/ws/monitor/", "/koko/"],
  ["/koko/lion/ws/connect/", "/koko/lion/"],
  ["/chen/ws/session", "/chen"]
]) {
  assert.equal(configuredRoutes.find((route) => path.startsWith(route.prefix))?.prefix, prefix);
  assert.equal(configuredRoutes.find((route) => route.prefix === prefix)?.target.origin, proxy[prefix].target);
}

const handlers = [];
proxy["/api/"].configure({
  on: (event, handler) => {
    if (event === "proxyReq") handlers.push(handler);
  }
});
for (const [path, expectedHost] of [
  ["/api/v1/terminal/endpoints/smart/?protocol=http", "127.0.0.1:3000"],
  ["/api/v1/users/profile/", new URL(proxy["/api/"].target).host]
]) {
  const headers = { host: new URL(proxy["/api/"].target).host };
  const request = {
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    }
  };
  for (const handler of handlers) handler(request, { url: path, headers: { host: "127.0.0.1:3000" } });
  assert.equal(headers.host, expectedHost, "default endpoint must retain the dev gateway host");
  assert.equal(headers.origin, new URL(proxy["/api/"].target).origin);
}

console.log("check-ws-proxy: all assertions passed");
