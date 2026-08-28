<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "~/composables/useSettingStorage";

const props = withDefaults(
  defineProps<{
    sidebarVisible?: boolean;
    focusMode?: boolean;
  }>(),
  {
    sidebarVisible: true,
    focusMode: false
  }
);

const { collapse, modernIsland, setCollapse: setSidebarCollapsed } = useSettingManager();
const {
  sidebarWidth,
  setSidebarWidth,
  persistSidebarWidth,
  hoverPreviewOpen,
  closeHoverPreview,
  cancelHoverPreviewClose,
  scheduleHoverPreviewClose
} = useSidebarLayout();
const {
  open: rightPanelOpen,
  panelWidth: rightPanelWidth,
  setOpen: setRightPanelOpen,
  setPanelWidth
} = useRightPanel();
const slots = useSlots();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const isResizing = ref(false);
const isRightResizing = ref(false);
const bodyRef = ref<HTMLElement | null>(null);
const bodyWidth = ref(1200);
let resizeStartX = 0;
let resizeStartWidth = 0;
const MIN_RIGHT_PANEL_WIDTH = 280;
const MAX_RIGHT_PANEL_WIDTH = 520;
const islandHandlePx = 8;
const useIslandLayout = computed(
  () => modernIsland.value && !props.focusMode && !isNarrowScreen.value
);
const showIslandSidebar = computed(
  () => Boolean(slots.sidebar) && props.sidebarVisible && !collapse.value && !props.focusMode
);
const showIslandRight = computed(() => Boolean(slots.rightPanel) && rightPanelOpen.value && !props.focusMode);
const islandKey = computed(() => `${showIslandSidebar.value ? "s" : ""}${showIslandRight.value ? "r" : "m"}`);
const sidebarTransitionClass = computed(() => {
  if (isResizing.value || !props.sidebarVisible) return "";
  return "transition-[width] duration-200";
});
const sidebarStyleWidth = computed(() => {
  if (props.focusMode || !props.sidebarVisible || (collapse.value && !hoverPreviewOpen.value)) return "0px";
  return isNarrowScreen.value ? `min(${sidebarWidth.value}px, calc(100vw - 3rem))` : `${sidebarWidth.value}px`;
});
const sidebarOverlay = computed(
  () => collapse.value && !isNarrowScreen.value && props.sidebarVisible && !props.focusMode
);
const rightPanelStyleWidth = computed(() => {
  if (props.focusMode || !rightPanelOpen.value) return "0px";
  return isNarrowScreen.value ? `min(${rightPanelWidth.value}px, calc(100vw - 3rem))` : `${rightPanelWidth.value}px`;
});
const mobileOverlayOpen = computed(
  () => isNarrowScreen.value && !props.focusMode && ((!collapse.value && props.sidebarVisible) || rightPanelOpen.value)
);
const islandSplitterUi = {
  root: "h-full min-h-0 min-w-0 w-full flex-1",
  panel: "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
  handle: "w-2 cursor-col-resize bg-transparent"
};

const islandAvailableWidth = computed(() => {
  const panelCount = 1 + Number(showIslandSidebar.value) + Number(showIslandRight.value);
  return Math.max(1, bodyWidth.value - islandHandlePx * Math.max(0, panelCount - 1));
});

const toPercent = (px: number, min: number, max: number) => {
  const available = islandAvailableWidth.value;
  return Math.min((max / available) * 100, Math.max((min / available) * 100, (px / available) * 100));
};

