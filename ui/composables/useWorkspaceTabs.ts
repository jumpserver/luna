import type { AssetItem, PermedProtocol } from "~/types";

import { useRecentConnections } from "~/composables/useRecentConnections";
import { clearWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";

export type WorkspaceSessionStatus = "selecting" | "connecting" | "ready" | "connected" | "failed";
export type WorkspaceSplitDirection = "horizontal" | "vertical";
export type WorkspacePaneDropPlacement = "center" | "left" | "right" | "top" | "bottom";
export type WorkspacePaneMode = "empty" | "setup" | "session";
export type WorkspacePaneLayoutMode = "single" | "columns-2" | "rows-2" | "grid-2x2";

export interface WorkspaceSurfaceSession {
  id: string
  assetId: string
  assetName: string
  assetType: string
  assetPlatform: string
  assetCategory: string
  address: string
  permedProtocols?: PermedProtocol[]
  protocol: string
  account: string
  status: WorkspaceSessionStatus
  connectedAt?: number
  payload?: Record<string, any>
  setupAsset?: AssetItem
}

export interface WorkspacePane extends WorkspaceSurfaceSession {
  mode: WorkspacePaneMode
}

export interface WorkspaceSessionTab extends WorkspaceSurfaceSession {
  title?: string
  layoutMode: WorkspacePaneLayoutMode
  panes: WorkspacePane[]
}

const tabs = ref<WorkspaceSessionTab[]>([]);
const activeTabId = ref("");
const activePaneId = ref("");
const draggedTabId = ref("");
const pendingPaneTarget = ref<{ tabId: string, paneId: string } | null>(null);
let tabSequence = 0;
let paneSequence = 0;
let sessionDisposer: ((id: string) => void | Promise<void>) | null = null;

const blankSurface = (): Omit<WorkspaceSurfaceSession, "id"> => ({
  assetId: "",
  assetName: "",
  assetType: "",
  assetPlatform: "",
  assetCategory: "",
  address: "",
  permedProtocols: undefined,
  protocol: "",
  account: "",
  status: "selecting",
  connectedAt: undefined,
  payload: undefined,
  setupAsset: undefined
});

const createTabId = (assetId: string, protocol: string, account: string) => {
  tabSequence += 1;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${tabSequence}`;
  return `${assetId}:${protocol}:${account || "-"}:${random}`;
};

const createPaneId = (tabId: string) => {
  paneSequence += 1;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${paneSequence}`;
  return `pane:${tabId}:${random}`;
};

const createPane = (id: string, session: Partial<WorkspaceSurfaceSession>, mode: WorkspacePaneMode): WorkspacePane => ({
  id,
  ...blankSurface(),
  ...session,
  mode
});

const createEmptyPane = (tabId: string) => createPane(createPaneId(tabId), {}, "empty");

const syncTabFromPrimaryPane = (tab: WorkspaceSessionTab) => {
  const primaryPane = tab.panes[0];
  if (!primaryPane) return;

  tab.assetId = primaryPane.assetId;
  tab.assetName = primaryPane.assetName;
  tab.assetType = primaryPane.assetType;
  tab.assetPlatform = primaryPane.assetPlatform;
  tab.assetCategory = primaryPane.assetCategory;
  tab.address = primaryPane.address;
  tab.permedProtocols = primaryPane.permedProtocols;
  tab.protocol = primaryPane.protocol;
  tab.account = primaryPane.account;
  tab.status = primaryPane.status;
  tab.connectedAt = primaryPane.connectedAt;
  tab.payload = primaryPane.payload;
  tab.setupAsset = primaryPane.setupAsset;
};

const setLayoutForPaneCount = (
  tab: WorkspaceSessionTab,
  count = tab.panes.length,
  preferredDirection?: WorkspaceSplitDirection
) => {
  if (count <= 1) {
    tab.layoutMode = "single";
    return;
  }

  if (count === 2) {
    if (preferredDirection) {
      tab.layoutMode = preferredDirection === "vertical" ? "columns-2" : "rows-2";
      return;
    }

    tab.layoutMode = tab.layoutMode === "rows-2" ? "rows-2" : "columns-2";
    return;
  }

  tab.layoutMode = "grid-2x2";
};

const orderPanesForMerge = (
  panes: WorkspacePane[],
  sourcePane: WorkspacePane,
  targetPaneId: string,
  placement: WorkspacePaneDropPlacement
) => {
  if (placement === "center") return [...panes, sourcePane];

  const targetIndex = panes.findIndex((pane) => pane.id === targetPaneId);
  if (targetIndex === -1) return [...panes, sourcePane];

  const targetPane = panes[targetIndex]!;
  const otherPanes = panes.filter((pane) => pane !== targetPane);
  if (panes.length === 1) {
    return placement === "left" || placement === "top"
      ? [sourcePane, targetPane]
      : [targetPane, sourcePane];
  }

  if (panes.length === 2) {
    switch (placement) {
      case "left":
        return [sourcePane, targetPane, ...otherPanes];
      case "right":
        return [targetPane, sourcePane, ...otherPanes];
      case "top":
        return [sourcePane, ...otherPanes, targetPane];
      case "bottom":
        return [targetPane, ...otherPanes, sourcePane];
    }
  }

  const orderedPanes: Array<WorkspacePane | undefined> = Array.from({ length: 4 });
  const targetColumn = targetIndex % 2;
  const targetRow = targetIndex < 2 ? 0 : 1;
  let targetPosition = 0;
  let sourcePosition = 0;
  switch (placement) {
    case "left":
      targetPosition = targetRow * 2 + 1;
      sourcePosition = targetPosition - 1;
      break;
    case "right":
      targetPosition = targetRow * 2;
      sourcePosition = targetPosition + 1;
      break;
    case "top":
      targetPosition = targetColumn + 2;
      sourcePosition = targetPosition - 2;
      break;
    case "bottom":
      targetPosition = targetColumn;
      sourcePosition = targetPosition + 2;
      break;
  }

  orderedPanes[targetPosition] = targetPane;
  orderedPanes[sourcePosition] = sourcePane;
  for (const pane of otherPanes) {
    const emptyIndex = orderedPanes.findIndex((item) => !item);
    orderedPanes[emptyIndex] = pane;
  }

  return orderedPanes.filter((pane): pane is WorkspacePane => Boolean(pane));
};

const createTabFromPane = (pane: WorkspacePane): WorkspaceSessionTab => {
  const tab: WorkspaceSessionTab = {
    ...blankSurface(),
    ...pane,
    title: undefined,
    layoutMode: "single",
    panes: [pane]
  };

  syncTabFromPrimaryPane(tab);
  return tab;
};

const closeNativeSession = (id: string) => {
  Promise.resolve(sessionDisposer?.(id)).catch(() => {});
};

const findPane = (paneId: string) => {
  for (const tab of tabs.value) {
    const paneIndex = tab.panes.findIndex((pane) => pane.id === paneId);
    if (paneIndex !== -1) return { tab, pane: tab.panes[paneIndex]!, paneIndex };
  }

  return null;
};

const getFirstPaneId = (tab: WorkspaceSessionTab | null | undefined) => tab?.panes[0]?.id || "";

const activatePane = (paneId: string) => {
  const match = findPane(paneId);
  if (!match) {
    activePaneId.value = "";
    return false;
  }

  activeTabId.value = match.tab.id;
  activePaneId.value = paneId;
  return true;
};

const ensureActivePaneForTab = (tabId: string) => {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) {
    if (activeTabId.value === tabId) activePaneId.value = "";
    return;
  }

  const hasActivePane = tab.panes.some((pane) => pane.id === activePaneId.value);
  if (!hasActivePane) activePaneId.value = getFirstPaneId(tab);
};

