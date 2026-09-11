import type { useWorkspaceAssistantRuntime } from "./useWorkspaceAssistantSession";
import {
  disposeWorkspaceAssistantSession,
  ensureWorkspaceAssistantSession,
  interruptWorkspaceAssistant,
  isWorkspaceAssistantBusy,
  workspaceAssistantScopeId
} from "./useWorkspaceAssistantSession";

const sessions = new Map<string, ReturnType<typeof ensureWorkspaceAssistantSession>>();
const session = shallowRef<ReturnType<typeof ensureWorkspaceAssistantSession> | null>(null);
let subscribers = 0;

export function useWorkspaceAssistantPanelSession(runtime: ReturnType<typeof useWorkspaceAssistantRuntime>) {
  const scopeId = computed(() => session.value?.scopeId || "");
  const activeTabId = computed(() => runtime.tabs.activeTabId.value);
  const context = computed(() => {
    const { loggedIn, currentSite, currentAccountId, orgId } = runtime.userInfoStore;
    return loggedIn && [currentSite, currentAccountId, orgId].some(Boolean)
      ? JSON.stringify([currentSite, currentAccountId, orgId])
      : "";
  });

  function ensureTabSession(tabId: string) {
    const existing = sessions.get(tabId);
    if (existing) return existing;
    const created = ensureWorkspaceAssistantSession(workspaceAssistantScopeId(), runtime, tabId);
    sessions.set(tabId, created);
    return created;
  }

  function disposeTabSession(tabId: string) {
    const existing = sessions.get(tabId);
    if (!existing) return;
    if (session.value === existing) session.value = null;
    sessions.delete(tabId);
    disposeWorkspaceAssistantSession(existing.scopeId);
  }

  function clear() {
    runtime.automation.clearAssetSelectionRequest();
    for (const existing of sessions.values()) disposeWorkspaceAssistantSession(existing.scopeId);
    sessions.clear();
    session.value = null;
  }

  function newSession() {
    if (!context.value || !session.value) return;
    const tabId = activeTabId.value;
    const previous = sessions.get(tabId);
    if (previous !== session.value) return;
    interruptWorkspaceAssistant(previous.scopeId);
    disposeTabSession(tabId);
    session.value = ensureTabSession(tabId);
  }

  watch(
    [context, activeTabId],
    ([value, tabId], [previousContext, previousTabId]) => {
      if (previousContext !== undefined && value !== previousContext) clear();
      if (!value) return;
      if (tabId && !runtime.tabs.tabs.value.some((tab) => tab.id === tabId)) {
        session.value = null;
        return;
      }

      // A task started before the first tab exists follows the tab that it opens.
      if (tabId && !previousTabId && sessions.has("") && !sessions.has(tabId)) {
        const preTabSession = sessions.get("")!;
        preTabSession.tabId = tabId;
        sessions.set(tabId, preTabSession);
        sessions.delete("");
      }
      session.value = ensureTabSession(tabId);
    },
    { immediate: true }
  );
  watch(
    () => runtime.tabs.tabs.value.map((tab) => tab.id),
    (tabIds) => {
      const openTabs = new Set(tabIds);
      for (const tabId of sessions.keys()) {
        if (tabId && !openTabs.has(tabId)) disposeTabSession(tabId);
      }
      if (context.value && !session.value && (!activeTabId.value || openTabs.has(activeTabId.value))) {
        session.value = ensureTabSession(activeTabId.value);
      }
    }
  );
  subscribers += 1;
  onScopeDispose(() => {
    subscribers -= 1;
    if (subscribers === 0) clear();
  });
  return { session, scopeId, newSession };
}

export function hasActiveAiTask(tabId?: string) {
  if (tabId !== undefined) {
    const current = sessions.get(tabId);
    return Boolean(current && isWorkspaceAssistantBusy(current.scopeId));
  }
  for (const current of sessions.values()) {
    if (isWorkspaceAssistantBusy(current.scopeId)) return true;
  }
  return false;
}
