import type { WorkspaceMode } from "~/composables/useWorkspaceMode";

export type UnifiedAiPanelKind = "workspace" | "resource";

export const AI_PANEL_MIN_WIDTH = 320;
export const AI_PANEL_MAX_WIDTH = 720;
export const AI_PANEL_DEFAULT_WIDTH = 380;

interface UnifiedAiPanelContext {
  workspaceMode: WorkspaceMode;
  protocol: string;
  surface: string;
  sessionKind?: "file" | "terminal" | "sql" | "script";
}

const openTabs = shallowReactive(new WeakSet<object>());
const openWithoutTab = shallowRef(false);
interface TerminalPromptBinding {
  loginContext: string;
  resourceId: string;
  agentId: string;
}
const pendingTerminalPrompt = shallowRef<({ id: string; paneId: string; text: string } & TerminalPromptBinding) | null>(
  null
);
const panelWidth = shallowRef(AI_PANEL_DEFAULT_WIDTH);

export function resolveUnifiedAiPanel(context: UnifiedAiPanelContext): UnifiedAiPanelKind {
  if (context.sessionKind && context.sessionKind !== "terminal") return "resource";
  if (context.workspaceMode === "files" || context.protocol === "script-editor") return "resource";
  if (["database", "file-editor", "file-manager"].includes(context.surface)) return "resource";
  return "workspace";
}

export function aiPanelFloats(kind: UnifiedAiPanelKind, surface: string, narrow = false) {
  return narrow || (kind === "workspace" && surface === "terminal");
}

export const useAiPanel = () => {
  const { activeTab } = useWorkspaceTabs();
  const open = computed(() => {
    const tab = activeTab.value;
    return tab ? openTabs.has(tab) : openWithoutTab.value;
  });

  const setOpen = (value: boolean) => {
    const tab = activeTab.value;
    if (!tab) {
      openWithoutTab.value = value;
      return;
    }
    if (value) openTabs.add(tab);
    else openTabs.delete(tab);
  };

  const setPanelWidth = (width: number) => {
    panelWidth.value = Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)));
  };

  const openAi = () => {
    setOpen(true);
  };

  const toggleAi = () => {
    if (open.value) {
      setOpen(false);
      return;
    }
    setOpen(true);
  };

  const requestTerminalPrompt = (paneId: string, text: string, binding: TerminalPromptBinding) => {
    pendingTerminalPrompt.value = { id: globalThis.crypto.randomUUID(), paneId, text, ...binding };
  };
  const takeTerminalPrompt = (id: string) => {
    if (pendingTerminalPrompt.value?.id === id) pendingTerminalPrompt.value = null;
  };

  return {
    pendingTerminalPrompt,
    requestTerminalPrompt,
    takeTerminalPrompt,
    open,
    panelWidth,
    setOpen,
    setPanelWidth,
    openAi,
    openWorkspaceAssistant: openAi,
    toggleAi
  };
};
