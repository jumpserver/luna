import type { AssetItem } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

export interface SessionWindowConnectionInfo {
  protocol: string
  account: string
  manualUsername: string
  manualPassword: string
  dynamicPassword: string
  rememberSecret: boolean
  rememberSelection?: boolean
  connectMethod: string
  connectOptions?: Record<string, any>
  accountId?: string
  availableProtocols?: string[]
  accountMode: "hosted" | "dynamic" | "manual" | "anonymous"
}

interface LegacyWindowAssetPayload {
  asset: AssetItem
  connectionInfo: SessionWindowConnectionInfo
}

export const decodeLegacyWindowPayload = (payload: string) => {
  return JSON.parse(decodeURIComponent(atob(payload))) as LegacyWindowAssetPayload;
};

export function buildSessionPath(asset: AssetItem, connectionInfo: SessionWindowConnectionInfo) {
  const query = new URLSearchParams();
  query.set("protocol", connectionInfo.protocol);
  if (connectionInfo.account) query.set("account", connectionInfo.account);
  query.set("accountMode", connectionInfo.accountMode);
  if (connectionInfo.accountId) query.set("accountId", connectionInfo.accountId);
  if (connectionInfo.connectMethod) query.set("method", connectionInfo.connectMethod);

  return `/session/${encodeURIComponent(asset.id)}?${query.toString()}`;
}

function mapAssetDetail(assetId: string, detail: Record<string, any>): AssetItem {
  const permedProtocols = (detail.permed_protocols ?? []).filter(
    (protocol: { name?: string }) => protocol?.name !== "winrm"
  );

  return {
    id: assetId,
    name: detail.name || assetId,
    address: detail.address || "-",
    platform: detail.platform?.name || detail.platform || "",
    zone: detail.zone?.name || detail.zone || "",
    isActive: true,
    category: detail.category?.value || detail.category || "",
    type: detail.type?.value || detail.type || "",
    permedAccounts: detail.permed_accounts ?? [],
    permedProtocols
  };
}

async function fetchSessionAsset(assetId: string): Promise<AssetItem> {
  if (isTauriRuntime()) {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let unlistenSuccess: (() => void) | undefined;
      let unlistenFailure: (() => void) | undefined;

      const finish = (handler: () => void) => {
        if (settled) return;
        settled = true;
        unlistenSuccess?.();
        unlistenFailure?.();
        handler();
      };

      void Promise.all([
        useTauriEventListen("get-asset-detail-success", (event) => {
          const payload = event.payload as { asset_id?: string, data?: string };
          if (payload.asset_id !== assetId || !payload.data) return;

          finish(() => {
            try {
              resolve(mapAssetDetail(assetId, JSON.parse(payload.data!)));
            } catch (cause) {
              reject(cause instanceof Error ? cause : new Error(String(cause)));
            }
          });
        }).then((unlisten) => {
          unlistenSuccess = unlisten;
        }),
        useTauriEventListen("get-asset-detail-failure", () => {
          finish(() => reject(new Error("failed to load asset detail")));
        }).then((unlisten) => {
          unlistenFailure = unlisten;
        })
      ]).then(() => {
        void useTauriCoreInvoke("get_asset_detail", { assetId });
      }).catch((cause) => {
        finish(() => reject(cause instanceof Error ? cause : new Error(String(cause))));
      });
    });
  }

  const response = await fetch(withWebSitePrefix(`/api/v1/perms/users/self/assets/${assetId}/`), {
    credentials: "include",
    headers: getWebApiHeaders()
  });

  if (!response.ok) {
    throw new Error(`failed to load asset detail: ${response.status}`);
  }

  return mapAssetDetail(assetId, await response.json());
}

export function useSessionWindowConnect() {
  const route = useRoute();
  const { confirmConnection } = useAssetConnection();
  const { activeTab } = useWorkspaceTabs();
  const userInfoStore = useUserInfoStore();
  const loading = ref(false);
  const error = ref("");

  const ensureConnected = async () => {
    const assetId = String(route.params.assetId || "");
    if (!assetId || loading.value) return;
    if (activeTab.value?.assetId === assetId) return;

    const saved = userInfoStore.getConnectionInfoForAsset(assetId);
    const preference = userInfoStore.getConnectionPreferenceForAsset(assetId);
    const connectionInfo: SessionWindowConnectionInfo = {
      protocol: String(route.query.protocol || saved?.protocol || preference?.protocol || ""),
      account: String(route.query.account || saved?.username || preference?.username || ""),
      accountMode: String(route.query.accountMode || saved?.accountMode || preference?.accountMode || "hosted") as SessionWindowConnectionInfo["accountMode"],
      accountId: String(route.query.accountId || saved?.accountId || preference?.accountId || "") || undefined,
      connectMethod: String(route.query.method || saved?.connectMethod || preference?.connectMethod || ""),
      manualUsername: saved?.manualUsername || "",
      manualPassword: saved?.manualPassword || "",
      dynamicPassword: saved?.dynamicPassword || "",
      rememberSecret: saved?.rememberSecret ?? false,
      rememberSelection: false,
      connectOptions: saved?.connectOptions
    };

    if (!connectionInfo.protocol) {
      error.value = "missing protocol";
      return;
    }

    loading.value = true;
    error.value = "";

    try {
      const asset = await fetchSessionAsset(assetId);
      await confirmConnection(asset, connectionInfo);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  };

  return {
    ensureConnected,
    loading,
    error
  };
}
