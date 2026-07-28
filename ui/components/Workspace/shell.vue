<script setup lang="ts">
const { collapse } = useSettingManager();
const { sidebarWidth, setSidebarWidth, persistSidebarWidth } = useSidebarLayout();
const { open: rightPanelOpen, panelWidth: rightPanelWidth, setPanelWidth } = useRightPanel();
const isResizing = ref(false);
const isRightResizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

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
  if (event.button !== 0 || collapse.value) return;
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
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", handleRightResize);
  window.removeEventListener("pointerup", stopRightResizing);
};

const startRightResizing = (event: PointerEvent) => {
  if (event.button !== 0 || !rightPanelOpen.value) return;
  event.preventDefault();
  isRightResizing.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = rightPanelWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleRightResize);
  window.addEventListener("pointerup", stopRightResizing);
};

onBeforeUnmount(() => {
  stopResizing();
  stopRightResizing();
});
</script>

<template>
  <div
    class="workspace-shell flex h-screen w-full min-w-0 flex-col overflow-hidden border-none"
    :style="{ backgroundColor: 'var(--app-surface-frame)', color: 'var(--app-fg)' }"
  >
    <div
      class="workspace-shell__header shrink-0"
      :style="{ backgroundColor: 'var(--app-header-bg)' }"
    >
      <slot name="header" />
    </div>

    <div class="workspace-shell__body flex min-h-0 flex-1">
      <aside
        v-if="$slots.sidebar"
        class="workspace-shell__sidebar relative min-h-0 shrink-0"
        :class="isResizing ? '' : 'transition-[width] duration-200'"
        :style="{
          width: collapse ? '0px' : `${sidebarWidth}px`,
          backgroundColor: 'var(--app-sidebar-bg)'
        }"
      >
        <slot name="sidebar" />
        <div
          v-if="!collapse"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          class="absolute inset-y-0 -right-0.5 z-30 w-1 cursor-col-resize"
          @pointerdown="startResizing"
        />
      </aside>

      <main
        class="workspace-shell__main flex min-h-0 min-w-0 flex-1 flex-col"
        :style="{ backgroundColor: 'var(--app-surface-canvas)' }"
      >
        <div class="min-h-0 flex-1 overflow-hidden">
          <slot />
        </div>
        <slot name="bottomPanel" />
      </main>

      <aside
        v-if="$slots.rightPanel"
        class="workspace-shell__right-panel relative min-h-0 shrink-0 overflow-hidden"
        :class="isRightResizing ? '' : 'transition-[width] duration-200'"
        :style="{
          width: rightPanelOpen ? `${rightPanelWidth}px` : '0px',
          backgroundColor: 'var(--app-surface-panel)'
        }"
      >
        <div class="h-full min-h-0" :aria-hidden="!rightPanelOpen">
          <slot name="rightPanel" />
        </div>
        <div
          v-if="rightPanelOpen"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整右侧面板宽度"
          class="absolute inset-y-0 -left-0.5 z-30 w-1 cursor-col-resize"
          @pointerdown="startRightResizing"
        />
      </aside>
    </div>

    <div
      v-if="$slots.footer"
      class="workspace-shell__footer shrink-0"
      :style="{ backgroundColor: 'var(--app-footer-bg)' }"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
