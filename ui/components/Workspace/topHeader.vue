<script setup lang="ts">
import { desktopWindow } from "~/shared/desktop/bridge";
const { collapse, modernIsland } = useSettingManager();
const { sidebarWidth } = useSidebarLayout();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const leadingAreaStyle = computed(() => {
  if (collapse.value || isNarrowScreen.value) return { width: "fit-content" };
  if (modernIsland.value && !isNarrowScreen.value) {
    return {
      width: `calc(var(--workspace-island-inset) + ${sidebarWidth.value}px + var(--workspace-island-gap))`
    };
  }
  return { width: `${sidebarWidth.value}px` };
});

const handleWindowDrag = async (event: MouseEvent) => {
  if (!isDesktopRuntime()) return;

  const target = event.target as HTMLElement;
  if (
    target.closest("button") ||
    target.closest('[role="button"]') ||
    target.closest("input") ||
    target.closest("select")
  ) {
    return;
  }

  if (event.button !== 0) return;

  try {
    await desktopWindow.startDragging();
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <div
    data-desktop-drag-region
    class="header-bg h-10 min-h-10 max-h-10 shrink-0 flex items-center"
    :style="{
      backgroundColor: 'var(--app-header-bg)',
      borderBottom: '1px solid var(--app-border)'
    }"
    @mousedown="handleWindowDrag"
  >
    <div v-if="$slots.leading" class="h-full shrink-0 transition-[width] duration-200" :style="leadingAreaStyle">
      <slot name="leading" />
    </div>

    <div
      class="h-full min-w-0 flex-1 overflow-hidden"
      :class="modernIsland && !isNarrowScreen ? 'px-0' : 'px-0.5 sm:px-1.5'"
    >
      <slot />
    </div>

    <div class="h-full shrink-0 flex items-center sm:pl-1">
      <HeaderActionButtons />
    </div>
  </div>
</template>
