import type { RightPanelTab } from "~/composables/useRightPanel";
import type { WorkspaceMode } from "~/composables/useWorkspaceMode";

export type AiPanelSource = "workspace" | "sftp";
export type AiPanelMode = "workspace" | "workspace-assistant";

interface AiPanelContext {
  workspaceMode: WorkspaceMode;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
}

const open = shallowRef(false);
const source = shallowRef<AiPanelSource>("workspace");
const workspaceAssistantActive = shallowRef(true);
const mode = computed<AiPanelMode>(() => {
  if (workspaceAssistantActive.value) return "workspace-assistant";
  return "workspace";
});

export function resolveAiPanelSource(context: AiPanelContext): AiPanelSource {
  return context.workspaceMode === "assets" && context.rightPanelOpen && context.rightPanelTab === "sftp"
    ? "sftp"
    : "workspace";
}

export const useAiPanel = () => {
  const setOpen = (value: boolean) => {
    open.value = value;
  };

  const setSource = (value: AiPanelSource) => {
    source.value = value;
  };

  const setWorkspaceAssistantActive = (value: boolean) => {
    workspaceAssistantActive.value = value;
    if (value) open.value = true;
  };

  const openAi = () => {
    workspaceAssistantActive.value = true;
    open.value = true;
  };

  const openWorkspaceAi = () => {
    workspaceAssistantActive.value = false;
    source.value = "workspace";
    open.value = true;
  };

  const toggleAi = () => {
    if (open.value) {
      open.value = false;
      return;
    }

    openAi();
  };

  return {
    open,
    mode,
    source,
    workspaceAssistantActive,
    setOpen,
    setSource,
    setWorkspaceAssistantActive,
    openAi,
    openWorkspaceAi,
    openWorkspaceAssistant: openAi,
    toggleAi
  };
};
