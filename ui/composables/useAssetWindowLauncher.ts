import type { SessionWindowConnectionInfo } from "~/composables/useSessionWindowConnect";
import type { AssetItem } from "~/types";
import { buildSessionPath } from "~/composables/useSessionWindowConnect";

export type WindowConnectionInfo = SessionWindowConnectionInfo;

export const useAssetWindowLauncher = () => {
  const buildWindowUrl = (asset: AssetItem, connectionInfo?: WindowConnectionInfo) => {
    return buildSessionPath(asset, connectionInfo);
  };

  const openAssetInWindow = async (asset: AssetItem, connectionInfo?: WindowConnectionInfo) => {
    const url = buildWindowUrl(asset, connectionInfo);

    if (!isTauriRuntime()) {
      window.open(url, "_blank");
      return;
    }

    const label = `asset-${asset.id}-${Date.now()}`;
    const win = new useTauriWebviewWindowWebviewWindow(label, {
      url,
      title: asset.name || "JumpServer",
      width: 1440,
      height: 920,
      minWidth: 1080,
      minHeight: 720,
      center: true,
      titleBarStyle: "overlay",
      hiddenTitle: true
    });

    return win;
  };

  return {
    openAssetInWindow,
    buildWindowUrl
  };
};
