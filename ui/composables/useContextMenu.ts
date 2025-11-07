import type { AssetItem } from "~/types/index";

export function useContextMenu() {
  // 上下文菜单状态
  const contextMenuVisible = ref(false);
  const contextMenuPosition = ref({ x: 0, y: 0 });
  const contextMenuAsset = ref<AssetItem | null>(null);

  /**
   * 显示上下文菜单
   */
  const showContextMenu = (asset: AssetItem, event?: MouseEvent) => {
    contextMenuAsset.value = asset;

    if (event) {
      const menuWidth = 200; // 菜单宽度
      const menuHeight = 200; // 菜单高度
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = event.clientX;
      let y = event.clientY;

      // 检查是否来自表格按钮（通过检查目标元素）
      const target = event.target as HTMLElement;
      const isTableButton =
        target?.hasAttribute("data-table-context-button") ||
        target?.closest("[data-table-context-button]") ||
        target?.closest(".UTable");

      // 如果是表格按钮，优先显示在左侧
      if (isTableButton) {
        x = event.clientX - menuWidth;
        // 如果左侧空间不够，则显示在右侧
        if (x < 10) {
          x = event.clientX;
        }
      } else {
        // 对于其他情况（如右键菜单），如果菜单会超出右边界，则显示在左侧
        if (x + menuWidth > viewportWidth) {
          x = event.clientX - menuWidth;
        }
      }

      // 如果菜单会超出下边界，则向上调整
      if (y + menuHeight > viewportHeight) {
        y = event.clientY - menuHeight;
      }

      // 确保不超出左边界和上边界
      x = Math.max(10, x);
      y = Math.max(10, y);

      contextMenuPosition.value = { x, y };
    }

    contextMenuVisible.value = true;
  };

  /**
   * 隐藏上下文菜单
   */
  const hideContextMenu = () => {
    contextMenuVisible.value = false;
    contextMenuAsset.value = null;
  };

  return {
    // 状态
    contextMenuVisible,
    contextMenuPosition,
    contextMenuAsset,

    // 方法
    showContextMenu,
    hideContextMenu
  };
}
