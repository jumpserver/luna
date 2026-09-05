import type { RightPanelTab } from "~/composables/useRightPanel";
import type { WorkspaceMode } from "~/composables/useWorkspaceMode";
import type { WorkspaceSessionStatus } from "~/composables/useWorkspaceTabs";

export type AiPanelSource = "platform" | "workspace" | "sftp";
export type AiPanelMode = "platform" | "workspace" | "workspace-assistant";

interface AiPanelContext {
  workspaceMode: WorkspaceMode;
  surfaceStatus?: WorkspaceSessionStatus;
  surfaceAssetId?: string;
  surfaceProtocol?: string;
  standaloneWorkspace: boolean;
  workspaceFocused: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
}

const open = shallowRef(false);
const source = shallowRef<AiPanelSource>("platform");
const workspaceFocused = shallowRef(true);
const workspaceAssistantActive = shallowRef(false);
const mode = computed<AiPanelMode>(() => {
  if (workspaceAssistantActive.value) return "workspace-assistant";
  return source.value === "platform" ? "platform" : "workspace";
});

export function resolveAiPanelSource(context: AiPanelContext): AiPanelSource {
  const connectedAsset = context.surfaceStatus === "connected" && Boolean(context.surfaceAssetId);
  const editorWorkspace = context.surfaceProtocol === "script-editor";
  const activeWorkspace =
    context.workspaceFocused && (connectedAsset || editorWorkspace || context.standaloneWorkspace);
  if (context.workspaceMode !== "assets" || !activeWorkspace) return "platform";
  return context.rightPanelOpen && context.rightPanelTab === "sftp" ? "sftp" : "workspace";
}

export const useAiPanel = () => {
  const setOpen = (value: boolean) => {
    open.value = value;
  };

  const setSource = (value: AiPanelSource) => {
    source.value = value;
  };

  const setWorkspaceFocused = (value: boolean) => {
    workspaceFocused.value = value;
  };

  const setWorkspaceAssistantActive = (value: boolean) => {
    workspaceAssistantActive.value = value;
    if (value) open.value = true;
  };

  const openAi = () => {
    open.value = true;
  };

  const openWorkspaceAi = () => {
    workspaceAssistantActive.value = false;
    workspaceFocused.value = true;
    source.value = "workspace";
    open.value = true;
  };

  const openWorkspaceAssistant = () => {
    workspaceAssistantActive.value = true;
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
    workspaceFocused,
    workspaceAssistantActive,
    setOpen,
    setSource,
    setWorkspaceFocused,
    setWorkspaceAssistantActive,
    openAi,
    openWorkspaceAi,
    openWorkspaceAssistant,
    toggleAi
  };
};
