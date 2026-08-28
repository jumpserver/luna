import type { CurrentOrg, PermissionOrgs, PermOrgItem, UserIntiInfo } from "~/types";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface BootstrapResponse {
  data: string;
  status?: number;
}
type LoginPayload = UserIntiInfo & {
  bearer: string;
  profile: BootstrapResponse;
  current_org: BootstrapResponse;
  permission_orgs: BootstrapResponse;
};
interface PersistedUserSnapshot {
  loggedIn?: boolean;
  currentAccountId?: string;
  currentSite?: string;
  currentUser?: Record<string, any> | null;
  currentOrganizations?: PermOrgItem[];
  userMap?: Record<string, Record<string, any>>;
  currentRdpClientOption?: Record<string, any>;
  currentConnectionInfoMap?: Record<string, any>;
  currentConnectionPreferenceMap?: Record<string, any>;
}

const BOOTSTRAP_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 3000];
let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lastBootstrapFailure: "network" | "server" | null = null;
let bootstrapPromise: Promise<boolean> | null = null;

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

const classifyBootstrapFailure = (payload: LoginPayload | null | undefined): "auth" | "network" | "server" | null => {
  if (!payload || payload.status !== "success") return "auth";

  const profileStatus = Number(payload.profile?.status ?? 0);
  if (profileStatus >= 400 && profileStatus < 500) return "auth";
  if (profileStatus === 0) return "network";
  if (profileStatus >= 500 || profileStatus < 200 || profileStatus >= 300) return "server";

  return null;
};

