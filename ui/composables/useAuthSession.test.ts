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
  fetchResponse: null as ((url: string) => Promise<Response>) | null,
  pathname: "/"
}));

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.mock("~/utils/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/runtime")>()),
  pageLocation: () => ({ search: "", origin: "https://luna.test", pathname: mocks.pathname })
}));

let useAuthSession: typeof import("./useAuthSession").useAuthSession;
let currentAccountIdRef: Ref<string>;

beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage?.clear();
  mocks.pathname = "/";
  currentAccountIdRef = ref("");
  const userMap = ref({});
  mocks.store = {
    currentAccountId: "",
    currentUser: null,
    loggedIn: false,
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
    })
  };

  vi.stubGlobal("storeToRefs", () => ({ currentAccountId: currentAccountIdRef, userMap }));
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
  it("reauthenticates only the expired current account from every layout", async () => {
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

    await expect(auth.handleDesktopAuthExpired("account-2")).resolves.toBe(false);
    expect(mocks.store.setUserLoggedIn).not.toHaveBeenCalled();

    await expect(auth.handleDesktopAuthExpired("account-1")).resolves.toBe(true);
    expect(mocks.store.setUserLoggedIn).toHaveBeenCalledWith(false);
    expect(navigateTo).toHaveBeenCalledWith({ path: "/" });
    expect(order).toEqual(["clearAssets", "navigate", "login"]);

    mocks.pathname = "/auth/browser";
    mocks.store.loggedIn = true;
    order.length = 0;
    navigateTo.mockClear();
    await expect(auth.handleDesktopAuthExpired("account-1")).resolves.toBe(true);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(order).toEqual(["clearAssets"]);
  });
});

describe("web session bootstrap", () => {
  it("initializes the organization before exposing the authenticated session", async () => {
    await expect(useAuthSession().bootstrapPersistedSession()).resolves.toBe(true);

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
