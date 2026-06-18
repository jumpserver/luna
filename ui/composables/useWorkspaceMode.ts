export type WorkspaceMode = "assets" | "tools";

const activeWorkspaceMode = ref<WorkspaceMode>("assets");

export const useWorkspaceMode = () => {
  const setWorkspaceMode = (mode: WorkspaceMode) => {
    activeWorkspaceMode.value = mode;
  };

  return {
    activeWorkspaceMode,
    setWorkspaceMode
  };
};
