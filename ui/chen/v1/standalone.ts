// Nuxt route paths exclude app.baseURL. Keep this exemption to this one entry point.
export function isChenSingleRoute(path: string) {
  return path === "/chen" || path === "/chen/";
}

export function chenSelectorFromQuery(value: unknown) {
  if (typeof value !== "string") return "";
  const selector = value.trim();
  const control = Array.from(selector).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );
  return selector.length > 0 && selector.length <= 128 && !control ? selector : "";
}
