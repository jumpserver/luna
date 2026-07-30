export type WorkspaceMode = "assets" | "files" | "tools";

export const useWorkspaceMode = () => {
  const router = useRouter();
  const activeWorkspaceMode = computed<WorkspaceMode>(() => {
    const normalizedPath = router.currentRoute.value.path.toLowerCase();
    const isFileRoute = normalizedPath.includes("/files");
    const isToolRoute =
      normalizedPath.includes("/tools") ||
      normalizedPath.includes("/videoplayer") ||
      normalizedPath.includes("/transcode");

    if (isFileRoute) return "files";
    if (isTauriRuntime() && isToolRoute) return "tools";
    return "assets";
  });
  const uiWorkspaceMode = computed(() => activeWorkspaceMode.value);

  return {
    activeWorkspaceMode,
    uiWorkspaceMode
  };
};
