import type { JmsComponent } from "./types/component";
import type { ConnectorSessionContext } from "./types/session";
import { buildWsQueryParams, toWsOrigin } from "./utils/wsQuery";

const WS_PREFIX: Record<JmsComponent, string> = {
  koko: "/koko/ws/",
  chen: "/chen/ws/",
  lion: "/lion/ws/",
  tinker: "/lion/ws/",
  default: "/koko/ws/"
};

const devEnv = () => import.meta.env as Record<string, string | undefined>;

const DEV_WS_KEYS: Partial<Record<JmsComponent, string>> = {
  koko: "VITE_KOKO_WS",
  default: "VITE_KOKO_WS",
  chen: "VITE_CHEN_WS",
  lion: "VITE_LION_WS",
  tinker: "VITE_LION_WS"
};

const DEV_HOST_KEYS: Partial<Record<JmsComponent, string>> = {
  koko: "VITE_KOKO_HOST",
  default: "VITE_KOKO_HOST",
  chen: "VITE_CHEN_HOST",
  lion: "VITE_LION_HOST",
  tinker: "VITE_LION_HOST"
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export function resolveDevWsBase(component: JmsComponent) {
  if (!import.meta.dev) return "";
  const key = DEV_WS_KEYS[component];
  return key ? trimSlash(devEnv()[key] || "") : "";
}

export function resolveDevHost(component: JmsComponent) {
  if (!import.meta.dev) return "";
  const key = DEV_HOST_KEYS[component];
  return key ? trimSlash(devEnv()[key] || "") : "";
}

export function resolveWsUrl(component: JmsComponent, wsRoute: string, ctx: ConnectorSessionContext) {
  const params = buildWsQueryParams({
    token: ctx.tokenId,
    ticket: ctx.ticket,
    disableautohash: ctx.disableAutoHash
  });
  const devWsBase = resolveDevWsBase(component);
  const wsBase = devWsBase || toWsOrigin(ctx.endpointUrl || (import.meta.client ? window.location.origin : ""));
  return `${wsBase}${WS_PREFIX[component]}${wsRoute}/?${params.toString()}`;
}
