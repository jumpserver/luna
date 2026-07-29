import type { PermissionOrgs, PermOrgItem, UserIntiInfo } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface BootstrapResponse {
  data: string
  status?: number
}
type LoginPayload = UserIntiInfo & {
  bearer: string
  profile: BootstrapResponse
  current_org: BootstrapResponse
  permission_orgs: BootstrapResponse
};
interface PersistedUserSnapshot {
  loggedIn?: boolean
  currentSite?: string
  currentUser?: Record<string, any> | null
  currentOrganizations?: PermOrgItem[]
  userMap?: Record<string, Record<string, any>>
  currentRdpClientOption?: Record<string, any>
  currentConnectionInfoMap?: Record<string, any>
  currentConnectionPreferenceMap?: Record<string, any>
}

const BOOTSTRAP_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 3000];
let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lastBootstrapFailure: "network" | "server" | null = null;
let bootstrapPromise: Promise<boolean> | null = null;

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

const classifyBootstrapFailure = (
  payload: LoginPayload | null | undefined
): "auth" | "network" | "server" | null => {
  if (!payload || payload.status !== "success") return "auth";

  const profileStatus = Number(payload.profile?.status ?? 0);
  if (profileStatus >= 400 && profileStatus < 500) return "auth";

  const statuses = [payload.profile, payload.permission_orgs, payload.current_org]
    .map((response) => Number(response?.status ?? 0));

  if (statuses.includes(0)) return "network";
  if (statuses.some((status) => status >= 500)) return "server";
  if (statuses.some((status) => status < 200 || status >= 300)) return "server";

  return null;
};

const normalizeOrgList = (value: unknown): PermOrgItem[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is PermOrgItem => {
      return !!item && typeof item === "object" && typeof (item as PermOrgItem).id === "string" && typeof (item as PermOrgItem).name === "string";
    });
  }

  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.results)) return normalizeOrgList(record.results);
  if (Array.isArray(record.data)) return normalizeOrgList(record.data);
  if (record.results && typeof record.results === "object") return normalizeOrgList(record.results);
  if (record.data && typeof record.data === "object") return normalizeOrgList(record.data);

  return [];
};

const initSelectOrganization = (permissionOrgData: PermissionOrgs | Record<string, unknown>) => {
  const orgs = normalizeOrgList((permissionOrgData as Record<string, unknown>).workbench_orgs);

  return orgs.filter((org, index, self) => index === self.findIndex((item: PermOrgItem) => item.id === org.id));
};

const parseApiData = <T>(value: { data?: string } | undefined, fallback: T): T => {
  if (!value?.data) return fallback;

  try {
    return JSON.parse(value.data) as T;
  } catch (err) {
    console.error("parse login response failed", err);
    return fallback;
  }
};

