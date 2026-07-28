const { sidebarWidth, setSidebarWidth: updateSidebarWidth, persistSidebarWidth } = useSettingManager();

export const useSidebarLayout = () => {
  const setSidebarWidth = (width: number) => {
    updateSidebarWidth(width);
  };

  return {
    sidebarWidth,
    setSidebarWidth,
    persistSidebarWidth
  };
};
