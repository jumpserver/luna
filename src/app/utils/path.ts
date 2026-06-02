const APP_SEGMENT = 'luna';
const UI_SEGMENT = 'ui';

function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(url) || url.startsWith('//');
}

function normalizeBasePath(path = '/'): string {
  let normalizedPath = path || '/';

  if (isAbsoluteUrl(normalizedPath)) {
    normalizedPath = new URL(normalizedPath).pathname;
  }

  if (!normalizedPath.startsWith('/')) {
    normalizedPath = `/${normalizedPath}`;
  }

  normalizedPath = normalizedPath.replace(/\/{2,}/g, '/');

  if (!normalizedPath.endsWith('/')) {
    normalizedPath = `${normalizedPath}/`;
  }

  return normalizedPath;
}

function normalizePrefix(path = ''): string {
  if (!path || path === '/') {
    return '';
  }

  let normalizedPath = path;

  if (isAbsoluteUrl(normalizedPath)) {
    normalizedPath = new URL(normalizedPath).pathname;
  }

  if (!normalizedPath.startsWith('/')) {
    normalizedPath = `/${normalizedPath}`;
  }

  return normalizedPath.replace(/\/+$/, '');
}

function splitPath(path: string): { pathname: string; suffix: string } {
  const suffixStart = path.search(/[?#]/);

  if (suffixStart === -1) {
    return { pathname: path, suffix: '' };
  }

  return {
    pathname: path.slice(0, suffixStart),
    suffix: path.slice(suffixStart)
  };
}

function joinPrefixedPath(basePath: string, targetPath: string): string {
  if (!targetPath) {
    return normalizeBasePath(basePath);
  }

  if (isAbsoluteUrl(targetPath)) {
    return targetPath;
  }

  const { pathname, suffix } = splitPath(targetPath);
  const normalizedBasePath = normalizeBasePath(basePath);

  if (!pathname) {
    return `${normalizedBasePath}${suffix}`;
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const normalizedBaseWithoutSlash = normalizedBasePath.replace(/\/$/, '');

  if (
    normalizedBasePath !== '/' &&
    (normalizedPath === normalizedBaseWithoutSlash ||
      normalizedPath.startsWith(`${normalizedBaseWithoutSlash}/`))
  ) {
    return `${normalizedPath}${suffix}`;
  }

  const joinedPath =
    normalizedBasePath === '/'
      ? normalizedPath
      : `${normalizedBaseWithoutSlash}${normalizedPath}`;

  return `${joinedPath.replace(/\/{2,}/g, '/')}${suffix}`;
}

function inferAppBasePath(pathname = window.location.pathname): string {
  const pathSegments = pathname.split('/').filter(Boolean);
  const appIndex = pathSegments.indexOf(APP_SEGMENT);

  if (appIndex === -1) {
    return '/';
  }

  return normalizeBasePath(`/${pathSegments.slice(0, appIndex + 1).join('/')}`);
}

function getGlobalBasePath(): string | null {
  if (typeof window.__BASE_PATH__ !== 'string') {
    return null;
  }

  return normalizePrefix(window.__BASE_PATH__);
}

function getGlobalUIBasePath(): string | null {
  if (typeof window.__UI_BASE__ !== 'string') {
    return null;
  }

  return normalizeBasePath(window.__UI_BASE__);
}

function getGlobalAppBasePath(): string | null {
  if (typeof window.__LUNA_BASE__ !== 'string') {
    return null;
  }

  return normalizeBasePath(window.__LUNA_BASE__);
}

function inferBasePath(pathname = window.location.pathname): string {
  const appBasePath = inferAppBasePath(pathname).replace(/\/$/, '');
  const appSuffix = `/${APP_SEGMENT}`;

  if (!appBasePath || appBasePath === appSuffix) {
    return '';
  }

  return appBasePath.endsWith(appSuffix) ? appBasePath.slice(0, -appSuffix.length) : '';
}

export function getBasePath(pathname = window.location.pathname): string {
  return getGlobalBasePath() ?? inferBasePath(pathname);
}

export function getAppBasePath(pathname = window.location.pathname): string {
  return getGlobalAppBasePath() ?? joinPrefixedPath(getBasePath(pathname) || '/', `/${APP_SEGMENT}/`);
}

export function getUIBasePath(pathname = window.location.pathname): string {
  return getGlobalUIBasePath() ?? joinPrefixedPath(getBasePath(pathname) || '/', `/${UI_SEGMENT}/`);
}

export function getSitePrefix(pathname = window.location.pathname): string {
  return getBasePath(pathname);
}

export function withSitePrefix(path: string, pathname = window.location.pathname): string {
  const sitePrefix = getSitePrefix(pathname);
  return joinPrefixedPath(sitePrefix || '/', path);
}

export function withAppBase(path = '', pathname = window.location.pathname): string {
  return joinPrefixedPath(getAppBasePath(pathname), path);
}

export function withUIBase(path = '', pathname = window.location.pathname): string {
  return joinPrefixedPath(getUIBasePath(pathname), path);
}

export function getAppRoutePath(pathname = window.location.pathname): string {
  const appBasePath = getAppBasePath(pathname);
  const trimmedAppBasePath = appBasePath.replace(/\/$/, '');

  if (pathname === trimmedAppBasePath) {
    return '/';
  }

  if (!pathname.startsWith(appBasePath)) {
    return pathname || '/';
  }

  return pathname.slice(appBasePath.length - 1) || '/';
}

export function toAbsoluteWsUrl(path: string): string {
  const url = new URL(withSitePrefix(path), window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function joinEndpointUrl(endpointUrl: string, path: string): string {
  const endpoint = new URL(endpointUrl, window.location.origin);
  const prefixedPath = endpoint.origin === window.location.origin ? withSitePrefix(path) : path;
  return new URL(prefixedPath, endpoint.origin).toString();
}
