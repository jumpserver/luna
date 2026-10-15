import { pageLocation } from "~/utils/runtime";

export const buildHeaders = (token?: string, init?: HeadersInit) => ({
  ...getWebApiHeaders(),
  ...(token ? { token } : {}),
  ...(init || {})
});

export function chenPath(path: string, endpointUrl?: string) {
  const connectorPath = `/chen${path.startsWith("/") ? path : `/${path}`}`;
  const currentOrigin = typeof window === "undefined" ? "http://localhost" : pageLocation().origin;
  const endpoint = new URL(endpointUrl || currentOrigin, currentOrigin);

  if (isElectronRuntime()) {
    // The Electron protocol owns the session-aware proxy, including in HTTP dev renderers.
    const target = new URL(connectorPath, "jms-app://app");
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

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}