const islandItems = computed(() => {
  const available = islandAvailableWidth.value;
  const items: Array<{
    id: string;
    slot: string;
    minSize: number;
    maxSize?: number;
    defaultSize: number;
  }> = [];

  if (showIslandSidebar.value) {
    items.push({
      id: "sidebar",
      slot: "sidebar",
      minSize: (MIN_SIDEBAR_WIDTH / available) * 100,
      maxSize: (MAX_SIDEBAR_WIDTH / available) * 100,
      defaultSize: toPercent(sidebarWidth.value, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
    });
  }

  const sidebarPct = showIslandSidebar.value ? (items[0]?.defaultSize ?? 0) : 0;
  const rightPct = showIslandRight.value
    ? toPercent(rightPanelWidth.value, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH)
    : 0;

  items.push({
    id: "main",
    slot: "main",
    minSize: 20,
    defaultSize: Math.max(20, 100 - sidebarPct - rightPct)
  });

  if (showIslandRight.value) {
    items.push({
      id: "right",
      slot: "right",
      minSize: (MIN_RIGHT_PANEL_WIDTH / available) * 100,
      maxSize: (MAX_RIGHT_PANEL_WIDTH / available) * 100,
      defaultSize: rightPct
    });
  }

  return items;
});

const closeMobilePanels = () => {
  setSidebarCollapsed(true);
  setRightPanelOpen(false);
};

const applyIslandLayout = (sizes: number[]) => {
  const available = islandAvailableWidth.value;
  let index = 0;

  if (showIslandSidebar.value) {
    const size = sizes[index];
    if (typeof size === "number") setSidebarWidth((size / 100) * available);
    index += 1;
  }

  index += 1;

  if (showIslandRight.value) {
    const size = sizes[index];
    if (typeof size === "number") setPanelWidth((size / 100) * available);
  }
};

watch([collapse, () => props.sidebarVisible, () => props.focusMode], () => {
  if (!collapse.value || !props.sidebarVisible || props.focusMode) closeHoverPreview();
});

useResizeObserver(bodyRef, (entries) => {
  bodyWidth.value = Math.round(entries[0]?.contentRect.width ?? 0);
});

const handleResize = (event: PointerEvent) => {
  if (!isResizing.value) return;
  setSidebarWidth(resizeStartWidth + event.clientX - resizeStartX);
};

const stopResizing = () => {
  if (!isResizing.value) return;
  isResizing.value = false;
  persistSidebarWidth();
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", handleResize);
  window.removeEventListener("pointerup", stopResizing);
};

const startResizing = (event: PointerEvent) => {
  if (event.button !== 0 || collapse.value || isNarrowScreen.value) return;
  event.preventDefault();
  isResizing.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = sidebarWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleResize);
  window.addEventListener("pointerup", stopResizing);
};

const handleRightResize = (event: PointerEvent) => {
  if (!isRightResizing.value) return;
  setPanelWidth(resizeStartWidth - (event.clientX - resizeStartX));
};

const stopRightResizing = () => {
  if (!isRightResizing.value) return;
  isRightResizing.value = false;
  delete document.documentElement.dataset.rightPanelResizing;
  window.dispatchEvent(new Event("right-panel-resize-end"));
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", handleRightResize);
  window.removeEventListener("pointerup", stopRightResizing);
};

const startRightResizing = (event: PointerEvent) => {
  if (event.button !== 0 || !rightPanelOpen.value || isNarrowScreen.value) return;
  event.preventDefault();
  isRightResizing.value = true;
  document.documentElement.dataset.rightPanelResizing = "true";
  resizeStartX = event.clientX;
  resizeStartWidth = rightPanelWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleRightResize);
  window.addEventListener("pointerup", stopRightResizing);
};

onBeforeUnmount(() => {
  closeHoverPreview();
  stopResizing();
  stopRightResizing();
});
</script>

