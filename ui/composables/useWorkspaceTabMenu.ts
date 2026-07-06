import type { AssetItem } from "~/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { exchangeConnectToken } from "~/composables/useConnectTokenExchange";

function tabToAsset(tab: WorkspaceSessionTab): AssetItem {
  return {
    id: tab.assetId,
    name: tab.assetName,
    address: tab.address,
    platform: tab.assetPlatform,
    type: tab.assetType,
    category: tab.assetCategory,
    zone: "",
    isActive: true
  };
}

function getTokenId(tab: WorkspaceSessionTab) {
  return String(tab.payload?.id || tab.payload?.token?.id || "");
}

function buildPayload(tab: WorkspaceSessionTab, token: Record<string, any>) {
  return {
    ...tab.payload,
    token,
    ...token,
    connectMethod: tab.payload?.connectMethod
  };
}

export function useWorkspaceTabMenu() {
  const toast = useToast();
  const { t } = useI18n();
  const { handleAssetConnection } = useAssetAction();
  const {
    openSession,
    setActiveSession,
    addSplitSession
  } = useWorkspaceTabs();

  const reconnectViaConnection = (tab: WorkspaceSessionTab) => {
    const connectMethod = tab.payload?.connectMethod?.value;

    tab.status = "connecting";
    tab.payload = undefined;

    handleAssetConnection(tab.account, tab.assetId, tab.protocol, undefined, undefined, {
      tabId: tab.id,
      asset: tabToAsset(tab),
      connectMethod
    });
  };

  const exchangeToken = async (tab: WorkspaceSessionTab) => {
    const tokenId = getTokenId(tab);
    if (!tokenId) throw new Error("missing token");

    return await exchangeConnectToken(tokenId);
  };

  const cloneSession = async (tab: WorkspaceSessionTab) => {
    try {
      const token = await exchangeToken(tab);
      const newTab = openSession(tabToAsset(tab), {
        protocol: tab.protocol,
        account: tab.account,
        payload: buildPayload(tab, token)
      });
      setActiveSession(newTab.id);
    } catch (error) {
      toast.add({
        title: t("TabMenu.CloneConnect"),
        description: String(error),
        color: "error"
      });
    }
  };

  const reconnectSession = async (tab: WorkspaceSessionTab) => {
    try {
      const token = await exchangeToken(tab);
      tab.status = "connecting";
      tab.payload = buildPayload(tab, token);
    } catch {
      reconnectViaConnection(tab);
    }
  };

  const splitSession = async (tab: WorkspaceSessionTab) => {
    if (tab.splitSessions?.length) return;

    try {
      const token = await exchangeToken(tab);
      addSplitSession(tab.id, buildPayload(tab, token));
      setActiveSession(tab.id);
    } catch (error) {
      toast.add({
        title: t("TabMenu.SplitVertically"),
        description: String(error),
        color: "error"
      });
    }
  };

  return {
    cloneSession,
    reconnectSession,
    splitSession
  };
}
