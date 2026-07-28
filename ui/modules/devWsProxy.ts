import type { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import net from "node:net";
import tls from "node:tls";
import { defineNuxtModule } from "nuxt/kit";

// In Nuxt dev, Vite runs in middleware mode so `vite.server.proxy` never sees
// WebSocket upgrades: nuxi forwards every non-HMR upgrade to the Nitro dev
// worker, which resets the socket (ECONNRESET) and makes nuxi restart Nuxt.
// This module intercepts upgrades for ws-enabled proxy routes and pipes them
// straight to the backend; everything else falls through to nuxi/Vite HMR.

export interface WsRoute {
  prefix: string
  target: URL
  rewrite?: (path: string) => string
}

export function collectWsRoutes(proxy: Record<string, unknown> | undefined): WsRoute[] {
  const routes: WsRoute[] = [];
  for (const [prefix, value] of Object.entries(proxy || {})) {
    const opts = value as { ws?: boolean, target?: unknown, rewrite?: (path: string) => string };
    if (!opts || typeof opts !== "object" || !opts.ws || typeof opts.target !== "string") continue;
    routes.push({ prefix, target: new URL(opts.target), rewrite: opts.rewrite });
  }
  // ponytail: longest-prefix-wins via sort, plenty for a dozen dev routes.
  return routes.sort((a, b) => b.prefix.length - a.prefix.length);
}

const isSecure = (target: URL) => target.protocol === "wss:" || target.protocol === "https:";

export function buildUpgradeHead(
  req: { method?: string, url?: string, headers: IncomingMessage["headers"] },
  route: WsRoute
): string {
  const path = route.rewrite ? route.rewrite(req.url || "/") : req.url || "/";
  const lines = [`${req.method || "GET"} ${path} HTTP/1.1`];
  for (const [name, value] of Object.entries(req.headers)) {
    if (name === "host" || name === "origin" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${item}`);
  }
  lines.push(`host: ${route.target.host}`);
  if (req.headers.origin) {
    lines.push(`origin: ${isSecure(route.target) ? "https" : "http"}://${route.target.host}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

export default defineNuxtModule({
  meta: { name: "dev-ws-proxy" },
  setup(_options, nuxt) {
    if (!nuxt.options.dev) return;
    const routes = collectWsRoutes(nuxt.options.vite?.server?.proxy as Record<string, unknown>);
    if (!routes.length) return;

    // The `listen` hook fires after nuxi registered its own upgrade listener
    // (which forwards to the Nitro worker) and before Vite adds its HMR one,
    // so we can wrap the existing listeners and dispatch ourselves.
    nuxt.hook("listen", (server) => {
      const fallback = server.listeners("upgrade") as ((...args: unknown[]) => void)[];
      server.removeAllListeners("upgrade");
      server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const route = routes.find((r) => req.url?.startsWith(r.prefix));
        if (!route) {
          for (const listener of fallback) listener(req, socket, head);
          return;
        }
        const secure = isSecure(route.target);
        const upstream = (secure ? tls : net).connect({
          host: route.target.hostname,
          port: Number(route.target.port) || (secure ? 443 : 80),
          rejectUnauthorized: false
        });
        const destroy = (error?: Error) => {
          if (error) console.warn(`[dev-ws-proxy:${route.prefix}]`, error.message);
          socket.destroy();
          upstream.destroy();
        };
        upstream.on(secure ? "secureConnect" : "connect", () => {
          upstream.write(buildUpgradeHead(req, route));
          if (head?.length) upstream.write(head);
          upstream.pipe(socket);
          socket.pipe(upstream);
        });
        upstream.on("error", destroy);
        socket.on("error", destroy);
      });
    });
  }
});
