export const DEFAULT_APP_NAME = "JumpServerClient";

export function normalizeAppName(name?: string | null) {
  return (name || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;
}

export function getConfiguredAppName() {
  return normalizeAppName(import.meta.env.VITE_APP_NAME);
}

export function isDefaultAppName(name = getConfiguredAppName()) {
  return normalizeAppName(name) === DEFAULT_APP_NAME;
}
