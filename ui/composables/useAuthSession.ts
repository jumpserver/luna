import type { PermissionOrgs, PermOrgItem, UserIntiInfo } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

type LoginPayload = UserIntiInfo & { bearer: string };
type PersistedUserSnapshot = {
  loggedIn?: boolean
  currentSite?: string
  currentUser?: Record<string, any> | null
  currentOrganizations?: PermOrgItem[]
  userMap?: Record<string, Record<string, any>>
  currentRdpClientOption?: Record<string, any>
  currentConnectionInfoMap?: Record<string, any>
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
        loggedIn: parsed.loggedIn ?? true,
        currentSite: snapshotSite,
        currentUser: (parsed.currentUser as any) || null,
        currentOrganizations: parsed.currentOrganizations || [],
        userMap: parsed.userMap as any,
        currentRdpClientOption: (parsed.currentRdpClientOption as any) || {},
        currentConnectionInfoMap: (parsed.currentConnectionInfoMap as any) || {}
      });

      userInfoStore.setCurrentSite(snapshotSite);
      userInfoStore.setUserLoggedIn(true);
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

  const bootstrapPersistedSession = async () => {
    const restored = restorePersistedSnapshot();

    const site = getPersistedSite();
    if (!site) {
      console.info("bootstrap auth session skipped: missing persisted site");
      return false;
    }

    try {
      console.info("bootstrap auth session start", { site, restored });
      const payload = await useTauriCoreInvoke<LoginPayload>("bootstrap_auth_session", { site });
      const applied = await applyLoginPayload(payload, { showToast: false, navigateHome: false });
      console.info("bootstrap auth session applied", { site, applied });
      return applied;
    } catch (error) {
      console.error("bootstrap auth session failed", { site, restored, error });
      return false;
    }
  };

  return {
    applyLoginPayload,
    bootstrapPersistedSession
  };
};
