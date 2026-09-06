import type { useWorkspaceAssistantRuntime } from "./useWorkspaceAssistantSession";
import {
  disposeWorkspaceAssistantSession,
  ensureWorkspaceAssistantSession,
  interruptWorkspaceAssistant,
  workspaceAssistantScopeId
} from "./useWorkspaceAssistantSession";

export function useWorkspaceAssistantPanelSession(runtime: ReturnType<typeof useWorkspaceAssistantRuntime>) {
  const session = shallowRef<ReturnType<typeof ensureWorkspaceAssistantSession> | null>(null);
  const scopeId = computed(() => session.value?.scopeId || "");
  const context = computed(() => {
    const { loggedIn, currentSite, currentAccountId, orgId } = runtime.userInfoStore;
    return loggedIn && [currentSite, currentAccountId, orgId].some(Boolean)
      ? JSON.stringify([currentSite, currentAccountId, orgId])
      : "";
  });
  function clear() {
    runtime.automation.clearAssetSelectionRequest();
    if (session.value) disposeWorkspaceAssistantSession(session.value.scopeId);
    session.value = null;
  }
  function newSession() {
    if (!context.value || !session.value) return;
    interruptWorkspaceAssistant(scopeId.value);
    clear();
    session.value = ensureWorkspaceAssistantSession(workspaceAssistantScopeId(), runtime);
  }
  // A conversation belongs to the login context, not the active tab. Connecting an asset must not end its task.
  watch(
    context,
    (value) => {
      clear();
      if (value) session.value = ensureWorkspaceAssistantSession(workspaceAssistantScopeId(), runtime);
    },
    { immediate: true }
  );
  onScopeDispose(clear);
  return { session, scopeId, newSession };
}
