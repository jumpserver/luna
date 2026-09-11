import type { JmsComponent } from "./types/component";
import type { ConnectorSessionContext } from "./types/session";
import { buildWsQueryParams, toWsOrigin } from "./utils/wsQuery";

const WS_PREFIX: Record<JmsComponent, string> = {
  koko: "/koko/ws/",
  chen: "/chen/ws/",
  lion: "/koko/lion/ws/",
  tinker: "/koko/lion/ws/",
  default: "/koko/ws/"
};

export interface ConnectorEndpoint {
  value?: string;
  host?: string;
  port?: string | number;
  http_port?: string | number;
  https_port?: string | number;
  web_proxy_port?: string | number;
}

function httpOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Connector endpoint must be an HTTP/HTTPS URL without credentials");
  }
  return url;
}

// Port 0 is Core's default endpoint convention: inherit the site's port.
// Explicit endpoint addresses are never rewritten based on the runtime or hostname.
export function resolveEndpointUrl(
  endpoint: ConnectorEndpoint,
  site: string,
  protocol?: string,
  portField?: "http_port" | "https_port" | "web_proxy_port"
) {
  if (endpoint.value && !portField) return httpOrigin(endpoint.value).origin;
  const base = httpOrigin(site);
  const scheme = (protocol || base.protocol).replace(/:$/, "");
  const host = endpoint.host || base.hostname;
  const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const url = httpOrigin(`${scheme}://${authority}`);
  if (url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid endpoint host");
  const field = portField || (scheme === "https" ? "https_port" : "http_port");
  const port = endpoint[field] ?? endpoint.port;
  if (port != null && port !== "") {
    const number = Number(port);
    if (!/^\d+$/.test(String(port)) || !Number.isInteger(number) || number < 0 || number > 65535) {
      throw new Error("Invalid endpoint port");
    }
    url.port = number === 0 ? base.port : String(number);
  } else if (!endpoint.host && base.protocol === url.protocol) {
    url.port = base.port;
  }
  return url.origin;
}

export function resolveWsUrl(component: JmsComponent, wsRoute: string, ctx: ConnectorSessionContext) {
  const params = buildWsQueryParams({
    token: ctx.tokenId,
    ticket: ctx.ticket,
    disableautohash: ctx.disableAutoHash,
    ...ctx.wsQuery
  });
  const wsBase = toWsOrigin(ctx.endpointUrl || (import.meta.client ? window.location.origin : ""));
  if ((component === "koko" || component === "lion") && ctx.wsQuery?.type === "monitor") {
    return `${wsBase}/koko/ws/monitor/?${params.toString()}`;
  }
  return `${wsBase}${WS_PREFIX[component]}${wsRoute}/?${params.toString()}`;
}
