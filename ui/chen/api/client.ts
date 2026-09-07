export const buildHeaders = (token?: string, init?: HeadersInit) => ({
  ...getWebApiHeaders(),
  ...(token ? { token } : {}),
  ...(init || {})
});

export function chenPath(path: string, endpointUrl?: string) {
  const connectorPath = `/chen${path.startsWith("/") ? path : `/${path}`}`;
  const currentOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const endpoint = new URL(endpointUrl || currentOrigin, currentOrigin);

  if (isElectronRuntime()) {
    const target = new URL(withWebSitePrefix(connectorPath), currentOrigin);
    target.searchParams.set("__jms_chen_endpoint", endpoint.origin);
    return target.toString();
  }

  if (endpoint.origin === currentOrigin) {
    return withWebSitePrefix(connectorPath);
  }

  return new URL(connectorPath, endpoint.origin).toString();
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `${response.status}`);
  }

  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}
