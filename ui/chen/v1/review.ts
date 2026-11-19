function webUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

export function reviewTicketUrl(value?: string, coreSite?: string): string | undefined {
  if (!value || value.includes("\\") || [...value].some((character) => character.charCodeAt(0) <= 32)) return undefined;
  // Absolute ticket URLs do not depend on Electron's opaque local renderer origin.
  const absolute = webUrl(value);
  if (absolute) return absolute.href;
  // A relative ticket belongs to the authenticated Core site, never the Chen endpoint.
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  const core = coreSite && webUrl(coreSite);
  return core ? new URL(value, core.origin).href : undefined;
}
