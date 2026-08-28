export default defineNuxtPlugin((nuxtApp) => {
  const { setWorkspaceFocused } = useAiPanel();
  const { activePaneId, activeTab } = useWorkspaceTabs();
  const activeSurface = computed(() => {
    const tab = activeTab.value;
    return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
  });

  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const context = target.closest<HTMLElement>("[data-ai-context]")?.dataset.aiContext;
    if (context === "preserve") return;
    setWorkspaceFocused(context === "workspace");
  };

  watch([activePaneId, () => activeSurface.value?.status], ([paneId, status], [previousPaneId, previousStatus]) => {
    if (paneId !== previousPaneId || (status === "connected" && previousStatus !== "connected")) {
      setWorkspaceFocused(true);
    }
  });

  document.addEventListener("pointerdown", handlePointerDown, true);
  nuxtApp.vueApp.onUnmount(() => document.removeEventListener("pointerdown", handlePointerDown, true));
});
