import type { RightPanelTab } from "~/composables/useRightPanel";
import type { WorkspaceMode } from "~/composables/useWorkspaceMode";

export type AiPanelSource = "workspace" | "sftp";
export type UnifiedAiPanelKind = "workspace" | "resource";

interface AiPanelContext {
  workspaceMode: WorkspaceMode;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
}

interface UnifiedAiPanelContext {
  workspaceMode: WorkspaceMode;
  protocol: string;
  surface: string;
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
const source = shallowRef<AiPanelSource>("workspace");

export function resolveAiPanelSource(context: AiPanelContext): AiPanelSource {
  return context.workspaceMode === "assets" && context.rightPanelOpen && context.rightPanelTab === "sftp"
    ? "sftp"
    : "workspace";
}

export function resolveUnifiedAiPanel(context: UnifiedAiPanelContext): UnifiedAiPanelKind {
  if (context.workspaceMode === "files" || context.protocol === "script-editor") return "resource";
  if (["database", "file-editor", "file-manager"].includes(context.surface)) return "resource";
  return "workspace";
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

  const setSource = (value: AiPanelSource) => {
    source.value = value;
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
    openAi();
  };
  const takeTerminalPrompt = (id: string) => {
    if (pendingTerminalPrompt.value?.id === id) pendingTerminalPrompt.value = null;
  };

  return {
    pendingTerminalPrompt,
    requestTerminalPrompt,
    takeTerminalPrompt,
    open,
    source,
    setOpen,
    setSource,
    openAi,
    openWorkspaceAssistant: openAi,
    toggleAi
  };
};
