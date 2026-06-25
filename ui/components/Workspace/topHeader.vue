<script setup lang="ts">
const { collapse, setCollapse } = useSettingManager();
const { isMacOS } = usePlatform();

const toggleSidebar = () => {
  setCollapse(!collapse.value);
};

const leadingAreaClass = computed(() => {
  if (!collapse.value) return "w-0";
  return isMacOS.value ? "w-32 pl-[92px] justify-start" : "w-10 pl-1 justify-center";
});

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
    <div
      class="h-full shrink-0 flex items-center transition-[width,padding] duration-200"
      :class="leadingAreaClass"
    >
      <UButton
        v-if="collapse"
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-7 justify-center rounded-md p-0"
        icon="i-lucide-panel-left"
        title="展开侧边栏"
        aria-label="展开侧边栏"
        :ui="{ leadingIcon: 'm-0 shrink-0' }"
        @click="toggleSidebar"
      />
    </div>

    <div class="h-full min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>

    <div class="h-full shrink-0 flex items-center">
      <HeaderActionButtons />
    </div>
  </div>
</template>
