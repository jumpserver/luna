import type { WorkspaceMode } from "~/composables/useWorkspaceMode";
import { createGlobalState, useLocalStorage, useMediaQuery } from "@vueuse/core";
import { workspaceAiEnabled } from "~/shared/aiAvailability";

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

const usePanelPreferences = createGlobalState(() => {
  const preferredOpen = useLocalStorage("jumpserver-client:ai-panel-open", false, { writeDefaults: false });
  const storedWidth = useLocalStorage("jumpserver-client:ai-panel-width", AI_PANEL_DEFAULT_WIDTH, {
    writeDefaults: false
  });
  const narrow = useMediaQuery("(max-width: 767px)");
  const narrowOpen = shallowRef(false);
  watch(
    [narrow, workspaceAiEnabled],
    () => {
      narrowOpen.value = false;
    },
    { flush: "sync" }
  );
  return { preferredOpen, storedWidth, narrow, narrowOpen };
});
interface TerminalPromptBinding {
  loginContext: string;
  resourceId: string;
  agentId: string;
}
const pendingTerminalPrompt = shallowRef<({ id: string; paneId: string; text: string } & TerminalPromptBinding) | null>(
  null
);

function normalizePanelWidth(width: number) {
  return Number.isFinite(width)
    ? Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)))
    : AI_PANEL_DEFAULT_WIDTH;
}

watch(
  workspaceAiEnabled,
  (enabled) => {
    if (enabled) return;
    pendingTerminalPrompt.value = null;
  },
  { flush: "sync" }
);

export function resolveUnifiedAiPanel(context: UnifiedAiPanelContext): UnifiedAiPanelKind {
  if (context.sessionKind && context.sessionKind !== "terminal") return "resource";
  if (context.workspaceMode === "files" || context.protocol === "script-editor") return "resource";
  if (["database", "file-editor", "file-manager"].includes(context.surface)) return "resource";
  return "workspace";
}

export const useAiPanel = () => {
  const { preferredOpen, storedWidth, narrow, narrowOpen } = usePanelPreferences();
  const open = computed(() => workspaceAiEnabled.value && (narrow.value ? narrowOpen.value : preferredOpen.value));
  const panelWidth = computed(() => normalizePanelWidth(storedWidth.value));

  const setOpen = (value: boolean) => {
    if (value && !workspaceAiEnabled.value) return;
    if (narrow.value) narrowOpen.value = value;
    else preferredOpen.value = value;
  };

  const setPanelWidth = (width: number) => {
    storedWidth.value = normalizePanelWidth(width);
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
    if (!workspaceAiEnabled.value) return;
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