<template>
  <div
    class="workspace-shell flex h-screen w-full min-w-0 flex-col overflow-hidden border-none"
    :data-island="useIslandLayout ? 'true' : undefined"
    :style="{ backgroundColor: 'var(--app-surface-frame)', color: 'var(--app-fg)' }"
  >
    <div
      v-if="!props.focusMode"
      class="workspace-shell__header shrink-0"
      :style="{ backgroundColor: 'var(--app-header-bg)' }"
    >
      <slot name="header" />
    </div>

    <div
      ref="bodyRef"
      class="workspace-shell__body relative flex min-h-0 flex-1"
      :class="useIslandLayout ? 'workspace-shell__body--island' : ''"
    >
      <aside
        v-if="slots.sidebar && (!useIslandLayout || sidebarOverlay || hoverPreviewOpen)"
        class="workspace-shell__sidebar z-40 min-h-0 shrink-0 overflow-hidden max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl"
        :class="[
          sidebarTransitionClass,
          sidebarOverlay || (useIslandLayout && hoverPreviewOpen) ? 'absolute inset-y-0 left-0' : 'relative',
          hoverPreviewOpen ? 'border-r border-[var(--app-border)] shadow-xl' : ''
        ]"
        :style="{
          width: sidebarStyleWidth,
          backgroundColor: 'var(--app-sidebar-bg)'
        }"
        @pointerenter="cancelHoverPreviewClose"
        @pointerleave="hoverPreviewOpen && scheduleHoverPreviewClose()"
      >
        <slot name="sidebar" />
        <div
          v-if="!useIslandLayout && !props.focusMode && props.sidebarVisible && !collapse"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          class="absolute inset-y-0 -right-0.5 z-30 w-1 cursor-col-resize"
          @pointerdown="startResizing"
        />
      </aside>

      <button
        v-if="mobileOverlayOpen"
        type="button"
        class="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px] md:hidden"
        aria-label="关闭侧边面板"
        @click="closeMobilePanels"
      />

      <USplitter
        v-if="useIslandLayout"
        :id="`workspace-island-${islandKey}`"
        :key="islandKey"
        :items="islandItems"
        :ui="islandSplitterUi"
        @layout="applyIslandLayout"
        @dragging="(index, dragging) => !dragging && persistSidebarWidth()"
      >
        <template v-if="showIslandSidebar" #sidebar>
          <div class="workspace-island workspace-island--sidebar">
            <slot name="sidebar" />
          </div>
        </template>
        <template #main>
          <div class="workspace-island workspace-island--main">
            <div class="min-h-0 flex-1 overflow-hidden">
              <slot />
            </div>
            <slot v-if="!props.focusMode" name="bottomPanel" />
          </div>
        </template>
        <template v-if="showIslandRight" #right>
          <div class="workspace-island workspace-island--right">
            <slot name="rightPanel" />
          </div>
        </template>
      </USplitter>

      <template v-else>
        <main
          class="workspace-shell__main flex min-h-0 min-w-0 flex-1 flex-col"
          :style="{ backgroundColor: 'var(--app-surface-canvas)' }"
        >
          <div class="min-h-0 flex-1 overflow-hidden">
            <slot />
          </div>
          <slot v-if="!props.focusMode" name="bottomPanel" />
        </main>

        <aside
          v-if="$slots.rightPanel"
          class="workspace-shell__right-panel relative z-40 min-h-0 shrink-0 overflow-hidden max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:shadow-xl"
          :class="isRightResizing ? '' : 'transition-[width] duration-200'"
          :style="{
            width: rightPanelStyleWidth,
            backgroundColor: 'var(--app-surface-panel)'
          }"
        >
          <div class="h-full min-h-0" :aria-hidden="props.focusMode || !rightPanelOpen">
            <slot name="rightPanel" />
          </div>
          <div
            v-if="!props.focusMode && rightPanelOpen"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整右侧面板宽度"
            class="absolute inset-y-0 -left-0.5 z-30 w-1 cursor-col-resize"
            @pointerdown="startRightResizing"
          />
        </aside>
      </template>

      <slot name="overlayPanel" />
    </div>

    <div
      v-if="!props.focusMode && $slots.footer"
      class="workspace-shell__footer shrink-0"
      :style="{ backgroundColor: 'var(--app-footer-bg)' }"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
