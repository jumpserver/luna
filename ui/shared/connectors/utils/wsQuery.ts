const pageOnlyQueryKeys = new Set(["colorMode", "themeType", "terminal_theme_name", "_"]);

export function buildWsQueryParams(input: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (!value || pageOnlyQueryKeys.has(key)) continue;
    params.set(key, value);
  }
  return params;
}

export function toWsOrigin(httpOrigin: string) {
  const url = new URL(httpOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}
