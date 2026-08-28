<script setup lang="ts">
const { t } = useI18n();
const { isMacOS } = usePlatform();
const localePath = useLocalePath();
const { collapse, setCollapse } = useSettingManager();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { openHoverPreview, closeHoverPreview, scheduleHoverPreviewClose } = useSidebarLayout();
const { uiWorkspaceMode } = useWorkspaceMode();
const isMacClient = computed(() => isDesktopRuntime() && isMacOS.value);
const showHeaderLogo = computed(() => !isDesktopRuntime());
const headerIconButtonClass =
  "grid size-6 shrink-0 place-items-center rounded-lg p-0 text-gray-500 transition-colors hover:bg-black/6 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white";

const workspaceModes = computed(() => {
  return [
    {
      key: "assets",
      icon: "i-lucide-house",
      label: t("Menu.MyAssets"),
      tooltip: t("Menu.MyAssets")
    },
    {
      key: "files",
      icon: "i-lucide-folder-kanban",
      label: t("Menu.FileManager"),
      tooltip: t("Menu.FileManager")
    }
  ] as Array<{ key: "assets" | "files"; icon: string; label: string; tooltip: string }>;
});

const setMode = async (mode: "assets" | "files") => {
  await navigateTo(localePath({ path: mode === "files" ? "/files" : "/" }));
};

const toggleSidebar = () => {
  closeHoverPreview();
  setCollapse(!collapse.value);
};

const previewSidebar = () => {
  if (collapse.value && !isNarrowScreen.value) openHoverPreview();
};
</script>

<template>
  <div
    class="relative z-20 flex h-full items-center gap-1"
    :class="isMacClient ? 'pl-[88px] pr-2' : 'px-2.5'"
    data-desktop-drag-region="false"
    @mousedown.stop
  >
    <div v-if="showHeaderLogo" class="mr-1.5 flex items-center">
      <img src="~/assets/logo.svg" alt="JumpServer" class="h-5 w-5" />
    </div>

    <template v-if="!collapse">
      <div class="flex items-center gap-1 bg-transparent">
        <UTooltip v-for="mode in workspaceModes" :key="mode.key" arrow :text="mode.tooltip">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="mode.icon"
            :aria-label="mode.label"
            :class="[
              headerIconButtonClass,
              uiWorkspaceMode === mode.key ? 'bg-black/6 text-gray-800 dark:bg-white/10 dark:text-white' : ''
            ]"
            :ui="{ leadingIcon: 'm-0 size-4' }"
            @click="setMode(mode.key)"
          />
        </UTooltip>

        <UTooltip arrow :text="t('Sidebar.Collapse')">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :class="headerIconButtonClass"
            icon="i-lucide-panel-left"
            :aria-label="t('Sidebar.Collapse')"
            :ui="{ leadingIcon: 'm-0 size-4' }"
            @click="toggleSidebar"
          />
        </UTooltip>
      </div>
    </template>

    <UTooltip v-else arrow :text="t('Sidebar.Expand')">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        :class="headerIconButtonClass"
        icon="i-lucide-panel-left-open"
        :aria-label="t('Sidebar.Expand')"
        :ui="{ leadingIcon: 'm-0 size-4' }"
        @pointerenter="previewSidebar"
        @pointerleave="scheduleHoverPreviewClose"
        @click="toggleSidebar"
      />
    </UTooltip>
  </div>
</template>
