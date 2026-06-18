<script setup lang="ts">
const handleWindowDrag = async (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (
    target.closest("button")
    || target.closest('[role="button"]')
    || target.closest("input")
    || target.closest("select")
  ) {
    return;
  }

  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();

    windows.forEach((window) => {
      if (window.label === "main") {
        window.startDragging();
      }
    });
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <div
    class="header-bg h-10 min-h-10 max-h-10 shrink-0 flex items-center border-b border-gray-200 dark:border-white/10"
    @mousedown="handleWindowDrag"
  >
    <div class="h-full min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>

    <div class="h-full shrink-0 flex items-center">
      <HeaderActionButtons />
    </div>
  </div>
</template>