export const useAuthSession = () => {
  const { t } = useI18n();
  const toast = useToast();
  const localePath = useLocalePath();
  const userInfoStore = useUserInfoStore();
  const { currentSite, userMap } = storeToRefs(userInfoStore);

  const applyLoginPayload = async (
    payload: LoginPayload | null | undefined,
    options: { showToast?: boolean, navigateHome?: boolean } = {}
  ) => {
    if (!payload || payload.status !== "success") return false;

    const { profile, bearer, current_org, resolved_site, permission_orgs, xpack_license_valid } = payload;
    const profileData = parseApiData<any>(profile, null);
    const currentOrgData = parseApiData<any>(current_org, null);
    const permissionOrgData = parseApiData<PermissionOrgs>(permission_orgs, {} as PermissionOrgs);
    const resolvedSite = resolved_site || "";

    if (!profileData || !currentOrgData || !resolvedSite) return false;

    const availableOrgs = initSelectOrganization(permissionOrgData);
    console.info("login permission_orgs payload", permissionOrgData);
    console.info("login current org", currentOrgData);
    console.info("login available orgs", availableOrgs);

    userInfoStore.setUserData(resolvedSite, {
      name: profileData.name,
      bearerToken: bearer,
      site: resolvedSite,
      org: currentOrgData,
      system_roles: profileData.system_roles,
      availableOrgs,
      xpackLicenseValid: xpack_license_valid ?? true,
      connectionInfo: {
        protocol: "",
        username: ""
      }
    });

    userInfoStore.setOrganizations(availableOrgs);
    userInfoStore.setCurrentOrg(currentOrgData);
    userInfoStore.setUserLoggedIn(true);

    if (options.showToast !== false) {
      toast.add({
        title: t("Login.LoginSuccess"),
        color: "primary",
        icon: "line-md:check-all",
        progress: true
      });
    }

    if (options.navigateHome !== false) {
      await navigateTo({
        path: localePath({ path: "/" })
      });
    }

    return true;
  };

  const getPersistedSite = () => {
    const inMemorySite = currentSite.value || Object.keys(userMap.value || {})[0] || "";
    if (inMemorySite) return inMemorySite;

    if (!import.meta.client) return "";

    try {
      const raw = globalThis.localStorage?.getItem("userInfo");
      if (!raw) return "";

      const parsed = JSON.parse(raw) as {
        currentSite?: string
        userMap?: Record<string, { site?: string }>
      };

      if (parsed.currentSite) return parsed.currentSite;

      const firstSite = Object.keys(parsed.userMap || {})[0] || "";
      if (firstSite) return firstSite;

      return Object.values(parsed.userMap || {})[0]?.site || "";
    } catch (error) {
      console.debug("read persisted userInfo failed", error);
      return "";
    }
  };

  const restorePersistedSnapshot = () => {
    if (!import.meta.client) return false;

    try {
      const raw = globalThis.localStorage?.getItem("userInfo");
      if (!raw) {
        console.info("restore persisted userInfo skipped: storage empty");
        return false;
      }

      const parsed = JSON.parse(raw) as PersistedUserSnapshot;
      const snapshotSite = parsed.currentSite || Object.keys(parsed.userMap || {})[0] || "";

      if (!snapshotSite || !parsed.userMap) {
        console.info("restore persisted userInfo skipped: invalid snapshot", parsed);
        return false;
      }

      userInfoStore.$patch({
        // Only restore the remembered account context here. Real login state
        // must be revalidated against the backend session/token on startup.
        loggedIn: false,
        currentSite: snapshotSite,
        currentUser: (parsed.currentUser as any) || null,
        currentOrganizations: parsed.currentOrganizations || [],
        userMap: parsed.userMap as any,
        currentRdpClientOption: (parsed.currentRdpClientOption as any) || {},
        currentConnectionInfoMap: (parsed.currentConnectionInfoMap as any) || {},
        currentConnectionPreferenceMap: (parsed.currentConnectionPreferenceMap as any) || {}
      });

      userInfoStore.setCurrentSite(snapshotSite);
      userInfoStore.setUserLoggedIn(false);
      console.info("restore persisted userInfo success", {
        snapshotSite,
        loggedIn: parsed.loggedIn,
        userCount: Object.keys(parsed.userMap || {}).length
      });
      return true;
    } catch (error) {
      console.error("restore persisted userInfo failed", error);
      return false;
    }
  };

  const fetchWebJson = async <T>(paths: string[]): Promise<T | null> => {
    for (const path of paths) {
      try {
        const response = await fetch(withWebSitePrefix(path), {
          credentials: "include",
          headers: getWebApiHeaders()
        });

        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) continue;
        return await response.json() as T;
      } catch (error) {
        console.debug("web auth request failed", { path, error });
      }
    }

    return null;
  };

  const bootstrapWebCookieSession = async () => {
    if (isWebAuthPath()) {
      userInfoStore.setUserLoggedIn(false);
      return false;
    }

    const connectionToken = new URLSearchParams(window.location.search).get("token");
    const [profileData, permissionOrgData] = await Promise.all([
      fetchWebJson<Record<string, any>>([
        connectionToken
          ? `/api/v1/users/profile/?fields_size=mini&token=${encodeURIComponent(connectionToken)}`
          : "/api/v1/users/profile/?fields_size=mini",
        "/api/v1/users/profile/",
        "/api/v1/profile/"
      ]),
      fetchWebJson<PermissionOrgs | Record<string, unknown>>([
        "/api/v1/users/profile/permissions/",
        "/api/v1/profile/permissions/"
      ])
    ]);

    if (!profileData) {
      userInfoStore.setUserLoggedIn(false);
      if (!connectionToken) {
        redirectToWebLogin();
      }
      return false;
    }

    const availableOrgs = initSelectOrganization(permissionOrgData || {});
    const cookieOrgId = getWebOrgId();
    const currentOrg = (availableOrgs.find((org) => org.id === cookieOrgId) || availableOrgs[0] || {
      id: cookieOrgId || profileData.org_id || profileData.org?.id || "",
      name: profileData.org_name || profileData.org?.name || "",
      is_root: false,
      is_default: false,
      is_system: false
    }) as any;

    if (!currentOrg.id) {
      userInfoStore.setUserLoggedIn(false);
      return false;
    }

    const site = window.location.origin;

    userInfoStore.setUserData(site, {
      name: profileData.name || profileData.username || profileData.display_name || "",
      bearerToken: "",
      site,
      org: {
        comment: "",
        ...currentOrg
      },
      system_roles: profileData.system_roles || [],
      availableOrgs,
      xpackLicenseValid: profileData.xpack_license_valid ?? profileData.xpackLicenseValid ?? true,
      connectionInfo: {
        protocol: "",
        username: ""
      }
    });

    userInfoStore.setOrganizations(availableOrgs);
    userInfoStore.setCurrentOrg({ comment: "", ...currentOrg });
    userInfoStore.setUserLoggedIn(true);
    return true;
  };

  const bootstrapSession = async () => {
    if (bootstrapRetryTimer) {
      clearTimeout(bootstrapRetryTimer);
      bootstrapRetryTimer = null;
    }

    const restored = restorePersistedSnapshot();

    const promptLogin = () => {
      if (!import.meta.client || !isTauriRuntime()) return;
      useEventBus().emit("login", undefined);
    };

    const notifyBootstrapFailure = (failure: "network" | "server") => {
      if (lastBootstrapFailure === failure) return;
      lastBootstrapFailure = failure;
      toast.add({
        title: t(failure === "network" ? "Login.NetworkError" : "Login.ServerError"),
        color: "error",
        icon: failure === "network" ? "i-lucide-wifi-off" : "i-lucide-server-off",
        duration: 5000
      });
    };

    if (!isTauriRuntime()) {
      return await bootstrapWebCookieSession() || restored;
    }

    const site = getPersistedSite();
    if (!site) {
      console.info("bootstrap auth session skipped: missing persisted site");
      return false;
    }

    try {
      console.info("bootstrap auth session start", { site, restored });
      for (const delay of BOOTSTRAP_RETRY_DELAYS_MS) {
        if (delay > 0) await wait(delay);

        const payload = await useTauriCoreInvoke<LoginPayload>("bootstrap_auth_session", { site });
        const failure = classifyBootstrapFailure(payload);

        if (failure === "auth") {
          lastBootstrapFailure = null;
          userInfoStore.setUserLoggedIn(false);
          if (restored) promptLogin();
          return false;
        }
        if (failure) {
          notifyBootstrapFailure(failure);
          continue;
        }

        const applied = await applyLoginPayload(payload, { showToast: false, navigateHome: false });
        console.info("bootstrap auth session applied", { site, applied });

        if (applied) {
          lastBootstrapFailure = null;
          return true;
        }

        userInfoStore.setUserLoggedIn(false);
        if (restored) promptLogin();
        return false;
      }

      // Keep the remembered account context when the site is temporarily
      // unreachable. A transient network failure is not an authentication failure.
      console.warn("bootstrap auth session deferred: site remains unavailable", { site });
      userInfoStore.setUserLoggedIn(false);
      bootstrapRetryTimer = setTimeout(() => {
        bootstrapRetryTimer = null;
        bootstrapPromise = bootstrapSession();
      }, 5000);
      return false;
    } catch (error) {
      console.error("bootstrap auth session failed", { site, restored, error });
      userInfoStore.setUserLoggedIn(false);
      if (restored) promptLogin();
      return false;
    }
  };

  const bootstrapPersistedSession = () => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapSession();
    }

    return bootstrapPromise;
  };

  return {
    applyLoginPayload,
    bootstrapPersistedSession
  };
};
