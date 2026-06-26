export const isTauriRuntime = () => {
  if (!import.meta.client) return false;
  return !!(globalThis as any).__TAURI_INTERNALS__;
};

export const getCookieValue = (name: string) => {
  if (!import.meta.client) return "";

  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
};

export const getWebOrgId = () => {
  return decodeURIComponent(getCookieValue("X-JMS-LUNA-ORG") || getCookieValue("X-JMS-ORG") || "");
};

export const getWebApiHeaders = () => {
  const orgId = getWebOrgId();
  const headers: HeadersInit = {};

  if (orgId) {
    headers["X-JMS-ORG"] = orgId;
  }

  return headers;
};

export const getWebApiMutationHeaders = () => {
  const headers = getWebApiHeaders();
  const prefix = getCookieValue("SESSION_COOKIE_NAME_PREFIX").replace(/^['"]|['"]$/g, "");
  const csrfToken = decodeURIComponent(getCookieValue(`${prefix}csrftoken`));

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  return headers;
};

const isAbsoluteUrl = (url: string) => /^[a-z][a-z\d+\-.]*:\/\//i.test(url) || url.startsWith("//");

const normalizeBasePath = (path = "/") => {
  let normalizedPath = path || "/";

  if (isAbsoluteUrl(normalizedPath)) {
    normalizedPath = new URL(normalizedPath).pathname;
  }

  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }

  normalizedPath = normalizedPath.replace(/\/{2,}/g, "/");

  if (!normalizedPath.endsWith("/")) {
    normalizedPath = `${normalizedPath}/`;
  }

  return normalizedPath;
};

const joinPrefixedPath = (basePath: string, targetPath: string) => {
  if (!targetPath) return normalizeBasePath(basePath);
  if (isAbsoluteUrl(targetPath)) return targetPath;

  const suffixStart = targetPath.search(/[?#]/);
  const pathname = suffixStart === -1 ? targetPath : targetPath.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : targetPath.slice(suffixStart);
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalizedBaseWithoutSlash = normalizedBasePath.replace(/\/$/, "");

  if (
    normalizedBasePath !== "/"
    && (normalizedPath === normalizedBaseWithoutSlash || normalizedPath.startsWith(`${normalizedBaseWithoutSlash}/`))
  ) {
    return `${normalizedPath}${suffix}`;
  }

  const joinedPath = normalizedBasePath === "/"
    ? normalizedPath
    : `${normalizedBaseWithoutSlash}${normalizedPath}`;

  return `${joinedPath.replace(/\/{2,}/g, "/")}${suffix}`;
};

export const getWebSitePrefix = (pathname = window.location.pathname) => {
  const globalBase = (window as any).__BASE_PATH__;
  if (typeof globalBase === "string") return globalBase.replace(/\/+$/, "");

  const segments = pathname.split("/").filter(Boolean);
  const lunaIndex = segments.indexOf("luna");

  if (lunaIndex <= 0) return "";

  return `/${segments.slice(0, lunaIndex).join("/")}`;
};

export const withWebSitePrefix = (path: string, pathname = window.location.pathname) => {
  return joinPrefixedPath(getWebSitePrefix(pathname) || "/", path);
};

export const getWebAppBasePath = (pathname = window.location.pathname) => {
  const globalLunaBase = (window as any).__LUNA_BASE__;
  if (typeof globalLunaBase === "string") return normalizeBasePath(globalLunaBase);

  return joinPrefixedPath(getWebSitePrefix(pathname) || "/", "/luna/");
};

export const isWebAuthPath = (pathname = window.location.pathname) => {
  const normalizedPath = pathname.replace(/\/{2,}/g, "/");
  const sitePrefix = getWebSitePrefix(pathname);
  const authBase = sitePrefix ? `${sitePrefix}/core/auth/` : "/core/auth/";

  return /(?:^|\/)core\/auth(?:\/|$)/.test(normalizedPath)
    || normalizedPath === authBase.replace(/\/$/, "")
    || normalizedPath.startsWith(authBase)
    || normalizedPath === withWebSitePrefix("/login/", pathname).replace(/\/$/, "")
    || normalizedPath.startsWith(withWebSitePrefix("/login/", pathname));
};

export const redirectToWebLogin = () => {
  if (!import.meta.client) return;
  if (isWebAuthPath()) return;

  const loginUrl = new URL(withWebSitePrefix("/core/auth/login/"), window.location.origin);
  loginUrl.searchParams.set("next", `${window.location.pathname}${window.location.search}`);
  window.location.href = loginUrl.toString();
};
