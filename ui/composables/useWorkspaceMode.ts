export type WorkspaceMode = "assets" | "files" | "tools";

function routeHaystack(route: { path?: string; name?: unknown; fullPath?: string }) {
  return `${route.path || ""} ${route.fullPath || ""} ${String(route.name || "")}`.toLowerCase();
}

export const useWorkspaceMode = () => {
  const router = useRouter();
  const isUtilityRoute = computed(() => {
    const hay = routeHaystack(router.currentRoute.value);
    return hay.includes("videoplayer") || hay.includes("transcode");
  });
  const isVideoPlayerRoute = computed(() => routeHaystack(router.currentRoute.value).includes("videoplayer"));
  const activeWorkspaceMode = computed<WorkspaceMode>(() => {
    const hay = routeHaystack(router.currentRoute.value);
    const isFileRoute = hay.includes("/files");
    const isToolRoute = hay.includes("/tools") || hay.includes("videoplayer") || hay.includes("transcode");

    if (isFileRoute) return "files";
    if (isDesktopRuntime() && isToolRoute) return "tools";
    return "assets";
  });
  const uiWorkspaceMode = computed(() => activeWorkspaceMode.value);

  return {
    activeWorkspaceMode,
    uiWorkspaceMode,
    isUtilityRoute,
    isVideoPlayerRoute
  };
};
