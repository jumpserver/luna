import type { SiteUserData } from "./userInfo";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { useUserInfoStore } from "./userInfo";

const { desktopInvoke, runtime, storage } = vi.hoisted(() => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear()
  };
  vi.stubGlobal("localStorage", storage);
  return { desktopInvoke: vi.fn(), runtime: { desktop: true }, storage };
});

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => runtime.desktop }));

const org = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Default",
  is_root: false,
  is_default: true,
  is_system: false,
  comment: ""
};

const siteUser = (accountId: string, site: string): SiteUserData => ({
  accountId,
  userId: accountId,
  siteName: site,
  site,
  name: accountId,
  bearerToken: `token-${accountId}`,
  system_roles: [],
  org,
  availableOrgs: [org],
  connectionInfo: { protocol: "", username: "" },
  connectionInfoMap: {},
  connectionPreferenceMap: {},
  protocolConnectionPreferenceMap: {},
  rdpClientOption: {}
});

describe.each([true, false])("saved RDP resolution (desktop: %s)", (desktop) => {
  const selection = () => ({
    protocol: "rdp",
    username: "Administrator",
    connectMethod: "mstsc",
    connectOptions: { resolution: "1920x1080", remote_microphone: true, reusable: true }
  });

  beforeEach(() => {
    runtime.desktop = desktop;
    storage.clear();
    const pinia = createPinia().use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
  });

  afterEach(() => {
    runtime.desktop = true;
    storage.clear();
  });

  it("keeps resolution for the current attempt without saving it as an asset default", () => {
    const store = useUserInfoStore();
    store.currentAccountId = "account";
    store.userMap.account = siteUser("account", "https://example.com");
    const current = selection();

    store.setConnectionInfoForAsset("asset", current);
    store.setConnectionPreferenceForAsset("asset", current);
    // Later preference updates also merge the stored options.
    store.setConnectionPreferenceForAsset("asset", { connectMethod: "web_gui" });

    expect(current.connectOptions.resolution).toBe("1920x1080");
    for (const saved of [
      store.getConnectionInfoForAsset("asset"),
      store.getConnectionPreferenceForAsset("asset"),
      store.currentConnectionInfoMap.asset,
      store.currentConnectionPreferenceMap.asset
    ]) {
      expect(saved?.connectOptions).toEqual({ remote_microphone: true, reusable: true });
      expect(saved?.username).toBe("Administrator");
    }
  });

  it("removes old resolution snapshots from restored accounts and connection caches", () => {
    const user = {
      ...siteUser("account", "https://example.com"),
      connectionInfo: selection(),
      connectionInfoMap: { asset: selection() },
      connectionPreferenceMap: { asset: selection() }
    };
    storage.setItem(
      "userInfoV2",
      JSON.stringify({
        currentAccountId: "account",
        currentUser: user,
        userMap: { account: user, inactive: { ...user, accountId: "inactive" } },
        currentConnectionInfoMap: user.connectionInfoMap,
        currentConnectionPreferenceMap: user.connectionPreferenceMap
      })
    );

    const store = useUserInfoStore();
    expect(store.getConnectionInfoForAsset("asset")?.connectOptions).toEqual({
      remote_microphone: true,
      reusable: true
    });
    expect(store.getConnectionPreferenceForAsset("asset")?.connectOptions).not.toHaveProperty("resolution");
    expect(store.currentConnectionInfoMap.asset?.connectOptions).not.toHaveProperty("resolution");
    expect(store.currentConnectionPreferenceMap.asset?.connectOptions).not.toHaveProperty("resolution");
    expect(storage.getItem("userInfoV2")).not.toContain('"resolution"');
    expect(store.userMap.inactive?.connectionInfoMap?.asset?.connectOptions?.remote_microphone).toBe(true);
  });
});

