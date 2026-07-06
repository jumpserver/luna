import type { AssetItem } from "~/types";
import { clearWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";

export type WorkspaceSessionStatus = "connecting" | "ready" | "connected" | "failed";

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

export const useWorkspaceTabs = () => {
  const registerSessionDisposer = (disposer: ((id: string) => void | Promise<void>) | null) => {
    sessionDisposer = disposer;
  };

  const openSession = (asset: AssetItem, connection: { protocol: string, account: string, payload?: Record<string, any> }) => {
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

  const closeSession = (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) return;

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
        closeNativeSession(tab.id);
      }
    }

    tabs.value = tabs.value.filter((tab) => tab.id === id);
    activeTabId.value = id;
  };

  const updateSessionPayload = (
    match: { tabId?: string, assetId: string, protocol: string, account: string },
    payload: Record<string, any>
  ) => {
    const tab = findSession(match);
    if (!tab) return;

    tab.payload = payload;
    tab.status = "ready";
  };

  const markSessionFailed = (match: { tabId?: string, assetId: string, protocol: string, account: string }) => {
    const tab = findSession(match);
    if (!tab) return;

    tab.status = "failed";
  };

  const markSessionConnected = (tabId: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return;

    tab.status = "connected";
    tab.connectedAt = Date.now();
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
    closeAllSessions,
    closeOtherSessions,
    registerSessionDisposer,
    openSession,
    closeSession,
    markSessionFailed,
    markSessionConnected,
    updateSessionPayload,
    setActiveSession
  };
};
