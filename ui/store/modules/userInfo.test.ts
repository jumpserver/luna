import type { SiteUserData } from "./userInfo";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { useUserInfoStore } from "./userInfo";
import { useClientCompatibility } from "~/composables/useClientCompatibility";

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

const connectionResponse = (command: string, args: any) =>
  command === "bootstrap_auth_session"
    ? { status: "success", connection_id: 1, bearer: `token-${args.sessionId}`, profile: { status: 200 } }
    : { status: "success" };

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
    runtime.desktop = true;
    setActivePinia(createPinia());
    desktopInvoke.mockReset();
    desktopInvoke.mockImplementation(async (command, args) => connectionResponse(command, args));
    useClientCompatibility().dismiss();
  });

  afterEach(() => {
    runtime.desktop = true;
  });

  it("keeps web account selection free of desktop checks and preserves its validated login state", async () => {
    runtime.desktop = false;
    const store = useUserInfoStore();
    store.userMap = { a: siteUser("a", "https://a.test"), b: siteUser("b", "https://b.test") };
    await store.setCurrentAccount("a");
    expect(store.loggedIn).toBe(false);
    store.setUserLoggedIn(true);
    await store.setCurrentAccount("b");
    expect(store.loggedIn).toBe(true);
    expect(desktopInvoke).not.toHaveBeenCalled();
  });

  it("does not queue or cancel web account selections behind another pending switch", async () => {
    runtime.desktop = false;
    const store = useUserInfoStore();
    store.userMap = { a: siteUser("a", "https://a.test"), b: siteUser("b", "https://b.test") };
    const cleanup = Promise.withResolvers<void>();
    const beforeSwitch = vi.fn(() => cleanup.promise);
    const firstSwitch = store.setCurrentAccount("a", { beforeSwitch });
    await vi.waitFor(() => expect(beforeSwitch).toHaveBeenCalledOnce());

    const secondSwitch = store.setCurrentAccount("b");
    try {
      await vi.waitFor(() => expect(store.currentAccountId).toBe("b"));
    } finally {
      cleanup.resolve();
    }

    await expect(secondSwitch).resolves.toBe(true);
    await expect(firstSwitch).resolves.toBe(true);
    expect(store.currentAccountId).toBe("a");
    expect(desktopInvoke).not.toHaveBeenCalled();
  });

  it("does not change the current account until authentication and set_api_session resolve", async () => {
    const store = useUserInfoStore();
    const siteA = siteUser("account-a", "https://a.example");
    const siteB = siteUser("account-b", "https://b.example");
    store.userMap = { "account-a": siteA, "account-b": siteB };
    await store.setCurrentAccount("account-a");
    expect(store.currentAccountId).toBe("account-a");

    const pendingSession = Promise.withResolvers<{ status: string }>();
    desktopInvoke.mockImplementation((command, args) =>
      command === "set_api_session" && args.sessionKey === "account-b"
        ? pendingSession.promise
        : Promise.resolve(connectionResponse(command, args))
    );
    const pending = store.setCurrentAccount("account-b");

    expect(store.currentAccountId).toBe("account-a");
    expect(store.currentSite).toBe("https://a.example");
    await vi.waitFor(() =>
      expect(desktopInvoke).toHaveBeenCalledWith(
        "set_api_session",
        expect.objectContaining({ sessionKey: "account-b" })
      )
    );
    expect(desktopInvoke).toHaveBeenCalledWith(
      "set_api_session",
      expect.objectContaining({
        sessionKey: "account-b",
        origin: "https://b.example",
        bearerToken: "token-account-b",
        orgId: org.id
      })
    );

    pendingSession.resolve({ status: "success" });
    await pending;

    expect(store.currentAccountId).toBe("account-b");
    expect(store.currentSite).toBe("https://b.example");
  });

  it.each(["unknown", "incompatible"] as const)(
    "preserves A and its sessions when B is %s, then supports retry",
    async (status) => {
      const store = useUserInfoStore();
      store.userMap = { a: siteUser("a", "https://a.test"), b: siteUser("b", "https://b.test") };
      await store.setCurrentAccount("a");
      const before = JSON.stringify(store.$state);
      const beforeSwitch = vi.fn(async () => {});
      desktopInvoke.mockImplementation(async (command, args) =>
        command === "bootstrap_auth_session"
          ? {
              status: "blocked",
              compatibility: {
                status,
                site: args.site,
                clientVersion: "5.1.0",
                minCoreVersion: "5.1.0",
                failures: [],
                reason: "network"
              }
            }
          : { status: "success" }
      );
      await expect(store.setCurrentAccount("b", { beforeSwitch })).resolves.toBe(false);
      expect(JSON.stringify(store.$state)).toBe(before);
      expect(beforeSwitch).not.toHaveBeenCalled();
      expect(useClientCompatibility().blocked.value?.status).toBe(status);

      desktopInvoke.mockImplementation(async (command, args) => connectionResponse(command, args));
      await useClientCompatibility().retry();
      expect(store.currentAccountId).toBe("b");
      expect(beforeSwitch).toHaveBeenCalledOnce();
    }
  );

  it("ignores an old switch while a newer account is authenticated", async () => {
    const store = useUserInfoStore();
    store.userMap = {
      a: siteUser("a", "https://a.test"),
      b: siteUser("b", "https://b.test"),
      c: siteUser("c", "https://c.test")
    };
    await store.setCurrentAccount("a");
    const slow = Promise.withResolvers<any>();
    desktopInvoke.mockImplementation((command, args) =>
      command === "bootstrap_auth_session" && args.sessionId === "b"
        ? slow.promise
        : Promise.resolve(connectionResponse(command, args))
    );
    const closeB = vi.fn(async () => {});
    const pending = store.setCurrentAccount("b", { beforeSwitch: closeB });
    await expect(store.setCurrentAccount("c")).resolves.toBe(true);
    slow.resolve(connectionResponse("bootstrap_auth_session", { sessionId: "b" }));
    await expect(pending).resolves.toBe(false);
    expect(store.currentAccountId).toBe("c");
    expect(closeB).not.toHaveBeenCalled();
  });

  it.each(["unknown", "incompatible"] as const)(
    "publishes an accepted B session when a newer C check is %s before the IPC reply",
    async (status) => {
      const store = useUserInfoStore();
      store.userMap = {
        a: siteUser("a", "https://a.test"),
        b: siteUser("b", "https://b.test"),
        c: siteUser("c", "https://c.test")
      };
      await store.setCurrentAccount("a");
      let mainAccount = "a";
      const acceptedB = Promise.withResolvers<void>();
      const replyB = Promise.withResolvers<{ status: string }>();
      desktopInvoke.mockImplementation(async (command, args) => {
        if (command === "bootstrap_auth_session" && args.sessionId === "c") {
          return {
            status: "blocked",
            compatibility: {
              status,
              site: args.site,
              clientVersion: "5.1.0",
              minCoreVersion: "5.1.0",
              failures: status === "incompatible" ? ["core-too-old"] : [],
              reason: "network"
            }
          };
        }
        if (command === "set_api_session") {
          mainAccount = args.sessionKey;
          if (args.sessionKey === "b" && args.connectionId !== undefined) {
            acceptedB.resolve();
            return replyB.promise;
          }
        }
        return connectionResponse(command, args);
      });
      const switchB = store.setCurrentAccount("b");
      await acceptedB.promise;
      expect(mainAccount).toBe("b");
      expect(store.currentAccountId).toBe("a");

      await expect(store.setCurrentAccount("c")).resolves.toBe(false);
      replyB.resolve({ status: "success" });
      await expect(switchB).resolves.toBe(true);
      expect(store.currentAccountId).toBe(mainAccount);
      expect(store.currentSite).toBe("https://b.test");
      expect(useClientCompatibility().blocked.value?.site).toBe("https://c.test");
    }
  );

  it.each(["saved-account", "login"] as const)(
    "waits for the accepted %s session to be published before activating the next account",
    async (entry) => {
      const store = useUserInfoStore();
      store.userMap = {
        a: siteUser("a", "https://a.test"),
        b: siteUser("b", "https://b.test"),
        c: siteUser("c", "https://c.test")
      };
      await store.setCurrentAccount("a");
      let mainAccount = "a";
      let rendererAtCActivation = "";
      const acceptedB = Promise.withResolvers<void>();
      const checkedC = Promise.withResolvers<void>();
      const replyB = Promise.withResolvers<{ status: string }>();
      desktopInvoke.mockImplementation(async (command, args) => {
        if (command === "bootstrap_auth_session" && args.sessionId === "c") checkedC.resolve();
        if (command === "set_api_session") {
          mainAccount = args.sessionKey;
          if (args.connectionId !== undefined) {
            if (args.sessionKey === "b") {
              acceptedB.resolve();
              return replyB.promise;
            }
            if (args.sessionKey === "c") rendererAtCActivation = store.currentAccountId;
          }
        }
        return connectionResponse(command, args);
      });
      const switchB =
        entry === "saved-account"
          ? store.setCurrentAccount("b")
          : store.withSessionActivation(async () => {
              const result = await desktopInvoke("set_api_session", {
                sessionKey: "b",
                origin: "https://b.test",
                connectionId: 1
              });
              if (result.status !== "success") return false;
              store.setUserData("b", store.userMap.b!);
              return true;
            });
      await acceptedB.promise;
      const switchC = store.setCurrentAccount("c");
      await checkedC.promise;
      expect(mainAccount).toBe("b");
      expect(rendererAtCActivation).toBe("");

      replyB.resolve({ status: "success" });
      await expect(switchB).resolves.toBe(true);
      await expect(switchC).resolves.toBe(true);
      expect(rendererAtCActivation).toBe("b");
      expect(store.currentAccountId).toBe(mainAccount);
      expect(store.currentSite).toBe("https://c.test");
    }
  );

  it("allows a later activation after workspace cleanup fails", async () => {
    const store = useUserInfoStore();
    store.userMap = { a: siteUser("a", "https://a.test"), b: siteUser("b", "https://b.test") };
    await store.setCurrentAccount("a");
    await expect(
      store.setCurrentAccount("b", {
        beforeSwitch: async () => {
          throw new Error("workspace cleanup failed");
        }
      })
    ).rejects.toThrow("workspace cleanup failed");
    expect(store.currentAccountId).toBe("a");
    await expect(store.setCurrentAccount("b")).resolves.toBe(true);
    expect(store.currentAccountId).toBe("b");
  });

  it("checks the existing automatic restore of the next saved account after logout", async () => {
    const store = useUserInfoStore();
    store.userMap = { a: siteUser("a", "https://a.test"), b: siteUser("b", "https://b.test") };
    await store.setCurrentAccount("a");
    desktopInvoke.mockClear();
    desktopInvoke.mockImplementation(async (command, args) =>
      command === "bootstrap_auth_session"
        ? {
            status: "blocked",
            compatibility: {
              status: "unknown",
              site: args.site,
              clientVersion: "5.1.0",
              minCoreVersion: "5.1.0",
              failures: [],
              reason: "endpoint-missing"
            }
          }
        : { status: "success" }
    );

    await store.deleteUserData("a");
    expect(store.loggedIn).toBe(false);
    expect(store.currentAccountId).toBe("");
    expect(store.userMap.b?.bearerToken).toBe("token-b");
    expect(desktopInvoke.mock.calls.map(([command]) => command)).toEqual(["logout", "bootstrap_auth_session"]);
    expect(useClientCompatibility().blocked.value?.site).toBe("https://b.test");
  });
});

describe.each([true, false])("organization license (desktop: %s)", (desktop) => {
  const otherOrg = { ...org, id: "other-org", name: "Other", is_default: false };
  const setWebOrgId = vi.fn();

  beforeEach(() => {
    setActivePinia(createPinia());
    runtime.desktop = desktop;
    desktopInvoke.mockReset();
    desktopInvoke.mockImplementation(async (command, args) => connectionResponse(command, args));
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
