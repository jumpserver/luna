export function toWsOrigin(url: string) {
  return url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

export function buildWsQueryParams(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query;
}
