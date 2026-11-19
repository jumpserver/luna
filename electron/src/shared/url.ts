export function parseUrl(value: string | URL, base?: string | URL): URL {
  try {
    return new URL(value, base);
  } catch (cause) {
    throw new Error(`Invalid URL: ${value}`, { cause });
  }
}

export function toFetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
