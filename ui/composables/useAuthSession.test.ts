import type { Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const organization = (id: string, name: string, isDefault = false) => ({
  id,
  name,
  is_root: false,
  is_default: isDefault,
  is_system: false
});

const mocks = vi.hoisted(() => ({
  store: {} as any,
  desktopInvoke: vi.fn(),
  fetchResponse: null as ((url: string) => Promise<Response>) | null,
  pathname: "/"
}));

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: mocks.desktopInvoke }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.mock("~/utils/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/runtime")>()),
  pageLocation: () => ({ search: "", origin: "https://luna.test", pathname: mocks.pathname })
}));

let useAuthSession: typeof import("./useAuthSession").useAuthSession;
let currentAccountIdRef: Ref<string>;
let userMapRef: Ref<Record<string, any>>;

beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage?.clear();
  mocks.pathname = "/";
  mocks.desktopInvoke.mockReset();
  currentAccountIdRef = ref("");
  userMapRef = ref({});
  mocks.store = {
    currentAccountId: "",
    currentUser: null,
    loggedIn: false,
    withSessionActivation: vi.fn((activate: () => Promise<boolean>) => activate()),
    setUserData: vi.fn((_accountId: string, user: any) => {
      mocks.store.currentAccountId = user.accountId;
      mocks.store.currentUser = user;
      mocks.store.loggedIn = true;
    }),
    setOrganizations: vi.fn(),
    setCurrentOrg: vi.fn((org: any) => {
      mocks.store.currentUser = { ...mocks.store.currentUser, org };
    }),
    setUserLoggedIn: vi.fn((loggedIn: boolean) => {
      mocks.store.loggedIn = loggedIn;
    }),
    markSessionExpired: vi.fn((accountId: string, reason?: string) => {
      const account = userMapRef.value[accountId] || {};
      userMapRef.value[accountId] = {
        ...account,
        sessionExpired: true,
        sessionExpiredReason: reason || account.sessionExpiredReason
      };
      if (accountId === currentAccountIdRef.value) mocks.store.loggedIn = false;
    })
  };

  vi.stubGlobal("storeToRefs", () => ({ currentAccountId: currentAccountIdRef, userMap: userMapRef }));
  vi.stubGlobal("useNuxtApp", () => ({ $i18n: { t: (key: string) => key } }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useLocalePath", () => (path: unknown) => path);
  vi.stubGlobal("useState", (_key: string, init: () => unknown) => ref(init()));
  vi.stubGlobal("isDesktopRuntime", () => false);
  vi.stubGlobal("isWebAuthPath", () => false);
  vi.stubGlobal("getWebOrgId", () => "");
  vi.stubGlobal("getWebApiHeaders", () => ({}));
  vi.stubGlobal("withWebSitePrefix", (path: string) => path);
  vi.stubGlobal("redirectToWebLogin", vi.fn());
  mocks.fetchResponse = async (url) => {
    if (url.includes("permissions")) {
      return new Response(JSON.stringify({ workbench_orgs: [organization("org-1", "Operations", true)] }));
    }
    if (url.includes("orgs/orgs/current"))
      return new Response(JSON.stringify(organization("org-1", "Operations", true)));
    if (url.includes("settings/public")) return new Response(JSON.stringify({ XPACK_LICENSE_IS_VALID: true }));
    return new Response(JSON.stringify({ id: "user-1", name: "Alice" }));
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => mocks.fetchResponse!(url))
  );
  ({ useAuthSession } = await import("./useAuthSession"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("desktop session expiry", () => {
  it("retains the current account expiry notice until closed or confirmed before opening login", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const emit = vi.fn((event: string) => order.push(event));
    const navigateTo = vi.fn(async () => {
      order.push("navigate");
    });
    vi.stubGlobal("useEventBus", () => ({ emit }));
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("isDesktopRuntime", () => true);
    currentAccountIdRef.value = "account-1";
    mocks.store.loggedIn = true;
    const auth = useAuthSession();

    await expect(auth.handleDesktopAuthExpired("account-2", "idle_timeout")).resolves.toBe(false);
    expect(mocks.store.markSessionExpired).toHaveBeenCalledWith("account-2", "idle_timeout", undefined);
    expect(mocks.store.setUserLoggedIn).not.toHaveBeenCalled();
    expect(auth.expiredSessionNotice.value).toBeNull();

    await expect(auth.handleDesktopAuthExpired("account-1", "policy_changed")).resolves.toBe(true);
    expect(mocks.store.markSessionExpired).toHaveBeenCalledWith("account-1", "policy_changed", undefined);
    expect(mocks.store.loggedIn).toBe(false);
    expect(auth.expiredSessionNotice.value).toBe("account-1");
    expect(auth.expiredSessionDescription.value).toBe("Login.ExpiredPolicyChanged");
    expect(navigateTo).not.toHaveBeenCalled();
    expect(order).toEqual(["clearAssets"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(auth.expiredSessionNotice.value).toBe("account-1");

    await auth.dismissExpiredSessionNotice();
    expect(auth.expiredSessionNotice.value).toBeNull();
    expect(mocks.store.loggedIn).toBe(false);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(order).toEqual(["clearAssets"]);
    await auth.handleDesktopAuthExpired("account-1", "policy_changed");
    expect(auth.expiredSessionNotice.value).toBeNull();

    userMapRef.value["account-1"].sessionExpired = false;
    mocks.store.loggedIn = true;
    order.length = 0;
    await auth.handleDesktopAuthExpired("account-1", "absolute_timeout");
    expect(auth.expiredSessionDescription.value).toBe("Login.ExpiredLifetime");
    expect(navigateTo).not.toHaveBeenCalled();
    await auth.dismissExpiredSessionNotice(true);
    expect(auth.expiredSessionNotice.value).toBeNull();
    expect(navigateTo).toHaveBeenCalledWith({ path: "/" });
    expect(order).toEqual(["clearAssets", "navigate", "login"]);

    mocks.pathname = "/auth/browser";
    userMapRef.value["account-1"].sessionExpired = false;
    mocks.store.loggedIn = true;
    order.length = 0;
    navigateTo.mockClear();
    await expect(auth.handleDesktopAuthExpired("account-1")).resolves.toBe(true);
    await auth.dismissExpiredSessionNotice(true);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(order).toEqual(["clearAssets"]);
  });
});

describe("desktop compatibility during startup", () => {
  const loginPayload = {
    status: "success",
    connection_id: 1,
    bearer: "token-1",
    resolved_site: "https://site.test/prefix",
    profile: { status: 200, data: '{"id":"user-1","name":"Alice"}' },
    current_org: { status: 403, data: "{}" },
    permission_orgs: { status: 403, data: "{}" }
  };

  beforeEach(() => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    currentAccountIdRef.value = "account-1";
    userMapRef.value = { "account-1": { site: "https://site.test/prefix", siteName: "Private site" } };
  });

  it.each(["unknown", "incompatible"] as const)(
    "asks for confirmation when compatibility is %s and resumes the remembered account",
    async (status) => {
      const { useClientCompatibility } = await import("./useClientCompatibility");
      const compatibility = {
        status,
        site: "https://site.test/prefix",
        clientVersion: "5.1.0",
        minCoreVersion: "5.1.0",
        failures: status === "incompatible" ? ["core-too-old"] : [],
        reason: status === "unknown" ? "endpoint-missing" : undefined
      };
      mocks.desktopInvoke.mockResolvedValue({
        status: "confirmation-required",
        compatibility,
        compatibility_confirmation_id: 1
      });
      const auth = useAuthSession();

      await expect(auth.bootstrapPersistedSession()).resolves.toBe(false);
      expect(mocks.desktopInvoke.mock.calls).toEqual([
        ["client_lock_state"],
        ["bootstrap_auth_session", { site: "https://site.test/prefix", sessionId: "account-1" }]
      ]);
      expect(mocks.store.setUserData).not.toHaveBeenCalled();
      expect(mocks.store.loggedIn).toBe(false);
      expect(useClientCompatibility().pending.value).toEqual(compatibility);

      mocks.desktopInvoke.mockImplementation(async (command) =>
        command === "bootstrap_auth_session" ? loginPayload : { status: "success" }
      );
      await useClientCompatibility().confirm();
      expect(mocks.desktopInvoke).toHaveBeenCalledWith("bootstrap_auth_session", {
        site: "https://site.test/prefix",
        sessionId: "account-1",
        compatibilityConfirmationId: 1
      });
      expect(mocks.desktopInvoke.mock.calls.map(([command]) => command)).toEqual([
        "client_lock_state",
        "bootstrap_auth_session",
        "client_lock_state",
        "bootstrap_auth_session",
        "set_api_session"
      ]);
      expect(mocks.desktopInvoke).toHaveBeenLastCalledWith(
        "set_api_session",
        expect.objectContaining({ connectionId: 1, sessionKey: "account-1", origin: "https://site.test/prefix" })
      );
      expect(mocks.store.loggedIn).toBe(true);
      expect(mocks.store.setUserData).toHaveBeenCalledOnce();
      expect(mocks.store.withSessionActivation).toHaveBeenCalledOnce();
    }
  );

  it("does not publish a login when the main process rejects an obsolete approval", async () => {
    mocks.desktopInvoke.mockResolvedValue({ status: "stale" });
    await expect(useAuthSession().applyLoginPayload(loginPayload as any, { accountId: "account-1" })).resolves.toBe(
      false
    );
    expect(mocks.store.setUserData).not.toHaveBeenCalled();
    expect(mocks.store.setOrganizations).not.toHaveBeenCalled();
    expect(mocks.store.loggedIn).toBe(false);
  });

  it("keeps desktop login publication inside the shared activation step", async () => {
    const activation = Promise.withResolvers<void>();
    mocks.store.withSessionActivation.mockImplementation(async (activate: () => Promise<boolean>) => {
      await activation.promise;
      return activate();
    });
    mocks.desktopInvoke.mockResolvedValue({ status: "success" });
    const pending = useAuthSession().applyLoginPayload(loginPayload as any, {
      accountId: "account-1",
      showToast: false,
      navigateHome: false
    });
    expect(mocks.desktopInvoke).not.toHaveBeenCalled();
    expect(mocks.store.setUserData).not.toHaveBeenCalled();

    activation.resolve();
    await expect(pending).resolves.toBe(true);
    expect(mocks.store.setUserData).toHaveBeenCalledOnce();
  });
});

describe("web session bootstrap", () => {
  it("initializes the organization before exposing the authenticated session", async () => {
    await expect(useAuthSession().bootstrapPersistedSession()).resolves.toBe(true);

    expect(mocks.store.withSessionActivation).not.toHaveBeenCalled();
    expect(mocks.store.setUserData).toHaveBeenCalledOnce();
    expect(mocks.store.setUserData).toHaveBeenCalledWith(
      "https://luna.test",
      expect.objectContaining({
        availableOrgs: [organization("org-1", "Operations", true)],
        org: expect.objectContaining({ id: "org-1", name: "Operations" })
      })
    );
    expect(mocks.store.setOrganizations).toHaveBeenCalledWith([organization("org-1", "Operations", true)]);
    expect(mocks.store.setCurrentOrg).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org-1", name: "Operations" })
    );
  });

  it("uses returned permissions when the current organization request times out", async () => {
    mocks.fetchResponse = async (url) => {
      if (url.includes("permissions")) {
        return new Response(JSON.stringify({ workbench_orgs: [organization("org-1", "Operations", true)] }));
      }
      if (url.includes("orgs/orgs/current")) throw new Error("timeout");
      if (url.includes("settings/public")) return new Response(JSON.stringify({ XPACK_LICENSE_IS_VALID: true }));
      return new Response(JSON.stringify({ id: "user-1", name: "Alice" }));
    };

    await expect(useAuthSession().bootstrapPersistedSession()).resolves.toBe(true);
    expect(mocks.store.setUserData).toHaveBeenCalledWith(
      "https://luna.test",
      expect.objectContaining({
        availableOrgs: [organization("org-1", "Operations", true)],
        org: expect.objectContaining({ id: "org-1", name: "Operations" })
      })
    );
  });

  it("continues with the profile organization when organization bootstrap times out", async () => {
    mocks.fetchResponse = async (url) => {
      if (url.includes("permissions") || url.includes("orgs/orgs/current")) throw new Error("timeout");
      if (url.includes("settings/public")) return new Response(JSON.stringify({ XPACK_LICENSE_IS_VALID: true }));
      return new Response(JSON.stringify({ id: "user-1", name: "Alice", org_id: "org-1", org_name: "Operations" }));
    };

    await expect(useAuthSession().bootstrapPersistedSession()).resolves.toBe(true);
    expect(mocks.store.setUserData).toHaveBeenCalledWith(
      "https://luna.test",
      expect.objectContaining({
        availableOrgs: [],
        org: expect.objectContaining({ id: "org-1", name: "Operations" })
      })
    );
    expect(mocks.store.setOrganizations).toHaveBeenCalledWith([]);
    expect(mocks.store.setCurrentOrg).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org-1", name: "Operations" })
    );
  });
});
