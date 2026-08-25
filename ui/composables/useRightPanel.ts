export type RightPanelTab = "session" | "lion-control" | "lion-files" | "ai" | "sftp";

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 340;

const open = ref(false);
const activeTab = ref<RightPanelTab>("session");
const panelWidth = ref(DEFAULT_PANEL_WIDTH);

export const useRightPanel = () => {
  const setOpen = (value: boolean) => {
    open.value = value;
  };

  const toggle = () => {
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
