import type { AssetItem } from "~/types";

export interface WebProxyOpenRequest {
  assetId: string;
  title: string;
  targetUrl: string;
  proxyUrl: string;
  successSelector: string;
  interactiveSelector: string;
  safeMode: boolean;
  allowedUrls: string[];
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
  const url = new URL(endpointUrl);
  if (url.protocol !== "http:" || !url.hostname || url.username || url.password) {
    throw new Error("Koko Web Proxy 地址必须是不含凭据的 HTTP URL");
  }
  return url.origin;
}

export function useWebProxyManager() {
  const buildWebProxyRequest = (
    asset: AssetItem,
    protocol: string,
    endpointUrl: string,
    successSelector = "",
    interactiveSelector = "",
    allowedUrls: string[] = []
  ): WebProxyOpenRequest => ({
    assetId: asset.id,
    title: asset.name || new URL(normalizeTargetUrl(asset, protocol)).hostname,
    targetUrl: normalizeTargetUrl(asset, protocol),
    proxyUrl: normalizeProxyUrl(endpointUrl),
    successSelector,
    interactiveSelector,
    allowedUrls,
    safeMode: asset.permedProtocols?.find((item) => item.name === protocol)?.setting?.safe_mode === true
  });

  return { buildWebProxyRequest };
}
