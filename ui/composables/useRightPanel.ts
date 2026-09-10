export type RightPanelTab = "session" | "lion-control" | "lion-files" | "sftp";

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 340;

const open = shallowRef(false);
const activeTab = shallowRef<RightPanelTab>("session");
const panelWidth = shallowRef(DEFAULT_PANEL_WIDTH);
const widthMin = shallowRef(MIN_PANEL_WIDTH);
const widthMax = shallowRef(MAX_PANEL_WIDTH);

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
    panelWidth.value = Math.min(widthMax.value, Math.max(widthMin.value, Math.round(width)));
  };

  const setPanelBounds = (min: number, max: number) => {
    widthMin.value = min;
    widthMax.value = max;
    setPanelWidth(panelWidth.value);
  };

  const resetPanelBounds = () => {
    setPanelBounds(MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
  };

  return {
    open,
    activeTab,
    panelWidth,
    setOpen,
    toggle,
    setActiveTab,
    openWithTab,
    setPanelWidth,
    setPanelBounds,
    resetPanelBounds
  };
};
