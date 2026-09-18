import type {
  WorkspacePane,
  WorkspaceSessionTab,
  WorkspaceSplitDirection,
  WorkspaceSurfaceSession
} from "~/composables/useWorkspaceTabs";
import type { AssetItem, TokenResponse } from "~/types";

import { SFTP_FILE_EDITOR_VALUE } from "~/composables/useConnectMethods";
import { exchangeConnectToken } from "~/composables/useConnectTokenExchange";

function sessionToAsset(session: WorkspaceSurfaceSession): AssetItem {
  return {
    id: session.assetId,
    name: session.assetName,
    address: session.address,
    platform: session.assetPlatform,
    type: session.assetType,
    category: session.assetCategory,
    org_id: session.orgId,
    permedProtocols: session.permedProtocols,
    permedAccounts: session.permedAccounts,
    zone: "",
    isActive: true
  };
}

function getConnectMethod(session: Pick<WorkspaceSurfaceSession, "connectMethod" | "payload">) {
  return String(session.payload?.connectMethod?.value || session.connectMethod || "");
}

function getTokenId(tab: Pick<WorkspaceSessionTab, "payload">) {
  return String(tab.payload?.id || tab.payload?.token?.id || "");
}

async function buildPayload(tab: Pick<WorkspaceSessionTab, "payload">, token: TokenResponse) {
  let webProxy = tab.payload?.webProxy;
  if (webProxy) {
    // A connect ticket is bound to its token and cannot be reused after exchange.
    if (!webProxy.ticketEndpoint) throw new Error("missing Web Proxy ticket endpoint");
    const { ticket } = await useWorkspaceConnectors().createKokoTicket({
      baseUrl: webProxy.ticketEndpoint,
      tokenId: token.id,
      orgId: token.org_id
    });
    if (!ticket) throw new Error("Koko 未返回 Web Proxy connect ticket");
    webProxy = { ...webProxy, ticket };
  }
  return {
    ...tab.payload,
    webProxy,
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
    activePaneId,
    activeTabId,
    getTabById,
    openSession,
    openSetupSession,
    setActiveSession,
    canMergeTabs,
    mergeTabIntoWorkspace,
    splitWorkspace,
    canSplitWorkspace,
    markSessionConnecting,
    markSessionDisconnected,
    placePane,
    setActivePane,
    updateSessionPayload
  } = useWorkspaceTabs();

  const reconnectViaConnection = (tab: WorkspaceSessionTab) => {
    const connectMethod = tab.payload?.connectMethod?.value;
    const match = { tabId: tab.id, assetId: tab.assetId, protocol: tab.protocol, account: tab.account };

    void handleAssetConnection(tab.account, tab.assetId, tab.protocol, undefined, undefined, {
      tabId: tab.id,
      asset: sessionToAsset(tab),
      orgId: tab.orgId,
      connectMethod,
      onSessionReady: (payload) => updateSessionPayload(match, payload),
      onSessionError: (error) => markSessionDisconnected(tab.id, String(error))
    });
  };

  const exchangePayload = async (tab: Pick<WorkspaceSessionTab, "payload">) => {
    const tokenId = getTokenId(tab);
    if (!tokenId) throw new Error("missing token");

    return buildPayload(tab, await exchangeConnectToken(tokenId));
  };

  const cloneSession = async (tab: WorkspaceSessionTab, assertCurrent?: () => void) => {
    try {
      const payload = await exchangePayload(tab);
      assertCurrent?.();
      const newPane = openSession(sessionToAsset(tab), {
        protocol: tab.protocol,
        account: tab.account,
        payload,
        newTab: Boolean(assertCurrent)
      });
      setActiveSession(newPane.id);
      return { status: "session_started", pane_id: newPane.id };
    } catch (error) {
      if (assertCurrent) {
        assertCurrent();
        return { status: "failed" };
      }
      addErrorToast({
        title: t("TabMenu.CloneConnect"),
        description: String(error)
      });
      return { status: "failed" };
    }
  };

  const reconnectSession = async (tab: WorkspaceSessionTab, assertCurrent?: () => void) => {
    if (!assertCurrent) markSessionConnecting(tab.id);

    try {
      const payload = await exchangePayload(tab);
      assertCurrent?.();
      if (assertCurrent) markSessionConnecting(tab.id);
      updateSessionPayload(
        {
          tabId: tab.id,
          assetId: tab.assetId,
          protocol: tab.protocol,
          account: tab.account
        },
        payload
      );
      return { status: "session_started", pane_id: tab.id };
    } catch {
      if (assertCurrent) {
        assertCurrent();
        openSetupSession(sessionToAsset(tab), { protocol: tab.protocol, paneId: tab.id });
        return { status: "user_action_required", reason: "connection_setup", pane_id: tab.id };
      }
      reconnectViaConnection(tab);
      return { status: "connection_requested", pane_id: tab.id };
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
      openSession(sessionToAsset(workspaceTab), {
        protocol: workspaceTab.protocol,
        account: workspaceTab.account,
        paneId: pane.id
      });
      const payload = await exchangePayload(workspaceTab);
      updateSessionPayload(
        {
          tabId: pane.id,
          assetId: workspaceTab.assetId,
          protocol: workspaceTab.protocol,
          account: workspaceTab.account
        },
        payload
      );
    } catch (error) {
      const connectMethod = workspaceTab.payload?.connectMethod?.value;
      handleAssetConnection(workspaceTab.account, workspaceTab.assetId, workspaceTab.protocol, undefined, undefined, {
        tabId: pane.id,
        asset: sessionToAsset(workspaceTab),
        orgId: workspaceTab.orgId,
        connectMethod
      });
      addErrorToast({
        title: t("WorkspacePane.ConnectCurrent"),
        description: String(error)
      });
    }
  };

  const connectOtherPane = (_workspaceTab: WorkspaceSessionTab, pane: WorkspacePane, asset: AssetItem) => {
    openSetupSession(asset, { paneId: pane.id });
  };

  const openDevelopmentWorkspace = async (
    workspaceTab: WorkspaceSessionTab,
    terminalPane: WorkspacePane,
    requestFileToken?: () => Promise<string>
  ) => {
    const sourceIdentity = {
      paneId: terminalPane.id,
      assetId: terminalPane.assetId,
      account: terminalPane.account,
      tokenId: getTokenId(terminalPane)
    };
    const findExistingEditor = (tab: WorkspaceSessionTab, sourcePane = terminalPane) =>
      tab.panes.find(
        (pane) =>
          pane.assetId === sourcePane.assetId &&
          pane.account === sourcePane.account &&
          pane.protocol === "sftp" &&
          getConnectMethod(pane) === SFTP_FILE_EDITOR_VALUE
      );

    const focusEditor = (pane: WorkspacePane) => {
      setActiveSession(workspaceTab.id);
      setActivePane(pane.id);
      return pane;
    };
    const reportSplitLimit = () =>
      addErrorToast({
        title: t("WorkspacePane.SplitLimitTitle"),
        description: t("WorkspacePane.SplitLimitDescription")
      });

    const existingEditor = findExistingEditor(workspaceTab);
    if (existingEditor) return focusEditor(existingEditor);

    if (terminalPane.protocol.toLowerCase() !== "ssh" || !requestFileToken) {
      addErrorToast({
        title: t("RightPanel.OpenDevelopmentWorkspaceFailed"),
        description: t("RightPanel.DevelopmentWorkspaceUnavailable")
      });
      return null;
    }
    const hasEmptyPane = workspaceTab.panes.some((pane) => pane.mode === "empty");
    if (
      !hasEmptyPane &&
      !canSplitWorkspace(workspaceTab.id, "vertical") &&
      !canSplitWorkspace(workspaceTab.id, "horizontal")
    ) {
      reportSplitLimit();
      return null;
    }

    try {
      const tokenId = String(await requestFileToken()).trim();
      if (!tokenId) throw new Error(t("RightPanel.DevelopmentWorkspaceUnavailable"));

      // Do not steal focus or mutate a workspace after the user has moved elsewhere.
      if (activeTabId.value !== workspaceTab.id || activePaneId.value !== sourceIdentity.paneId) return null;

      // The token exchange is asynchronous, so resolve the live workspace again before mutating its layout.
      const currentTab = getTabById(workspaceTab.id);
      const currentTerminal = currentTab?.panes.find((pane) => pane.id === sourceIdentity.paneId);
      if (
        !currentTab ||
        !currentTerminal ||
        currentTerminal.protocol.toLowerCase() !== "ssh" ||
        currentTerminal.assetId !== sourceIdentity.assetId ||
        currentTerminal.account !== sourceIdentity.account ||
        getTokenId(currentTerminal) !== sourceIdentity.tokenId
      ) {
        return null;
      }

      const currentEditor = findExistingEditor(currentTab, currentTerminal);
      if (currentEditor) return focusEditor(currentEditor);

      const wasSinglePane = currentTab.panes.length === 1;
      let targetPane = currentTab.panes.find((pane) => pane.mode === "empty");
      if (!targetPane) {
        const direction =
          wasSinglePane && canSplitWorkspace(currentTab.id, "horizontal")
            ? "horizontal"
            : canSplitWorkspace(currentTab.id, "vertical")
              ? "vertical"
              : canSplitWorkspace(currentTab.id, "horizontal")
                ? "horizontal"
                : null;
        if (!direction) {
          reportSplitLimit();
          return null;
        }
        [targetPane] = splitWorkspace(currentTab.id, direction);
      }
      if (!targetPane) throw new Error(t("WorkspacePane.SplitLimitDescription"));

      const editorPane = openSession(sessionToAsset(currentTerminal), {
        protocol: "sftp",
        account: currentTerminal.account,
        connectMethod: SFTP_FILE_EDITOR_VALUE,
        paneId: targetPane.id,
        payload: {
          id: tokenId,
          token: { id: tokenId },
          connectMethod: {
            value: SFTP_FILE_EDITOR_VALUE,
            component: "koko",
            type: "web"
          }
        }
      });

      // A fresh development workspace follows the familiar editor-over-terminal layout.
      if (wasSinglePane) placePane(currentTab.id, editorPane.id, currentTerminal.id, "top");
      return focusEditor(editorPane);
    } catch (error) {
      addErrorToast({
        title: t("RightPanel.OpenDevelopmentWorkspaceFailed"),
        error
      });
      return null;
    }
  };

  const mergeWorkspaceTabIntoCurrent = (
    sourceTabId: string,
    targetTabId: string,
    targetPaneId: string,
    placement: WorkspacePaneDropPlacement
  ) => {
    const sourceTab = getTabById(sourceTabId);
    if (!sourceTab || !canMergeTabs(sourceTabId, targetTabId)) return false;

    return mergeTabIntoWorkspace(sourceTabId, targetTabId, targetPaneId, placement);
  };

  return {
    cloneSession,
    connectCurrentPane,
    connectOtherPane,
    mergeWorkspaceTabIntoCurrent,
    openDevelopmentWorkspace,
    reconnectSession,
    splitSession
  };
}
