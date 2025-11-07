import type { AssetItem } from "~/types/index";

export function useAssetManagement() {
  const { getAssetDetail } = useAssetAction();

  // 选中的卡片状态
  const selectedCardIndex = ref<number | null>(null);
  const currentSelectedCardInfo = ref<AssetItem | null>(null);

  /**
   * 处理卡片点击
   */
  const handleCardClick = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    selectedCardIndex.value = index;
  };

  /**
   * 清除选中卡片
   */
  const clearSelectedCard = () => {
    selectedCardIndex.value = null;
  };

  /**
   * 设置当前选中的资产信息
   */
  const setCurrentAsset = (asset: AssetItem) => {
    currentSelectedCardInfo.value = asset;
  };

  /**
   * 处理资产详情获取
   */
  const handleAssetDetail = (assetId: string) => {
    getAssetDetail(assetId);
  };

  return {
    // 状态
    selectedCardIndex,
    currentSelectedCardInfo,

    // 方法
    handleCardClick,
    clearSelectedCard,
    setCurrentAsset,
    handleAssetDetail
  };
}
