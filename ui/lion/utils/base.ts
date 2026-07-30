const LION_SEGMENT = "/lion";
const LION_MARKER = `${LION_SEGMENT}/`;
const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, "");
const ensureLeadingSlash = (value: string) => (value.startsWith("/") ? value : `/${value}`);
const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);
const isAbsoluteUrl = (value: string) => ABSOLUTE_URL_PATTERN.test(value);

const resolveOrigin = () => {
  if (window.location.origin) {
    return window.location.origin;
  }

  return `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
};

const resolveRuntimeBase = () => {
  const pathname = window.location.pathname || "/";
  let idx = pathname.indexOf(LION_MARKER);

  if (idx < 0 && pathname === LION_SEGMENT) {
    idx = 0;
  } else if (idx < 0 && pathname.endsWith(LION_SEGMENT)) {
    idx = pathname.length - LION_SEGMENT.length;
  }

  let prefix = "";
  if (idx > 0) {
    prefix = pathname.slice(0, idx);
  }

  prefix = trimTrailingSlash(prefix);

  return {
    prefix,
    // ponytail: 嵌入 Luna 后 API/WS 仍走站点根 /lion/*，由 dev proxy 转发，不带 /luna 前缀
    lionBase: LION_MARKER
  };
};

const runtimeBase = resolveRuntimeBase();
const runtimeWindow = window as Window & {
  __BASE_PATH__?: string
  __LION_BASE__?: string
};

export const BASE_PATH = trimTrailingSlash(runtimeWindow.__BASE_PATH__ ?? runtimeBase.prefix);
const configuredLionBase = runtimeWindow.__LION_BASE__;
export const LION_BASE = ensureTrailingSlash(
  configuredLionBase && configuredLionBase !== "/" ? configuredLionBase : runtimeBase.lionBase
);
export const BASE_URL = resolveOrigin();
export const ORIGIN = BASE_URL;
export const BASE_WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
const NORMALIZED_LION_BASE = trimTrailingSlash(LION_BASE);

export function withBasePath(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const normalizedPath = ensureLeadingSlash(path);

  if (BASE_PATH && (normalizedPath === BASE_PATH || normalizedPath.startsWith(`${BASE_PATH}/`))) {
    return normalizedPath;
  }

  return BASE_PATH ? `${BASE_PATH}${normalizedPath}` : normalizedPath;
}

export function withBaseUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  return `${BASE_URL}${withBasePath(path)}`;
}

export function withLionPath(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const normalizedPath = ensureLeadingSlash(path);

  if (normalizedPath === NORMALIZED_LION_BASE || normalizedPath.startsWith(`${NORMALIZED_LION_BASE}/`)) {
    return normalizedPath;
  }

  if (BASE_PATH && (normalizedPath === BASE_PATH || normalizedPath.startsWith(`${BASE_PATH}/`))) {
    const pathWithoutBase = normalizedPath.slice(BASE_PATH.length) || "/";

    if (pathWithoutBase === LION_SEGMENT || pathWithoutBase.startsWith(LION_MARKER)) {
      return normalizedPath;
    }

    return `${LION_BASE}${trimLeadingSlash(pathWithoutBase)}`;
  }

  if (normalizedPath === LION_SEGMENT) {
    return NORMALIZED_LION_BASE;
  }

  const relativePath = normalizedPath.startsWith(LION_MARKER)
    ? normalizedPath.slice(LION_MARKER.length)
    : trimLeadingSlash(normalizedPath);

  return `${LION_BASE}${relativePath}`;
}

export function withLionUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  return `${BASE_URL}${withLionPath(path)}`;
}

export function withBaseWsUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  return `${BASE_WS_URL}${withBasePath(path)}`;
}

export function withLionWsUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  return `${BASE_WS_URL}${withLionPath(path)}`;
}
