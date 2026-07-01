<script setup lang="ts">
const { collapse } = useSettingManager();
const { sidebarWidth, setSidebarWidth } = useSidebarLayout();
const isResizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

const handleResize = (event: PointerEvent) => {
  if (!isResizing.value) return;
  setSidebarWidth(resizeStartWidth + event.clientX - resizeStartX);
};

const stopResizing = () => {
  if (!isResizing.value) return;
  isResizing.value = false;
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

onBeforeUnmount(stopResizing);
</script>

<template>
  <div class="workspace-shell flex h-screen w-full min-w-0 flex-col overflow-hidden border-none">
    <div class="workspace-shell__header shrink-0">
      <slot name="header" />
    </div>

    <div class="workspace-shell__body flex min-h-0 flex-1">
      <aside
        v-if="$slots.sidebar"
        class="workspace-shell__sidebar relative min-h-0 shrink-0"
        :class="isResizing ? '' : 'transition-[width] duration-200'"
        :style="{ width: collapse ? '0px' : `${sidebarWidth}px` }"
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

      <main class="workspace-shell__main min-w-0 flex-1 min-h-0">
        <slot />
      </main>
    </div>

    <div v-if="$slots.footer" class="workspace-shell__footer shrink-0">
      <slot name="footer" />
    </div>
  </div>
</template>
