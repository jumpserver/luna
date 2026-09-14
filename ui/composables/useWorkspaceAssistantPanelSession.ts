import type { useWorkspaceAssistantRuntime } from "./useWorkspaceAssistantSession";
import {
  getActiveKokoTerminalAiTargetId,
  getKokoTerminalAiSessions
} from "#koko/composables/terminal/useTerminalAiSessions";
import {
  disposeWorkspaceAssistantSession,
  ensureWorkspaceAssistantSession,
  interruptWorkspaceAssistant,
  isWorkspaceAssistantBusy,
  workspaceAssistantScopeId
} from "./useWorkspaceAssistantSession";

const sessions = new Map<string, { targetId: string; session: ReturnType<typeof ensureWorkspaceAssistantSession> }>();
const session = shallowRef<ReturnType<typeof ensureWorkspaceAssistantSession> | null>(null);
let subscribers = 0;

function sessionKey(tabId: string, targetId: string) {
  return JSON.stringify([tabId, targetId]);
}

export function useWorkspaceAssistantPanelSession(runtime: ReturnType<typeof useWorkspaceAssistantRuntime>) {
  const scopeId = computed(() => session.value?.scopeId || "");
  const activeTabId = computed(() => runtime.tabs.activeTabId.value);
  const activeTargetId = computed(() => getActiveKokoTerminalAiTargetId(runtime.tabs.activePaneId.value) || "");
  const context = computed(() => {
    const { loggedIn, currentSite, currentAccountId, orgId } = runtime.userInfoStore;
    return loggedIn && [currentSite, currentAccountId, orgId].some(Boolean)
      ? JSON.stringify([currentSite, currentAccountId, orgId])
      : "";
  });

  function ensureTabSession(tabId: string, targetId: string) {
    const key = sessionKey(tabId, targetId);
    const existing = sessions.get(key);
    if (existing) return existing.session;
    const created = ensureWorkspaceAssistantSession(workspaceAssistantScopeId(), runtime, tabId);
    sessions.set(key, { targetId, session: created });
    return created;
  }

  function disposeTabSession(key: string) {
    const existing = sessions.get(key)?.session;
    if (!existing) return;
    if (session.value === existing) session.value = null;
    sessions.delete(key);
    disposeWorkspaceAssistantSession(existing.scopeId);
  }

  function clear() {
    runtime.automation.clearAssetSelectionRequest();
    for (const existing of sessions.values()) disposeWorkspaceAssistantSession(existing.session.scopeId);
    sessions.clear();
    session.value = null;
  }

  function newSession() {
    if (!context.value || !session.value) return;
    const tabId = activeTabId.value;
    const targetId = activeTargetId.value;
    const key = sessionKey(tabId, targetId);
    const previous = sessions.get(key)?.session;
    if (previous !== session.value) return;
    interruptWorkspaceAssistant(previous.scopeId);
    disposeTabSession(key);
    session.value = ensureTabSession(tabId, targetId);
  }

  watch(
    [context, activeTabId, activeTargetId],
    ([value, tabId, targetId], [previousContext, previousTabId]) => {
      if (previousContext !== undefined && value !== previousContext) clear();
      if (!value) return;
      if (tabId && !runtime.tabs.tabs.value.some((tab) => tab.id === tabId)) {
        session.value = null;
        return;
      }

      // A task started before the first tab exists follows the tab that it opens.
      const key = sessionKey(tabId, targetId);
      const preTabKey = sessionKey("", "");
      if (tabId && !previousTabId && sessions.has(preTabKey) && !sessions.has(key)) {
        const preTabSession = sessions.get(preTabKey)!;
        preTabSession.session.tabId = tabId;
        preTabSession.targetId = targetId;
        sessions.set(key, preTabSession);
        sessions.delete(preTabKey);
      }
      session.value = ensureTabSession(tabId, targetId);
    },
    { immediate: true }
  );
  watch(
    () =>
      runtime.tabs.tabs.value.map((tab) => ({
        id: tab.id,
        targetIds: tab.panes.flatMap((pane) => getKokoTerminalAiSessions(pane.id).map((target) => target.paneId))
      })),
    (tabs, previousTabs) => {
      const openTabs = new Set(tabs.map((tab) => tab.id));
      const targets = new Set(tabs.flatMap((tab) => tab.targetIds));
      const previousTargets = new Set(previousTabs.flatMap((tab) => tab.targetIds));
      for (const [key, current] of sessions) {
        const closedTab = current.session.tabId && !openTabs.has(current.session.tabId);
        // An active target can be selected before its terminal registers.
        const closedTarget = previousTargets.has(current.targetId) && !targets.has(current.targetId);
        if (closedTab || closedTarget) disposeTabSession(key);
      }
      if (context.value && !session.value && (!activeTabId.value || openTabs.has(activeTabId.value))) {
        session.value = ensureTabSession(activeTabId.value, activeTargetId.value);
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
  for (const current of sessions.values()) {
    if (tabId !== undefined && current.session.tabId !== tabId) continue;
    if (isWorkspaceAssistantBusy(current.session.scopeId)) return true;
  }
  return false;
}
