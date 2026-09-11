import type { AssetItem } from "~/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useEventBus } from "./useEventBus";
import { useSidebarAssetActions } from "./useSidebarAssetActions";

const openSetupSession = vi.fn();
const getAssetDetailRequest = vi.fn();

vi.mock("~/composables/useApiRequest", () => ({
  favoriteAssetsToFolder: vi.fn(),
  getAssetDetailRequest: (...args: unknown[]) => getAssetDetailRequest(...args)
}));
vi.mock("~/composables/useAssetTree", () => ({ isAssetNameTaken: () => false }));
vi.mock("~/composables/useConnectMethods", () => ({
  isExternalClientConnectMethod: () => false,
  pickConnectMethod: () => "",
  useConnectMethods: () => ({ getMethodsForProtocol: async () => [] }),
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
    getConnectionInfoForAsset: vi.fn(),
    getConnectionPreferenceForAsset: vi.fn(),
    getConnectionPreferenceForProtocol: vi.fn()
  })
}));
vi.mock("~/utils/connection", () => ({
  hasReusableSavedConnection: () => false,
  isSavedConnectionAvailable: () => false
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

describe("workspaceConnectAsset bus", () => {
  beforeEach(() => {
    openSetupSession.mockReset();
    getAssetDetailRequest.mockReset();
    getAssetDetailRequest.mockResolvedValue({ permed_accounts: [], permed_protocols: [] });
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useMediaQuery", () => ref(false));
    vi.stubGlobal("useErrorToast", () => ({ addErrorToast: vi.fn() }));
    vi.stubGlobal("useSettingManager", () => ({ appConfig: ref(null), setCollapse: vi.fn() }));
    vi.stubGlobal("useSidebarLayout", () => ({ closeHoverPreview: vi.fn() }));
    vi.stubGlobal("useAssetConnection", () => ({ confirmConnection: vi.fn() }));
    vi.stubGlobal("useConnectionLauncher", () => ({ configure: vi.fn(), launchWithInfo: vi.fn() }));
    vi.stubGlobal("useWorkspaceTabs", () => ({
      activeTab: ref(null),
      canSplitWorkspace: () => false,
      openSession: vi.fn(),
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
});
