import type { SiteUserData } from "./userInfo";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserInfoStore } from "./userInfo";

const { desktopInvoke, runtime } = vi.hoisted(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear()
  });
  return { desktopInvoke: vi.fn(), runtime: { desktop: true } };
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
