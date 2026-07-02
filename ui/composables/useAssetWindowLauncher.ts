import type { AssetItem } from "~/types";

interface WindowConnectionInfo {
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

interface WindowAssetPayload {
  asset: AssetItem
  connectionInfo: WindowConnectionInfo
}

const encodePayload = (payload: WindowAssetPayload) => {
  return btoa(encodeURIComponent(JSON.stringify(payload)));
};

const decodePayload = (payload: string) => {
  return JSON.parse(decodeURIComponent(atob(payload))) as WindowAssetPayload;
};

export const useAssetWindowLauncher = () => {
  const route = useRoute();
  const router = useRouter();
  const { confirmConnection } = useAssetConnection();

  const buildWindowUrl = (payload: WindowAssetPayload) => {
    const query = new URLSearchParams({
      asset_window_payload: encodePayload(payload)
    });

    return `${route.path || "/"}?${query.toString()}`;
  };

  const openAssetInWindow = async (asset: AssetItem, connectionInfo: WindowConnectionInfo) => {
    const url = buildWindowUrl({ asset, connectionInfo });

    if (!isTauriRuntime()) {
      window.open(url, "_blank");
      return;
    }

    const label = `asset-${asset.id}-${Date.now()}`;
    // Let Tauri create an isolated workspace window for the target asset.
    const win = new useTauriWebviewWindowWebviewWindow(label, {
      url,
      title: asset.name || "JumpServer",
      width: 1440,
      height: 920,
      minWidth: 1080,
      minHeight: 720,
      center: true
    });

    return win;
  };

  const consumeWindowAssetPayload = async (payload: string) => {
    const parsed = decodePayload(payload);

    confirmConnection(parsed.asset, parsed.connectionInfo);

    const nextQuery = { ...route.query };
    delete nextQuery.asset_window_payload;
    await router.replace({ path: route.path, query: nextQuery });
  };

  return {
    openAssetInWindow,
    consumeWindowAssetPayload
  };
};
