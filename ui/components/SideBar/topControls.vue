<script setup lang="ts">
const { isMacOS } = usePlatform();
const localePath = useLocalePath();
const { collapse, setCollapse } = useSettingManager();
const { uiWorkspaceMode } = useWorkspaceMode();
const isMacClient = computed(() => isTauriRuntime() && isMacOS.value);
const headerIconButtonClass =
  "grid size-6 shrink-0 place-items-center rounded-lg p-0 text-gray-500 transition-colors hover:bg-black/6 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white";

const workspaceModes = computed(() => {
  return [
    {
      key: "assets",
      icon: "i-lucide-house",
      label: "我的资产"
    },
    {
      key: "files",
      icon: "i-lucide-folder-kanban",
      label: "文件管理"
    }
  ] as Array<{ key: "assets" | "files"; icon: string; label: string }>;
});

const setMode = async (mode: "assets" | "files") => {
  await navigateTo(localePath({ path: mode === "files" ? "/files" : "/" }));
};

const toggleSidebar = () => {
  setCollapse(!collapse.value);
};
</script>

<template>
  <div
    class="relative z-20 flex h-full items-center gap-1"
    :class="isMacClient ? 'pl-[88px] pr-2' : 'px-2.5'"
    data-tauri-drag-region="false"
    @mousedown.stop
  >
    <div v-if="!isMacClient" class="mr-1.5 flex items-center">
      <img src="/logo.png" alt="JumpServer" class="h-5 w-5 rounded" />
    </div>

    <template v-if="!collapse">
      <div class="flex items-center gap-1 bg-transparent">
        <UButton
          v-for="mode in workspaceModes"
          :key="mode.key"
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="mode.icon"
          :title="mode.label"
          :aria-label="mode.label"
          :class="[
            headerIconButtonClass,
            uiWorkspaceMode === mode.key ? 'bg-black/6 text-gray-800 dark:bg-white/10 dark:text-white' : ''
          ]"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          @click="setMode(mode.key)"
        />

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :class="headerIconButtonClass"
          icon="i-lucide-panel-left"
          title="折叠侧边栏"
          aria-label="折叠侧边栏"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          @click="toggleSidebar"
        />
      </div>
    </template>

    <UButton
      v-else
      color="neutral"
      variant="ghost"
      size="sm"
      :class="headerIconButtonClass"
      icon="i-lucide-panel-left"
      title="展开侧边栏"
      aria-label="展开侧边栏"
      :ui="{ leadingIcon: 'm-0 size-4' }"
      @click="toggleSidebar"
    />
  </div>
</template>
