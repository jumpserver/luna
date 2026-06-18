import type { AssetItem } from "~/types";

export type WorkspaceSessionStatus = "connecting" | "ready" | "connected" | "failed";

export interface WorkspaceSessionTab {
  id: string
  assetId: string
  assetName: string
  address: string
  protocol: string
  account: string
  status: WorkspaceSessionStatus
  payload?: Record<string, any>
}

const tabs = ref<WorkspaceSessionTab[]>([]);
const activeTabId = ref("");
let tabSequence = 0;

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

export const useWorkspaceTabs = () => {
  const openSession = (asset: AssetItem, connection: { protocol: string, account: string }) => {
    const protocol = connection.protocol || asset.savedConnection?.protocol || "ssh";
    const account = connection.account || asset.savedConnection?.username || "";

    const tab: WorkspaceSessionTab = {
      id: createTabId(asset.id, protocol, account),
      assetId: asset.id,
      assetName: asset.name,
      address: asset.address,
      protocol,
      account,
      status: "connecting"
    };

    tabs.value.push(tab);
    activeTabId.value = tab.id;

    return tab;
  };

  const closeSession = (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    useTauriCoreInvoke("builtin_session_close", {
      payload: { tabId: id }
    }).catch(() => {});

    tabs.value.splice(index, 1);

    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(index - 1, 0)]?.id || tabs.value[0]?.id || "";
    }
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
  };

  const setActiveSession = (id: string) => {
    activeTabId.value = id;
  };

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);

  return {
    tabs,
    activeTab,
    activeTabId,
    openSession,
    closeSession,
    markSessionFailed,
    markSessionConnected,
    updateSessionPayload,
    setActiveSession
  };
};
