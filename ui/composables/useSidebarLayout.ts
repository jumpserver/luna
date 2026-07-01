const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 420;
const sidebarWidth = ref(220);

export const useSidebarLayout = () => {
  const setSidebarWidth = (width: number) => {
    sidebarWidth.value = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
  };

  return {
    sidebarWidth,
    setSidebarWidth
  };
};