describe("setCurrentAccount session order", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    desktopInvoke.mockReset();
    desktopInvoke.mockResolvedValue(undefined);
  });

  it("does not change the current account until set_api_session resolves", async () => {
    const store = useUserInfoStore();
    const siteA = siteUser("account-a", "https://a.example");
    const siteB = siteUser("account-b", "https://b.example");
    store.userMap = { "account-a": siteA, "account-b": siteB };
    await store.setCurrentAccount("account-a");
    expect(store.currentAccountId).toBe("account-a");

    const pendingSession = Promise.withResolvers<void>();
    desktopInvoke.mockImplementationOnce(() => pendingSession.promise);
    const pending = store.setCurrentAccount("account-b");

    expect(store.currentAccountId).toBe("account-a");
    expect(store.currentSite).toBe("https://a.example");
    expect(desktopInvoke).toHaveBeenCalledWith(
      "set_api_session",
      expect.objectContaining({
        sessionKey: "account-b",
        origin: "https://b.example",
        bearerToken: "token-account-b",
        orgId: org.id
      })
    );

    pendingSession.resolve();
    await pending;

    expect(store.currentAccountId).toBe("account-b");
    expect(store.currentSite).toBe("https://b.example");
  });
});

describe.each([true, false])("organization license (desktop: %s)", (desktop) => {
  const otherOrg = { ...org, id: "other-org", name: "Other", is_default: false };
  const setWebOrgId = vi.fn();

  beforeEach(() => {
    setActivePinia(createPinia());
    runtime.desktop = desktop;
    desktopInvoke.mockReset();
    desktopInvoke.mockResolvedValue(undefined);
    setWebOrgId.mockReset();
    vi.stubGlobal("setWebOrgId", setWebOrgId);
  });

  afterEach(() => {
    runtime.desktop = true;
    vi.unstubAllGlobals();
  });

  it.each([{ orgs: [] }, { orgs: [otherOrg] }, { orgs: [otherOrg, org] }])(
    "replaces a saved enterprise organization even with an incomplete list: %j",
    ({ orgs }) => {
      const store = useUserInfoStore();
      const user = {
        ...siteUser("account", "https://example.com"),
        org: otherOrg,
        availableOrgs: orgs,
        xpackLicenseValid: false
      };
      store.setUserData("account", user);

      expect(store.currentUser?.org.id).toBe(org.id);
      expect(store.userMap.account?.org.id).toBe(org.id);
      expect(store.loggedIn).toBe(true);

      // Late organization hydration and other switch entry points cannot restore the expired org.
      store.setOrganizations(orgs);
      store.setCurrentOrg(otherOrg);
      expect(store.currentUser?.org.id).toBe(org.id);
      if (desktop) {
        expect(desktopInvoke).toHaveBeenCalledWith("set_api_org", { orgId: org.id });
        expect(
          desktopInvoke.mock.calls
            .filter(([command]) => command === "set_api_session")
            .every(([, payload]) => payload.orgId === org.id)
        ).toBe(true);
      } else {
        expect(setWebOrgId).toHaveBeenLastCalledWith(org.id);
      }
    }
  );

  it("normalizes a restored community account before syncing its session", async () => {
    const store = useUserInfoStore();
    store.userMap.account = {
      ...siteUser("account", "https://example.com"),
      org: otherOrg,
      xpackLicenseValid: false
    };
    await store.setCurrentAccount("account");
    expect(store.currentUser?.org.id).toBe(org.id);
    expect(store.userMap.account?.org.id).toBe(org.id);
  });

  it("preserves organization selection with a valid enterprise license", () => {
    const store = useUserInfoStore();
    store.setUserData("account", {
      ...siteUser("account", "https://example.com"),
      org: otherOrg,
      availableOrgs: [otherOrg, org],
      xpackLicenseValid: true
    });
    store.setOrganizations([otherOrg, org]);
    expect(store.currentUser?.org.id).toBe(otherOrg.id);
    store.setCurrentOrg(org);
    store.setCurrentOrg(otherOrg);
    expect(store.currentUser?.org.id).toBe(otherOrg.id);
  });
});
