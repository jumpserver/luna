import type { AssetItem } from "~/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useEventBus } from "./useEventBus";
import { useSidebarAssetActions } from "./useSidebarAssetActions";

const openSetupSession = vi.fn();
const getAssetDetailRequest = vi.fn();
const getConnectionInfoForAsset = vi.fn();
const confirmConnection = vi.fn();
const openSession = vi.fn();

vi.mock("~/composables/useApiRequest", () => ({
  favoriteAssetsToFolder: vi.fn(),
  getAssetDetailRequest: (...args: unknown[]) => getAssetDetailRequest(...args)
}));
vi.mock("~/composables/useAssetTree", () => ({ isAssetNameTaken: () => false }));
vi.mock("~/composables/useConnectMethods", () => ({
  isExternalClientConnectMethod: () => false,
  pickConnectMethod: () => "",
  useConnectMethods: () => ({ getMethodsForProtocol: async () => [{ value: "web_proxy" }] }),
  WEB_PROXY_NATIVE_VALUE: "web_proxy"
}));
vi.mock("~/composables/useFavoriteFolders", () => ({
  findFavoriteAssetFolderId: () => null,
  getFavoriteRootAssetCount: () => 0
}));
vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({
    currentUser: ref({ org: { id: "org" } }),
    loggedIn: ref(false),
    getConnectionInfoForAsset,
    getConnectionPreferenceForAsset: vi.fn(),
    getConnectionPreferenceForProtocol: vi.fn()
  })
}));
vi.mock("~/utils/itemName", () => ({
  hasItemName: () => false,
  isItemNameTooLong: () => false
}));

const asset: AssetItem = {
  id: "asset-1",
  name: "host",
  address: "10.0.0.1",
  org_id: "org-1",
  platform: "Linux",
  zone: "",
  type: "linux",
  category: "host",
  isActive: true
};

const webAccount = {
  id: "web-account",
  name: "admin",
  username: "admin",
  alias: "admin",
  has_secret: true,
  has_username: true,
  secret_type: "password",
  actions: [],
  date_expired: ""
};
const webAsset: AssetItem = { ...asset, category: "web", type: "website" };
const savedWebConnection = {
  protocol: "https",
  username: "admin",
  accountId: "web-account",
  accountMode: "hosted" as const,
  connectMethod: "web_proxy",
  connectOptions: { resolution: "1920x1080" }
};

describe("workspaceConnectAsset bus", () => {
  beforeEach(() => {
    openSetupSession.mockReset();
    getConnectionInfoForAsset.mockReset();
    confirmConnection.mockReset();
    openSession.mockReset().mockReturnValue({ id: "session-1" });
    vi.stubGlobal("isDesktopRuntime", () => false);
    getAssetDetailRequest.mockReset();
    getAssetDetailRequest.mockResolvedValue({ permed_accounts: [], permed_protocols: [] });
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useMediaQuery", () => ref(false));
    vi.stubGlobal("useErrorToast", () => ({ addErrorToast: vi.fn() }));
    vi.stubGlobal("useSettingManager", () => ({ appConfig: ref(null), setCollapse: vi.fn() }));
    vi.stubGlobal("useSidebarLayout", () => ({ closeHoverPreview: vi.fn() }));
    vi.stubGlobal("useAssetConnection", () => ({ confirmConnection }));
    vi.stubGlobal("useConnectionLauncher", () => ({ configure: vi.fn(), launchWithInfo: vi.fn() }));
    vi.stubGlobal("useWorkspaceTabs", () => ({
      activeTab: ref(null),
      canSplitWorkspace: () => false,
      openSession,
      openSetupSession,
      splitWorkspace: vi.fn()
    }));
    vi.stubGlobal("useAssetWindowLauncher", () => ({ dispatchAssetWindow: vi.fn() }));
    vi.stubGlobal("useAssetAction", () => ({
      handleAssetFavorite: vi.fn(),
      handleAssetRename: vi.fn(),
      handleAssetUnfavorite: vi.fn()
    }));
    vi.stubGlobal("useFavoriteFolders", () => ({
      folders: ref([]),
      rootAssets: ref([]),
      load: vi.fn(),
      favoriteToFolder: vi.fn()
    }));
    vi.stubGlobal("useRecentConnections", () => ({ recentConnections: ref([]) }));
    vi.stubGlobal("useEventBus", useEventBus);
    vi.stubGlobal("storeToRefs", (store: object) => store);
  });

  it("opens one setup session when two action consumers hear the same emit", async () => {
    useSidebarAssetActions();
    useSidebarAssetActions();
    useEventBus().emit("workspaceConnectAsset", asset);
    await vi.waitFor(() => expect(openSetupSession).toHaveBeenCalledTimes(1));
  });

  it("opens the connect dialog before asset details return", () => {
    getAssetDetailRequest.mockReturnValue(new Promise(() => {}));
    useSidebarAssetActions();
    useEventBus().emit("workspaceConnectAsset", asset);
    expect(openSetupSession).toHaveBeenCalledTimes(1);
    expect(openSetupSession).toHaveBeenCalledWith(asset);
    expect(getAssetDetailRequest).not.toHaveBeenCalled();
  });

  describe.each([false, true])("Web asset connections (desktop=%s)", (desktop) => {
    beforeEach(() => {
      vi.stubGlobal("isDesktopRuntime", () => desktop);
      getAssetDetailRequest.mockResolvedValue({
        permed_accounts: [webAccount],
        permed_protocols: [{ name: "https", port: 443, public: true }]
      });
    });

    it("opens account selection without a remembered connection, even with one account", async () => {
      await useSidebarAssetActions().handleAssetConnect(webAsset);
      expect(openSetupSession).toHaveBeenCalledWith(expect.objectContaining({ id: webAsset.id }));
      expect(confirmConnection).not.toHaveBeenCalled();
      expect(openSession).not.toHaveBeenCalled();
      expect(getAssetDetailRequest).not.toHaveBeenCalled();
    });

    it("reuses the store selection when the asset tree has no saved connection", async () => {
      getConnectionInfoForAsset.mockReturnValue(savedWebConnection);
      await useSidebarAssetActions().handleAssetConnect(webAsset);
      expect(openSetupSession).not.toHaveBeenCalled();
      expect(confirmConnection).toHaveBeenCalledWith(
        expect.objectContaining({ id: webAsset.id }),
        expect.objectContaining({
          protocol: "https",
          account: "admin",
          accountId: "web-account",
          connectMethod: "web_proxy",
          connectOptions: savedWebConnection.connectOptions,
          rememberSelection: true,
          tabId: "session-1"
        })
      );
    });

    it("returns to selection when the remembered account is no longer authorized", async () => {
      getConnectionInfoForAsset.mockReturnValue({ ...savedWebConnection, username: "removed", accountId: "removed" });
      await useSidebarAssetActions().handleAssetConnect(webAsset);
      expect(openSetupSession).toHaveBeenCalledTimes(1);
      expect(confirmConnection).not.toHaveBeenCalled();
    });

    it("allows explicit account selection even with a remembered connection", () => {
      getConnectionInfoForAsset.mockReturnValue(savedWebConnection);
      useSidebarAssetActions();
      useEventBus().emit("workspaceConnectAsset", webAsset);
      expect(openSetupSession).toHaveBeenCalledWith(webAsset);
      expect(confirmConnection).not.toHaveBeenCalled();
    });
  });
});
