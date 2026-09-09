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

export function isLoopbackUrl(value: string) {
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function alignEndpointUrlWithPage(endpointUrl: string, pageOrigin: string, isDesktop: boolean) {
  if (isDesktop) return endpointUrl;
  try {
    const endpoint = new URL(endpointUrl);
    const page = new URL(pageOrigin);
    if (page.protocol !== "https:" || endpoint.protocol !== "http:") return endpointUrl;
    if (endpoint.hostname === page.hostname) return page.origin;
    endpoint.protocol = "https:";
    if (endpoint.port === "80") endpoint.port = "";
    return endpoint.origin;
  } catch {
    return endpointUrl;
  }
}

export function resolveWsUrl(component: JmsComponent, wsRoute: string, ctx: ConnectorSessionContext) {
  const params = buildWsQueryParams({
    token: ctx.tokenId,
    ticket: ctx.ticket,
    disableautohash: ctx.disableAutoHash,
    ...ctx.wsQuery
  });
  const wsBase = toWsOrigin(ctx.endpointUrl || (import.meta.client ? window.location.origin : ""));
  return `${wsBase}${WS_PREFIX[component]}${wsRoute}/?${params.toString()}`;
}
