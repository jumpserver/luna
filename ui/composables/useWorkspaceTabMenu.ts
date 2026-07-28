import type { WorkspacePane, WorkspaceSessionTab, WorkspaceSplitDirection } from "~/composables/useWorkspaceTabs";
import type { AssetItem } from "~/types";

import { exchangeConnectToken } from "~/composables/useConnectTokenExchange";

function tabToAsset(tab: WorkspaceSessionTab): AssetItem {
  return {
    id: tab.assetId,
    name: tab.assetName,
    address: tab.address,
    platform: tab.assetPlatform,
    type: tab.assetType,
    category: tab.assetCategory,
    permedProtocols: tab.permedProtocols,
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
  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const { handleAssetConnection } = useAssetAction();
  const {
    getTabById,
    openSession,
    openSetupSession,
    setActiveSession,
    mergeTabIntoWorkspace,
    splitWorkspace,
    canSplitWorkspace,
    beginPaneAssetSelection,
    markSessionConnecting,
    updateSessionPayload
  } = useWorkspaceTabs();

  const reconnectViaConnection = (tab: WorkspaceSessionTab) => {
    const connectMethod = tab.payload?.connectMethod?.value;

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
      const newPane = openSession(tabToAsset(tab), {
        protocol: tab.protocol,
        account: tab.account,
        payload: buildPayload(tab, token)
      });
      setActiveSession(newPane.id);
    } catch (error) {
      addErrorToast({
        title: t("TabMenu.CloneConnect"),
        description: String(error),
      });
    }
  };

  const reconnectSession = async (tab: WorkspaceSessionTab) => {
    markSessionConnecting(tab.id);

    try {
      const token = await exchangeToken(tab);
      updateSessionPayload({
        tabId: tab.id,
        assetId: tab.assetId,
        protocol: tab.protocol,
        account: tab.account
      }, buildPayload(tab, token));
    } catch {
      reconnectViaConnection(tab);
    }
  };

  const splitSession = (tab: WorkspaceSessionTab, direction: WorkspaceSplitDirection) => {
    if (!canSplitWorkspace(tab.id, direction)) return;
    splitWorkspace(tab.id, direction);
    setActiveSession(tab.id);
  };

  const connectCurrentPane = async (workspaceTab: WorkspaceSessionTab, pane: WorkspacePane) => {
    if (workspaceTab.status === "selecting" && workspaceTab.setupAsset) {
      openSetupSession(workspaceTab.setupAsset, {
        protocol: workspaceTab.protocol || undefined,
        paneId: pane.id
      });
      return;
    }

    try {
      markSessionConnecting(pane.id);
      openSession(tabToAsset(workspaceTab), {
        protocol: workspaceTab.protocol,
        account: workspaceTab.account,
        paneId: pane.id
      });
      const token = await exchangeToken(workspaceTab);
      updateSessionPayload({
        tabId: pane.id,
        assetId: workspaceTab.assetId,
        protocol: workspaceTab.protocol,
        account: workspaceTab.account
      }, buildPayload(workspaceTab, token));
    } catch (error) {
      const connectMethod = workspaceTab.payload?.connectMethod?.value;
      handleAssetConnection(workspaceTab.account, workspaceTab.assetId, workspaceTab.protocol, undefined, undefined, {
        tabId: pane.id,
        asset: tabToAsset(workspaceTab),
        connectMethod
      });
      addErrorToast({
        title: t("WorkspacePane.ConnectCurrent"),
        description: String(error),
      });
    }
  };

  const connectOtherPane = (workspaceTab: WorkspaceSessionTab, pane: WorkspacePane) => {
    beginPaneAssetSelection(workspaceTab.id, pane.id);
  };

  const refreshPanePayload = async (tab: WorkspaceSessionTab) => {
    const token = await exchangeToken(tab);
    updateSessionPayload({
      tabId: tab.id,
      assetId: tab.assetId,
      protocol: tab.protocol,
      account: tab.account
    }, buildPayload(tab, token));
  };

  const mergeWorkspaceTabIntoCurrent = async (sourceTabId: string, targetTabId: string) => {
    const sourceTab = getTabById(sourceTabId);
    if (!sourceTab) return false;

    const refreshablePanes = sourceTab.panes.filter((pane) => pane.mode === "session" && getTokenId(pane as WorkspaceSessionTab));

    try {
      for (const pane of refreshablePanes) {
        await refreshPanePayload(pane as WorkspaceSessionTab);
      }
    } catch (error) {
      addErrorToast({
        title: t("WorkspacePane.RefreshTokenFailed"),
        description: String(error),
      });
      return false;
    }

    return mergeTabIntoWorkspace(sourceTabId, targetTabId);
  };

  return {
    cloneSession,
    connectCurrentPane,
    connectOtherPane,
    mergeWorkspaceTabIntoCurrent,
    reconnectSession,
    splitSession
  };
}
