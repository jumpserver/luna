import type { AssetItem } from "~/types";

export interface WebProxyOpenRequest {
  assetId: string;
  title: string;
  targetUrl: string;
  proxyUrl: string;
}

function normalizeTargetUrl(asset: AssetItem, protocol: string) {
  const raw = String(asset.address || "").trim();
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `${protocol}://${raw}`;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Website 资产地址不是有效的 HTTP/HTTPS URL");
  }

  const configuredPort = asset.permedProtocols?.find((item) => item.name === protocol)?.port;
  if (
    !url.port &&
    configuredPort &&
    !((url.protocol === "http:" && configuredPort === 80) || (url.protocol === "https:" && configuredPort === 443))
  ) {
    url.port = String(configuredPort);
  }
  url.hash = "";
  return url.toString();
}

function normalizeProxyUrl(endpointUrl: string) {
  const env = import.meta.env as Record<string, string | undefined>;
  const configured = env.VITE_JMS_WEB_PROXY_URL?.trim();
  const url = configured
    ? new URL(configured)
    : import.meta.dev
      ? new URL("http://127.0.0.1:5001")
      : new URL(endpointUrl);

  if (!configured && !import.meta.dev) {
    url.protocol = "http:";
    url.port = env.VITE_JMS_WEB_PROXY_PORT?.trim() || "5001";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
  }
  if (url.protocol !== "http:" || !url.hostname || url.username || url.password) {
    throw new Error("Koko Web Proxy 地址必须是不含凭据的 HTTP URL");
  }
  return url.origin;
}

export function useWebProxyManager() {
  const buildWebProxyRequest = (asset: AssetItem, protocol: string, endpointUrl: string): WebProxyOpenRequest => ({
    assetId: asset.id,
    title: asset.name || new URL(normalizeTargetUrl(asset, protocol)).hostname,
    targetUrl: normalizeTargetUrl(asset, protocol),
    proxyUrl: normalizeProxyUrl(endpointUrl)
  });

  return { buildWebProxyRequest };
}
