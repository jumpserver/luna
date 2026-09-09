export function parseUrl(value: string | URL, base?: string | URL): URL {
  try {
    return new URL(value, base);
  } catch (cause) {
    throw new Error(`Invalid URL: ${value}`, { cause });
  }
}

export function siteHostname(value: string | URL): string {
  return parseUrl(value).hostname.toLowerCase();
}

export function isTrustedCertificateHost(trustedHostnames: Set<string>, hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  return Boolean(host) && trustedHostnames.has(host);
}

export function toFetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
