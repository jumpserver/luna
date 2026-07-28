<script setup lang="ts">
const { collapse } = useSettingManager();
const { isMacOS } = usePlatform();
const { sidebarWidth } = useSidebarLayout();
const router = useRouter();
const isToolWindow = computed(() => router.currentRoute.value.query.tool_window === "1");
const leadingAreaStyle = computed(() => ({
  width: collapse.value
    ? (isMacOS.value ? "128px" : "44px")
    : `${sidebarWidth.value}px`
}));

const handleWindowDrag = async (event: MouseEvent) => {
  if (!isTauriRuntime()) return;

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
    class="header-bg h-10 min-h-10 max-h-10 shrink-0 flex items-center"
    :style="{
      backgroundColor: 'var(--app-header-bg)',
      borderBottom: '1px solid var(--app-border)'
    }"
    @mousedown="handleWindowDrag"
  >
    <div
      v-if="$slots.leading"
      class="h-full shrink-0 transition-[width] duration-200"
      :style="leadingAreaStyle"
    >
      <slot name="leading" />
    </div>

    <div class="h-full min-w-0 flex-1 overflow-hidden px-1.5">
      <slot />
    </div>

    <div v-if="!isToolWindow" class="h-full shrink-0 flex items-center pl-1">
      <HeaderActionButtons />
    </div>
  </div>
</template>
