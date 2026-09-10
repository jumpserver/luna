import type { SiteUserData } from "./userInfo";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUserInfoStore } from "./userInfo";

const { desktopInvoke } = vi.hoisted(() => {
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
  return { desktopInvoke: vi.fn() };
});

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => true }));

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
