import type { AssetItem } from "~/types";
import { useRecentConnections } from "~/composables/useRecentConnections";
import { clearWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";

export type WorkspaceSessionStatus = "selecting" | "connecting" | "ready" | "connected" | "failed";

export interface WorkspaceSplitSession {
  id: string
  payload?: Record<string, any>
  status: WorkspaceSessionStatus
}

export interface WorkspaceSessionTab {
  id: string
  assetId: string
  assetName: string
  assetType: string
  assetPlatform: string
  assetCategory: string
  address: string
  protocol: string
  account: string
  status: WorkspaceSessionStatus
  connectedAt?: number
  payload?: Record<string, any>
  setupAsset?: AssetItem
  splitSessions?: WorkspaceSplitSession[]
}

const tabs = ref<WorkspaceSessionTab[]>([]);
const activeTabId = ref("");
let tabSequence = 0;
let sessionDisposer: ((id: string) => void | Promise<void>) | null = null;

const createTabId = (assetId: string, protocol: string, account: string) => {
  tabSequence += 1;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${tabSequence}`;
  return `${assetId}:${protocol}:${account || "-"}:${random}`;
};

const findSession = (match: { tabId?: string, assetId: string, protocol: string, account: string }) => {
  if (match.tabId) return tabs.value.find((item) => item.id === match.tabId);

  return tabs.value.find(
    (item) =>
      item.assetId === match.assetId
      && item.protocol === match.protocol
      && item.account === match.account
  );
};

const closeNativeSession = (id: string) => {
  Promise.resolve(sessionDisposer?.(id)).catch(() => {});
};

const findSplitSession = (tabId: string) => {
  for (const tab of tabs.value) {
    const split = tab.splitSessions?.find((item) => item.id === tabId);
    if (split) return { tab, split };
  }

  return null;
};

export const useWorkspaceTabs = () => {
  const registerSessionDisposer = (disposer: ((id: string) => void | Promise<void>) | null) => {
    sessionDisposer = disposer;
  };

  const openSession = (asset: AssetItem, connection: { protocol: string, account: string, payload?: Record<string, any> }) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = connection.protocol || asset.savedConnection?.protocol || "ssh";
    const account = connection.account || asset.savedConnection?.username || "";

    const tab: WorkspaceSessionTab = {
      id: createTabId(asset.id, protocol, account),
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type || "",
      assetPlatform: asset.platform || "",
      assetCategory: asset.category || "",
      address: asset.address,
      protocol,
      account,
      status: connection.payload ? "ready" : "connecting",
      payload: connection.payload
    };

    tabs.value.push(tab);
    activeTabId.value = tab.id;

    return tab;
  };

  const openSetupSession = (asset: AssetItem, options: { protocol?: string } = {}) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = options.protocol || asset.savedConnection?.protocol || "";
    const account = asset.savedConnection?.username || "";

    const tab: WorkspaceSessionTab = {
      id: createTabId(asset.id, protocol || "setup", account),
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.type || "",
      assetPlatform: asset.platform || "",
      assetCategory: asset.category || "",
      address: asset.address,
      protocol,
      account,
      status: "selecting",
      setupAsset: asset
    };

    tabs.value.push(tab);
    activeTabId.value = tab.id;

    return tab;
  };

  const closeSession = (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) {
      const splitMatch = findSplitSession(id);
      if (!splitMatch?.tab.splitSessions) return;

      const splitIndex = splitMatch.tab.splitSessions.findIndex((item) => item.id === id);
      if (splitIndex === -1) return;

      clearWorkspaceSessionDetails(id);
      closeNativeSession(id);
      splitMatch.tab.splitSessions.splice(splitIndex, 1);
      return;
    }

    const tab = tabs.value[index]!;
    for (const split of tab.splitSessions || []) {
      clearWorkspaceSessionDetails(split.id);
      closeNativeSession(split.id);
    }

    clearWorkspaceSessionDetails(id);
    closeNativeSession(id);

    tabs.value.splice(index, 1);

    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(index - 1, 0)]?.id || tabs.value[0]?.id || "";
    }
  };

  const closeAllSessions = () => {
    for (const tab of tabs.value) {
      closeNativeSession(tab.id);
    }

    tabs.value = [];
    activeTabId.value = "";
  };

  const closeOtherSessions = (id: string) => {
    if (!tabs.value.some((tab) => tab.id === id)) return;

    for (const tab of tabs.value) {
      if (tab.id !== id) {
        for (const split of tab.splitSessions || []) {
          clearWorkspaceSessionDetails(split.id);
          closeNativeSession(split.id);
        }
        closeNativeSession(tab.id);
      }
    }

    tabs.value = tabs.value.filter((tab) => tab.id === id);
    activeTabId.value = id;
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

  const addSplitSession = (tabId: string, payload: Record<string, any>) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || tab.splitSessions?.length) return;

    tab.splitSessions = [{
      id: `split:${tabId}:${Date.now()}`,
      payload,
      status: "connecting"
    }];
  };

  const toSurfaceTab = (tab: WorkspaceSessionTab, surfaceId: string, payload?: Record<string, any>, status?: WorkspaceSessionStatus): WorkspaceSessionTab => ({
    ...tab,
    id: surfaceId,
    payload: payload ?? tab.payload,
    status: status ?? tab.status,
    splitSessions: undefined
  });

  const updateSessionPayload = (
    match: { tabId?: string, assetId: string, protocol: string, account: string },
    payload: Record<string, any>
  ) => {
    if (match.tabId) {
      const splitMatch = findSplitSession(match.tabId);
      if (splitMatch) {
        splitMatch.split.payload = payload;
        splitMatch.split.status = "ready";
        return;
      }
    }

    const tab = findSession(match);
    if (!tab) return;

    tab.payload = payload;
    tab.status = "ready";
  };

  const markSessionConnecting = (tabId: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab) {
      tab.status = "connecting";
      return;
    }

    const splitMatch = findSplitSession(tabId);
    if (splitMatch) splitMatch.split.status = "connecting";
  };

  const startSessionConnection = (
    tabId: string,
    connection: { protocol: string, account: string }
  ) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return;

    tab.protocol = connection.protocol;
    tab.account = connection.account;
    tab.payload = undefined;
    tab.status = "connecting";
  };

  const markSessionFailed = (match: { tabId?: string, assetId: string, protocol: string, account: string }) => {
    if (match.tabId) {
      const splitMatch = findSplitSession(match.tabId);
      if (splitMatch) {
        splitMatch.split.status = "failed";
        return;
      }
    }

    const tab = findSession(match);
    if (!tab) return;

    tab.status = "failed";
  };

  const markSessionConnected = (tabId: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab) {
      tab.status = "connected";
      tab.connectedAt = Date.now();
      return;
    }

    const splitMatch = findSplitSession(tabId);
    if (!splitMatch) return;

    splitMatch.split.status = "connected";
  };

  const setActiveSession = (id: string) => {
    activeTabId.value = id;
  };

  const activateAdjacentSession = (direction: "previous" | "next") => {
    if (tabs.value.length < 2) return;

    const currentIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value);
    const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = direction === "next"
      ? (normalizedIndex + 1) % tabs.value.length
      : (normalizedIndex - 1 + tabs.value.length) % tabs.value.length;

    activeTabId.value = tabs.value[nextIndex]!.id;
  };

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);

  return {
    tabs,
    activeTab,
    activeTabId,
    activateAdjacentSession,
    addSplitSession,
    closeAllSessions,
    closeLeftSessions,
    closeOtherSessions,
    closeRightSessions,
    registerSessionDisposer,
    openSession,
    openSetupSession,
    closeSession,
    markSessionFailed,
    markSessionConnecting,
    markSessionConnected,
    toSurfaceTab,
    startSessionConnection,
    updateSessionPayload,
    setActiveSession
  };
};
