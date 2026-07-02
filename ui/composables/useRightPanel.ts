import type { AssetItem } from "~/types";

export type RightPanelTab = "ai" | "sftp" | "batch";

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 340;

const open = ref(false);
const activeTab = ref<RightPanelTab>("ai");
const panelWidth = ref(DEFAULT_PANEL_WIDTH);
const batchAssets = ref<AssetItem[]>([]);
const batchCommand = ref("");

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

  const setBatchAssets = (assets: AssetItem[]) => {
    batchAssets.value = [...assets];
  };

  const addBatchAsset = (asset: AssetItem) => {
    if (batchAssets.value.some((item) => item.id === asset.id)) return;
    batchAssets.value = [...batchAssets.value, asset];
  };

  const removeBatchAsset = (assetId: string) => {
    batchAssets.value = batchAssets.value.filter((item) => item.id !== assetId);
  };

  const clearBatchAssets = () => {
    batchAssets.value = [];
  };

  return {
    open,
    activeTab,
    panelWidth,
    batchAssets,
    batchCommand,
    setOpen,
    toggle,
    setActiveTab,
    openWithTab,
    setPanelWidth,
    setBatchAssets,
    addBatchAsset,
    removeBatchAsset,
    clearBatchAssets
  };
};
