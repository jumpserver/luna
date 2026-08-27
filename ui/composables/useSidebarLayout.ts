const { sidebarWidth, setSidebarWidth: updateSidebarWidth, persistSidebarWidth } = useSettingManager();

export const useSidebarLayout = () => {
  const hoverPreviewOpen = useState("sidebar-hover-preview-open", () => false);
  const hoverPreviewCloseTimer = useState<number | null>("sidebar-hover-preview-close-timer", () => null);

  const setSidebarWidth = (width: number) => {
    updateSidebarWidth(width);
  };

  const cancelHoverPreviewClose = () => {
    if (hoverPreviewCloseTimer.value === null) return;
    window.clearTimeout(hoverPreviewCloseTimer.value);
    hoverPreviewCloseTimer.value = null;
  };

  const openHoverPreview = () => {
    cancelHoverPreviewClose();
    hoverPreviewOpen.value = true;
  };

  const closeHoverPreview = () => {
    cancelHoverPreviewClose();
    hoverPreviewOpen.value = false;
  };

  const scheduleHoverPreviewClose = () => {
    cancelHoverPreviewClose();
    hoverPreviewCloseTimer.value = window.setTimeout(closeHoverPreview, 150);
  };

  return {
    sidebarWidth,
    setSidebarWidth,
    persistSidebarWidth,
    hoverPreviewOpen,
    openHoverPreview,
    closeHoverPreview,
    cancelHoverPreviewClose,
    scheduleHoverPreviewClose
  };
};