const findSession = (match: { tabId?: string, assetId: string, protocol: string, account: string }) => {
  if (match.tabId) return findPane(match.tabId);

  for (const tab of tabs.value) {
    const paneIndex = tab.panes.findIndex((pane) =>
      pane.assetId === match.assetId
      && pane.protocol === match.protocol
      && pane.account === match.account
    );
    if (paneIndex !== -1) return { tab, pane: tab.panes[paneIndex]!, paneIndex };
  }

  return null;
};

const replacePane = (tab: WorkspaceSessionTab, paneIndex: number, pane: WorkspacePane) => {
  tab.panes.splice(paneIndex, 1, pane);
  if (paneIndex === 0) syncTabFromPrimaryPane(tab);
};

const resolvePendingTarget = (explicitPaneId?: string) => {
  if (explicitPaneId) {
    if (pendingPaneTarget.value?.paneId === explicitPaneId) pendingPaneTarget.value = null;
    return findPane(explicitPaneId);
  }
  const pending = pendingPaneTarget.value;
  pendingPaneTarget.value = null;
  if (!pending) return null;
  return findPane(pending.paneId);
};

export const useWorkspaceTabs = () => {
  const registerSessionDisposer = (disposer: ((id: string) => void | Promise<void>) | null) => {
    sessionDisposer = disposer;
  };

  const openSession = (
    asset: AssetItem,
    connection: { protocol: string, account: string, payload?: Record<string, any>, paneId?: string }
  ) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = connection.protocol || asset.savedConnection?.protocol || "ssh";
    const account = connection.account || asset.savedConnection?.username || "";
    const target = resolvePendingTarget(connection.paneId);

    const pane = createPane(target?.pane.id || createTabId(asset.id, protocol, account), {
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type || "",
      assetPlatform: asset.platform || "",
      assetCategory: asset.category || "",
      address: asset.address,
      permedProtocols: asset.permedProtocols,
      protocol,
      account,
      status: connection.payload ? "ready" : "connecting",
      payload: connection.payload,
      setupAsset: undefined
    }, "session");

    if (target) {
      replacePane(target.tab, target.paneIndex, pane);
      activeTabId.value = target.tab.id;
      activePaneId.value = pane.id;
      return pane;
    }

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const openSetupSession = (asset: AssetItem, options: { protocol?: string, paneId?: string } = {}) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = options.protocol || asset.savedConnection?.protocol || "";
    const account = asset.savedConnection?.username || "";
    const target = resolvePendingTarget(options.paneId);

    const pane = createPane(target?.pane.id || createTabId(asset.id, protocol || "setup", account), {
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type || "",
      assetPlatform: asset.platform || "",
      assetCategory: asset.category || "",
      address: asset.address,
      permedProtocols: asset.permedProtocols,
      protocol,
      account,
      status: "selecting",
      setupAsset: asset,
      payload: undefined,
      connectedAt: undefined
    }, "setup");

    if (target) {
      replacePane(target.tab, target.paneIndex, pane);
      activeTabId.value = target.tab.id;
      activePaneId.value = pane.id;
      return pane;
    }

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const openLocalShell = () => {
    const pane = createPane(createTabId("local", "local-shell", ""), {
      assetId: "local",
      assetName: "Local Shell",
      assetType: "local",
      assetPlatform: "",
      assetCategory: "terminal",
      address: "",
      protocol: "local-shell",
      account: "",
      status: "ready"
    }, "session");

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const closePane = (paneId: string) => {
    const match = findPane(paneId);
    if (!match) return;

    const { tab, pane, paneIndex } = match;
    if (tab.panes.length === 1) {
      const tabIndex = tabs.value.findIndex((item) => item.id === tab.id);
      if (tabIndex !== -1) closeSession(tab.id);
      return;
    }

    pendingPaneTarget.value = pendingPaneTarget.value?.paneId === paneId ? null : pendingPaneTarget.value;

    clearWorkspaceSessionDetails(pane.id);
    closeNativeSession(pane.id);
    tab.panes.splice(paneIndex, 1);
    setLayoutForPaneCount(tab);
    syncTabFromPrimaryPane(tab);
    if (activePaneId.value === paneId) activePaneId.value = getFirstPaneId(tab);
  };

  const closeSession = (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) {
      closePane(id);
      return;
    }

    const tab = tabs.value[index]!;
    for (const pane of tab.panes) {
      pendingPaneTarget.value = pendingPaneTarget.value?.paneId === pane.id ? null : pendingPaneTarget.value;
      clearWorkspaceSessionDetails(pane.id);
      closeNativeSession(pane.id);
    }

    tabs.value.splice(index, 1);

    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(index - 1, 0)]?.id || tabs.value[0]?.id || "";
    }
    ensureActivePaneForTab(activeTabId.value);
  };

  const closeAllSessions = () => {
    for (const tab of tabs.value) {
      for (const pane of tab.panes) {
        clearWorkspaceSessionDetails(pane.id);
        closeNativeSession(pane.id);
      }
    }

    pendingPaneTarget.value = null;
    tabs.value = [];
    activeTabId.value = "";
    activePaneId.value = "";
  };

  const closeOtherSessions = (id: string) => {
    if (!tabs.value.some((tab) => tab.id === id)) return;

    for (const tab of tabs.value) {
      if (tab.id !== id) {
        for (const pane of tab.panes) {
          clearWorkspaceSessionDetails(pane.id);
          closeNativeSession(pane.id);
        }
      }
    }

    pendingPaneTarget.value = pendingPaneTarget.value?.tabId === id ? pendingPaneTarget.value : null;
    tabs.value = tabs.value.filter((tab) => tab.id === id);
    activeTabId.value = id;
    ensureActivePaneForTab(id);
  };

  const closeLeftSessions = (id: string) => {
    while (tabs.value[0]?.id && tabs.value[0].id !== id) {
      closeSession(tabs.value[0].id);
    }
  };

  const closeRightSessions = (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    while (tabs.value.length > index + 1) {
      closeSession(tabs.value[tabs.value.length - 1]!.id);
    }
  };

  const reorderTabs = (sourceTabId: string, targetTabId: string, placement: "before" | "after" = "before") => {
    if (sourceTabId === targetTabId) return false;
    const sourceIndex = tabs.value.findIndex((tab) => tab.id === sourceTabId);
    const targetIndex = tabs.value.findIndex((tab) => tab.id === targetTabId);
    if (sourceIndex === -1 || targetIndex === -1) return false;

    const [sourceTab] = tabs.value.splice(sourceIndex, 1);
    const normalizedTargetIndex = tabs.value.findIndex((tab) => tab.id === targetTabId);
    if (normalizedTargetIndex === -1) return false;
    const insertIndex = placement === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex;
    tabs.value.splice(insertIndex, 0, sourceTab!);
    return true;
  };

  const canSplitWorkspace = (tabId: string, direction: WorkspaceSplitDirection) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return false;

    if (tab.panes.length === 1) return true;
    if (tab.panes.length === 2) {
      return (tab.layoutMode === "columns-2" && direction === "horizontal")
        || (tab.layoutMode === "rows-2" && direction === "vertical");
    }
    return tab.layoutMode === "grid-2x2" && tab.panes.length < 4;
  };

  const splitWorkspace = (tabId: string, direction: WorkspaceSplitDirection) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || !canSplitWorkspace(tabId, direction)) return [];

    if (tab.panes.length === 1) {
      tab.panes.push(createEmptyPane(tab.id));
      setLayoutForPaneCount(tab, 2, direction);
      activePaneId.value = tab.panes[1]!.id;
      return [tab.panes[1]!];
    }

    if (tab.panes.length === 2) {
      const newPanes = [createEmptyPane(tab.id), createEmptyPane(tab.id)];
      tab.panes.push(...newPanes);
      tab.layoutMode = "grid-2x2";
      activePaneId.value = newPanes[0]!.id;
      return newPanes;
    }

    const pane = createEmptyPane(tab.id);
    tab.panes.push(pane);
    tab.layoutMode = "grid-2x2";
    activePaneId.value = pane.id;
    return [pane];
  };

  const swapPanes = (tabId: string, sourcePaneId: string, targetPaneId: string) => {
    if (sourcePaneId === targetPaneId) return false;
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return false;

    const sourceIndex = tab.panes.findIndex((pane) => pane.id === sourcePaneId);
    const targetIndex = tab.panes.findIndex((pane) => pane.id === targetPaneId);
    if (sourceIndex === -1 || targetIndex === -1) return false;

    const sourcePane = tab.panes[sourceIndex]!;
    tab.panes[sourceIndex] = tab.panes[targetIndex]!;
    tab.panes[targetIndex] = sourcePane;
    syncTabFromPrimaryPane(tab);
    return true;
  };

  const placePane = (
    tabId: string,
    sourcePaneId: string,
    targetPaneId: string,
    placement: WorkspacePaneDropPlacement
  ) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || tab.panes.length !== 2 || placement === "center") {
      return swapPanes(tabId, sourcePaneId, targetPaneId);
    }

    const sourcePane = tab.panes.find((pane) => pane.id === sourcePaneId);
    const targetPane = tab.panes.find((pane) => pane.id === targetPaneId);
    if (!sourcePane || !targetPane || sourcePane === targetPane) return false;

    const sourceFirst = placement === "left" || placement === "top";
    tab.panes.splice(0, 2, ...(sourceFirst ? [sourcePane, targetPane] : [targetPane, sourcePane]));
    tab.layoutMode = placement === "left" || placement === "right" ? "columns-2" : "rows-2";
    syncTabFromPrimaryPane(tab);
    return true;
  };

  const canMergeTabs = (sourceTabId: string, targetTabId: string) => {
    if (sourceTabId === targetTabId) return false;
    const source = tabs.value.find((tab) => tab.id === sourceTabId);
    const target = tabs.value.find((tab) => tab.id === targetTabId);
    if (!source || !target) return false;

    return source.panes.length === 1 && target.panes.length < 4;
  };

  const mergeTabIntoWorkspace = (
    sourceTabId: string,
    targetTabId: string,
    targetPaneId = "",
    placement: WorkspacePaneDropPlacement = "center"
  ) => {
    if (!canMergeTabs(sourceTabId, targetTabId)) return false;

    const sourceIndex = tabs.value.findIndex((tab) => tab.id === sourceTabId);
    const target = tabs.value.find((tab) => tab.id === targetTabId);
    if (sourceIndex === -1 || !target) return false;

    const [source] = tabs.value.splice(sourceIndex, 1);
    if (!source) return false;

    const sourcePane = source.panes[0]!;
    const targetPane = target.panes.find((pane) => pane.id === targetPaneId) || target.panes[0]!;
    const orderedPanes = orderPanesForMerge(target.panes, sourcePane, targetPane.id, placement);
    target.panes.splice(0, target.panes.length, ...orderedPanes);
    const preferredDirection = placement === "top" || placement === "bottom" ? "horizontal" : "vertical";
    setLayoutForPaneCount(target, target.panes.length, preferredDirection);
    syncTabFromPrimaryPane(target);
    if (pendingPaneTarget.value?.tabId === source.id) {
      pendingPaneTarget.value = { tabId: target.id, paneId: pendingPaneTarget.value.paneId };
    }
    activeTabId.value = target.id;
    activePaneId.value = sourcePane.id;
    return true;
  };

  const getTabById = (tabId: string) => tabs.value.find((tab) => tab.id === tabId) || null;

  const beginPaneAssetSelection = (tabId: string, paneId: string) => {
    const match = findPane(paneId);
    if (!match || match.tab.id !== tabId) return;
    pendingPaneTarget.value = { tabId, paneId };
    activeTabId.value = tabId;
    activePaneId.value = paneId;
  };

  const cancelPaneAssetSelection = (paneId?: string) => {
    if (!paneId || pendingPaneTarget.value?.paneId === paneId) pendingPaneTarget.value = null;
  };

  const isPaneAwaitingAssetSelection = (paneId: string) => pendingPaneTarget.value?.paneId === paneId;

  const toSurfaceTab = (pane: WorkspacePane): WorkspaceSessionTab => ({
    ...blankSurface(),
    ...pane,
    title: undefined,
    layoutMode: "single",
    panes: [pane]
  });

  const renameTabTitle = (tabId: string, title: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return false;

    tab.title = title.trim() || undefined;
    return true;
  };

  const updateSessionPayload = (
    match: { tabId?: string, assetId: string, protocol: string, account: string },
    payload: Record<string, any>
  ) => {
    const found = findSession(match);
    if (!found) return;

    found.pane.payload = payload;
    found.pane.status = "ready";
    found.pane.mode = "session";
    if (found.paneIndex === 0) syncTabFromPrimaryPane(found.tab);
  };

  const markSessionConnecting = (paneId: string) => {
    const match = findPane(paneId);
    if (!match) return;

    match.pane.status = "connecting";
    match.pane.mode = "session";
    activePaneId.value = paneId;
    if (match.paneIndex === 0) syncTabFromPrimaryPane(match.tab);
  };

  const startSessionConnection = (
    paneId: string,
    connection: { protocol: string, account: string }
  ) => {
    const match = findPane(paneId);
    if (!match) return;

    match.pane.protocol = connection.protocol;
    match.pane.account = connection.account;
    match.pane.payload = undefined;
    match.pane.status = "connecting";
    match.pane.mode = "session";
    activePaneId.value = paneId;
    if (match.paneIndex === 0) syncTabFromPrimaryPane(match.tab);
  };

  const markSessionFailed = (match: { tabId?: string, assetId: string, protocol: string, account: string }) => {
    const found = findSession(match);
    if (!found) return;

    found.pane.status = "failed";
    found.pane.mode = "session";
    if (found.paneIndex === 0) syncTabFromPrimaryPane(found.tab);
  };

  const markSessionConnected = (paneId: string) => {
    const match = findPane(paneId);
    if (!match) return;

    match.pane.status = "connected";
    match.pane.connectedAt = Date.now();
    match.pane.mode = "session";
    activePaneId.value = paneId;
    if (match.paneIndex === 0) syncTabFromPrimaryPane(match.tab);
  };

  const setActiveSession = (id: string) => {
    activeTabId.value = id;
    ensureActivePaneForTab(id);
  };

  const setActivePane = (paneId: string) => {
    activatePane(paneId);
  };

  const activateAdjacentSession = (direction: "previous" | "next") => {
    if (tabs.value.length < 2) return;

    const currentIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value);
    const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = direction === "next"
      ? (normalizedIndex + 1) % tabs.value.length
      : (normalizedIndex - 1 + tabs.value.length) % tabs.value.length;

    activeTabId.value = tabs.value[nextIndex]!.id;
    ensureActivePaneForTab(activeTabId.value);
  };

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);

  return {
    tabs,
    activeTab,
    activeTabId,
    activePaneId,
    activateAdjacentSession,
    beginPaneAssetSelection,
    canSplitWorkspace,
    canMergeTabs,
    cancelPaneAssetSelection,
    closeAllSessions,
    closeLeftSessions,
    closeOtherSessions,
    closePane,
    closeRightSessions,
    closeSession,
    draggedTabId,
    getTabById,
    isPaneAwaitingAssetSelection,
    markSessionConnected,
    markSessionConnecting,
    markSessionFailed,
    openLocalShell,
    openSession,
    openSetupSession,
    placePane,
    reorderTabs,
    registerSessionDisposer,
    renameTabTitle,
    setActivePane,
    setActiveSession,
    splitWorkspace,
    startSessionConnection,
    swapPanes,
    toSurfaceTab,
    updateSessionPayload,
    mergeTabIntoWorkspace
  };
};
