import type {
  ChenDataViewConsoleTab,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenTabDefinition,
  ChenWorkspaceTab
} from "~/chen/types";

import { createChenDataViewEditState } from "~/chen/utils/dataViewEditing";

export function newChenWorkspaceId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function useChenWorkspaceTabs() {
  const workspaceTabs = ref<ChenTabDefinition[]>([]);
  const activeWorkspaceTabId = ref("");
  const workspaceTabState = reactive<Record<string, ChenWorkspaceTab>>({});

  const activeWorkspaceTab = computed(() => {
    return activeWorkspaceTabId.value ? workspaceTabState[activeWorkspaceTabId.value] || null : null;
  });

  function nextTabTitle(prefix: string) {
    const count = workspaceTabs.value.filter(
      (item) => item.title === prefix || item.title.startsWith(`${prefix} `)
    ).length;
    return count === 0 ? prefix : `${prefix} ${count + 1}`;
  }

  function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
    if (tab.kind !== "data-view") return tab.title;
    const normalized = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
    return normalized || tab.title;
  }

  function registerTab(tab: ChenWorkspaceTab) {
    workspaceTabs.value.push(tab);
    workspaceTabState[tab.id] = tab;
    activeWorkspaceTabId.value = tab.id;
    return tab;
  }

  function openQueryTab(nodeKey: string, title = "Query", reuseExisting = true) {
    const existingTab = reuseExisting
      ? workspaceTabs.value.find((item) => item.kind === "query" && item.nodeKey === nodeKey)
      : null;
    if (existingTab) {
      activeWorkspaceTabId.value = existingTab.id;
      return workspaceTabState[existingTab.id] || null;
    }

    const id = newChenWorkspaceId("query");
    const tab: ChenQueryConsoleTab = {
      id,
      title,
      icon: "i-lucide-terminal-square",
      kind: "query",
      nodeKey,
      statement: "",
      uploadingSql: false,
      sqlHints: {},
      hintsContext: "",
      hintsLoading: false,
      hintsRequestGeneration: 0,
      state: {},
      logs: [],
      message: null,
      resultTabs: [],
      activeResultTabId: "",
      socket: null
    };

    return registerTab(tab);
  }

  function openConsoleTab(nodeKey: string, title = "Console") {
    const id = newChenWorkspaceId("console");
    const tab: ChenPromptConsoleTab = {
      id,
      title,
      icon: "i-lucide-square-terminal",
      kind: "console",
      nodeKey,
      pendingSql: "",
      state: {},
      logs: [],
      message: null,
      historyEntries: [],
      resultTabs: [],
      activeResultTabId: "",
      socket: null
    };

    return registerTab(tab);
  }

  function openDataViewTab(nodeKey: string, title = "Data View") {
    const existingTab = workspaceTabs.value.find((item) => item.kind === "data-view" && item.nodeKey === nodeKey);
    if (existingTab) {
      activeWorkspaceTabId.value = existingTab.id;
      return workspaceTabState[existingTab.id] || null;
    }

    const id = newChenWorkspaceId("data-view");
    const tab: ChenDataViewConsoleTab = {
      id,
      title,
      icon: "i-lucide-table-properties",
      kind: "data-view",
      nodeKey,
      meta: null,
      data: null,
      state: {},
      logs: [],
      activePanel: "data",
      activePropertyTab: "basic",
      editState: createChenDataViewEditState(),
      socket: null
    };

    return registerTab(tab);
  }

  function closeTab(id: string) {
    const tab = workspaceTabState[id];
    tab?.socket?.close();
    delete workspaceTabState[id];
    workspaceTabs.value = workspaceTabs.value.filter((item) => item.id !== id);
    if (activeWorkspaceTabId.value === id) {
      activeWorkspaceTabId.value = workspaceTabs.value.at(-1)?.id || "";
    }
  }

  function closeAllTabs() {
    Object.values(workspaceTabState).forEach((tab) => tab.socket?.close());
    Object.keys(workspaceTabState).forEach((id) => delete workspaceTabState[id]);
    workspaceTabs.value = [];
    activeWorkspaceTabId.value = "";
  }

  function setActiveTab(id: string) {
    activeWorkspaceTabId.value = id;
  }

  return {
    activeWorkspaceTab,
    activeWorkspaceTabId,
    workspaceTabs,
    workspaceTabState,
    closeAllTabs,
    closeTab,
    displayWorkspaceTabTitle,
    nextTabTitle,
    openConsoleTab,
    openDataViewTab,
    openQueryTab,
    setActiveTab
  };
}
