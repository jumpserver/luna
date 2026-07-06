export type RightPanelTab = "session" | "ai" | "sftp";

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 340;

const open = ref(false);
const activeTab = ref<RightPanelTab>("session");
const panelWidth = ref(DEFAULT_PANEL_WIDTH);

export const useRightPanel = () => {
  const setOpen = (value: boolean) => {
    if (value && !open.value) activeTab.value = "session";
    open.value = value;
  };

  const toggle = () => {
    if (!open.value) activeTab.value = "session";
    open.value = !open.value;
  };

  const setActiveTab = (tab: RightPanelTab) => {
    activeTab.value = tab;
  };

  const openWithTab = (tab: RightPanelTab) => {
    activeTab.value = tab;
    open.value = true;
  };

  const setPanelWidth = (width: number) => {
    panelWidth.value = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
  };

  return {
    open,
    activeTab,
    panelWidth,
    setOpen,
    toggle,
    setActiveTab,
    openWithTab,
    setPanelWidth
  };
};
