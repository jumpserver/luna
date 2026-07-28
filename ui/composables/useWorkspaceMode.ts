export type WorkspaceMode = "assets" | "files" | "tools";

const activeWorkspaceMode = ref<WorkspaceMode>("assets");
const pendingWorkspaceMode = ref<WorkspaceMode | null>(null);

export const useWorkspaceMode = () => {
  const uiWorkspaceMode = computed(() => pendingWorkspaceMode.value ?? activeWorkspaceMode.value);

  const setWorkspaceMode = (mode: WorkspaceMode) => {
    activeWorkspaceMode.value = mode;
    if (pendingWorkspaceMode.value === mode) {
      pendingWorkspaceMode.value = null;
    }
  };

  const setPendingWorkspaceMode = (mode: WorkspaceMode | null) => {
    pendingWorkspaceMode.value = mode;
  };

  return {
    activeWorkspaceMode,
    pendingWorkspaceMode,
    uiWorkspaceMode,
    setWorkspaceMode,
    setPendingWorkspaceMode
  };
};
