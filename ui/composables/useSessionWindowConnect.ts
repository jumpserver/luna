import type { AssetItem } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

export interface SessionWindowConnectionInfo {
  protocol: string;
  account: string;
  manualUsername: string;
  manualPassword: string;
  dynamicPassword: string;
  rememberSecret: boolean;
  rememberSelection?: boolean;
  connectMethod: string;
  connectOptions?: Record<string, any>;
  accountId?: string;
  availableProtocols?: string[];
  accountMode: "hosted" | "dynamic" | "manual" | "anonymous";
}

interface LegacyWindowAssetPayload {
  asset: AssetItem;
  connectionInfo: SessionWindowConnectionInfo;
}

export const decodeLegacyWindowPayload = (payload: string) => {
  return JSON.parse(decodeURIComponent(atob(payload))) as LegacyWindowAssetPayload;
};

export function buildSessionPath(asset: AssetItem, connectionInfo?: SessionWindowConnectionInfo) {
  const query = new URLSearchParams();
  if (!connectionInfo) return `/session/${encodeURIComponent(asset.id)}`;

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
  return mapAssetDetail(assetId, await getAssetDetailRequest(assetId));
}

export function useSessionWindowConnect() {
  const route = useRoute();
  const { activeTab, openSetupSession } = useWorkspaceTabs();
  const userInfoStore = useUserInfoStore();
  const loading = ref(false);
  const error = ref("");

  const ensureConnected = async () => {
    const assetId = String(route.params.assetId || "");
    if (!assetId || loading.value) return;
    if (activeTab.value?.assetId === assetId) return;

    const saved = userInfoStore.getConnectionInfoForAsset(assetId);
    const preference = userInfoStore.getConnectionPreferenceForAsset(assetId);
    loading.value = true;
    error.value = "";

    try {
      const asset = await fetchSessionAsset(assetId);
      asset.savedConnection = saved || undefined;
      openSetupSession(asset, {
        protocol: String(route.query.protocol || preference?.protocol || saved?.protocol || "")
      });
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