const normalizeOrgList = (value: unknown): PermOrgItem[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is PermOrgItem => {
      return (
        !!item &&
        typeof item === "object" &&
        typeof (item as PermOrgItem).id === "string" &&
        typeof (item as PermOrgItem).name === "string"
      );
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
  // vue-i18n's useI18n() requires setup(); this composable also runs from route middleware.
  const t = (key: string) => String(useNuxtApp().$i18n.t(key));
  const toast = useToast();
  const localePath = useLocalePath();
  const userInfoStore = useUserInfoStore();
  const { currentAccountId, userMap } = storeToRefs(userInfoStore);

  const applyLoginPayload = async (
    payload: LoginPayload | null | undefined,
    options: { showToast?: boolean; navigateHome?: boolean; accountId?: string; siteName?: string } = {}
  ) => {
    if (!payload || payload.status !== "success") return false;

    const {
      profile,
      bearer,
      current_org,
      resolved_site,
      permission_orgs,
      xpack_license_valid,
      security_command_execution
    } = payload;
    const profileData = parseApiData<any>(profile, null);
    const currentOrgData = parseApiData<any>(current_org, null);
    const permissionOrgData = parseApiData<PermissionOrgs>(permission_orgs, {} as PermissionOrgs);
    const resolvedSite = resolved_site || "";
    const accountId = options.accountId || currentAccountId.value || resolvedSite;
    const existingUser = userMap.value[accountId];
    const siteName = options.siteName || existingUser?.siteName || resolvedSite;

    if (!profileData || !resolvedSite || !accountId) return false;

    const userId = (typeof profileData.id === "string" && profileData.id.trim()) || existingUser?.userId || "";

    const availableOrgs = initSelectOrganization(permissionOrgData);
    const currentOrg =
      currentOrgData && typeof currentOrgData === "object"
        ? currentOrgData
        : {
            id: "",
            name: "",
            is_root: false,
            is_default: false,
            is_system: false,
            comment: ""
          };

    userInfoStore.setUserData(accountId, {
      accountId,
      userId,
      siteName,
      name: profileData.name,
      bearerToken: bearer,
      site: resolvedSite,
      org: currentOrg,
      system_roles: profileData.system_roles,
      availableOrgs,
      xpackLicenseValid: xpack_license_valid ?? true,
      commandExecutionEnabled: security_command_execution === true,
      connectionInfo: {
        protocol: "",
        username: ""
      }
    });

    userInfoStore.setOrganizations(availableOrgs);
    if (currentOrg.id) {
      userInfoStore.setCurrentOrg(currentOrg);
    }
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

  const getPersistedAccount = () => {
    const accountId = currentAccountId.value || Object.keys(userMap.value || {})[0] || "";
    const userData = userMap.value[accountId];

    if (!accountId || !userData?.site) return null;

    return { accountId, userData };
  };

  const restorePersistedSnapshot = () => {
    if (!import.meta.client) return false;

    try {
      const raw = globalThis.localStorage?.getItem("userInfoV2");
      if (!raw) {
        console.info("restore persisted userInfo skipped: storage empty");
        return false;
      }

      const parsed = JSON.parse(raw) as PersistedUserSnapshot;
      const snapshotAccountId = parsed.currentAccountId || "";

      if (!snapshotAccountId || !parsed.userMap?.[snapshotAccountId]) {
        console.info("restore persisted userInfo skipped: invalid snapshot", parsed);
        return false;
      }

      userInfoStore.$patch({
        // Only restore the remembered account context here. Real login state
        // must be revalidated against the backend session/token on startup.
        loggedIn: false,
        currentAccountId: snapshotAccountId,
        currentSite: parsed.userMap[snapshotAccountId].site || parsed.currentSite || "",
        currentUser: (parsed.currentUser as any) || null,
        currentOrganizations: parsed.currentOrganizations || [],
        userMap: parsed.userMap as any,
        currentRdpClientOption: (parsed.currentRdpClientOption as any) || {},
        currentConnectionInfoMap: (parsed.currentConnectionInfoMap as any) || {},
        currentConnectionPreferenceMap: (parsed.currentConnectionPreferenceMap as any) || {}
      });

      userInfoStore.setCurrentAccount(snapshotAccountId);
      userInfoStore.setUserLoggedIn(false);
      console.info("restore persisted userInfo success", {
        snapshotAccountId,
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
        return (await response.json()) as T;
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
    const [profileData, publicSettings] = await Promise.all([
      fetchWebJson<Record<string, any>>([
        connectionToken
          ? `/api/v1/users/profile/?fields_size=mini&token=${encodeURIComponent(connectionToken)}`
          : "/api/v1/users/profile/?fields_size=mini",
        "/api/v1/users/profile/",
        "/api/v1/profile/"
      ]),
      fetchWebJson<Record<string, any>>(["/api/v1/settings/public/"])
    ]);

    if (!profileData) {
      userInfoStore.setUserLoggedIn(false);
      if (!connectionToken) {
        redirectToWebLogin();
      }
      return false;
    }

    const cookieOrgId = getWebOrgId();
    const site = window.location.origin;
    const profileOrg: CurrentOrg = {
      id: cookieOrgId || profileData.org_id || profileData.org?.id || "",
      name: profileData.org_name || profileData.org?.name || "",
      is_root: false,
      is_default: false,
      is_system: false,
      comment: ""
    };

    const userId = typeof profileData.id === "string" ? profileData.id.trim() : "";

    userInfoStore.setUserData(site, {
      accountId: site,
      userId,
      siteName: site,
      name: profileData.name || profileData.username || profileData.display_name || "",
      bearerToken: "",
      site,
      org: profileOrg,
      system_roles: profileData.system_roles || [],
      availableOrgs: [],
      xpackLicenseValid: profileData.xpack_license_valid ?? profileData.xpackLicenseValid ?? true,
      commandExecutionEnabled: publicSettings?.SECURITY_COMMAND_EXECUTION === true,
      connectionInfo: {
        protocol: "",
        username: ""
      }
    });

    userInfoStore.setOrganizations([]);
    if (profileOrg.id) {
      userInfoStore.setCurrentOrg(profileOrg);
    }
    userInfoStore.setUserLoggedIn(true);

    void Promise.all([
      fetchWebJson<PermissionOrgs | Record<string, unknown>>([
        "/api/v1/users/profile/permissions/",
        "/api/v1/profile/permissions/"
      ]),
      fetchWebJson<Record<string, any>>(["/api/v1/orgs/orgs/current/"])
    ])
      .then(([permissionOrgData, currentOrgData]) => {
        const availableOrgs = initSelectOrganization(permissionOrgData || {});
        const resolvedCurrentOrg = currentOrgData && typeof currentOrgData === "object" ? currentOrgData : null;
        const currentOrg =
          availableOrgs.find((org) => org.id === cookieOrgId) ||
          availableOrgs.find((org) => org.id === resolvedCurrentOrg?.id) ||
          availableOrgs[0] ||
          profileOrg;

        userInfoStore.setOrganizations(availableOrgs);
        if (currentOrg.id) {
          userInfoStore.setCurrentOrg({
            ...currentOrg,
            comment: resolvedCurrentOrg?.comment || currentOrg.comment || ""
          });
        }
      })
      .catch((error) => {
        console.debug("hydrate web organization failed", error);
      });

    return true;
  };

  const bootstrapSession = async () => {
    if (bootstrapRetryTimer) {
      clearTimeout(bootstrapRetryTimer);
      bootstrapRetryTimer = null;
    }

    const restored = restorePersistedSnapshot();

    const promptLogin = () => {
      if (!import.meta.client || !isDesktopRuntime()) return;
      if (window.location.pathname.includes("/auth")) return;
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

    if (!isDesktopRuntime()) {
      return (await bootstrapWebCookieSession()) || restored;
    }

    const persistedAccount = getPersistedAccount();
    if (!persistedAccount) {
      console.info("bootstrap auth session skipped: missing persisted account");
      return false;
    }
    const { accountId, userData } = persistedAccount;
    const { site, siteName } = userData;

    try {
      console.info("bootstrap auth session start", { accountId, site, restored });
      for (const delay of BOOTSTRAP_RETRY_DELAYS_MS) {
        if (delay > 0) await wait(delay);

        const payload = await desktopInvoke<LoginPayload>("bootstrap_auth_session", {
          site,
          sessionId: accountId
        });
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

        const applied = await applyLoginPayload(payload, {
          showToast: false,
          navigateHome: false,
          accountId,
          siteName
        });
        console.info("bootstrap auth session applied", { accountId, site, applied });

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

  const authReady = useState("auth-bootstrap-ready", () => false);

  const bootstrapPersistedSession = () => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapSession().finally(() => {
        authReady.value = true;
      });
    }

    return bootstrapPromise;
  };

  return {
    applyLoginPayload,
    authReady,
    bootstrapPersistedSession
  };
};
