<script setup lang="ts">
const { isMacOS } = usePlatform();
const localePath = useLocalePath();
const route = useRoute();
const { collapse, setCollapse } = useSettingManager();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();
const isMacClient = computed(() => isTauriRuntime() && isMacOS.value);
const showTools = computed(() => isTauriRuntime());

const workspaceModes = computed(() => {
  const modes = [{
    key: "assets",
    icon: "i-lucide-server",
    label: "我的资产"
  }] as Array<{ key: "assets" | "tools", icon: string, label: string }>;

  if (showTools.value) {
    modes.push({
      key: "tools",
      icon: "i-lucide-menu",
      label: "工具集"
    });
  }

  return modes;
});

const setMode = async (mode: "assets" | "tools") => {
  if (mode === "tools" && !showTools.value) return;

  if (mode !== "tools") {
    setWorkspaceMode(mode);
    return;
  }

  const toolPaths = [localePath("videoplayer"), localePath({ path: "/transcode" })];
  if (!toolPaths.includes(route.path)) {
    await navigateTo(localePath("videoplayer"));
  }

  setWorkspaceMode(mode);
};

const toggleSidebar = () => {
  setCollapse(!collapse.value);
};
</script>

<template>
  <div
    class="flex h-full items-center gap-1"
    :class="isMacClient ? 'pl-[92px] pr-3' : 'px-3'"
  >
    <div v-if="!isMacClient" class="mr-1.5 flex items-center">
      <img src="/logo.png" alt="JumpServer" class="h-5 w-5 rounded">
    </div>

    <template v-if="!collapse">
      <UButton
        v-for="mode in workspaceModes"
        :key="mode.key"
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="mode.icon"
        :title="mode.label"
        :aria-label="mode.label"
        class="size-7 justify-center rounded-md p-0"
        :class="
          activeWorkspaceMode === mode.key
            ? 'bg-black/8 text-gray-900 dark:bg-white/12 dark:text-white'
            : 'text-gray-500 dark:text-gray-400'
        "
        :ui="{ leadingIcon: 'm-0 shrink-0' }"
        @click="setMode(mode.key)"
      />

      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-7 justify-center rounded-md p-0"
        icon="i-lucide-panel-left"
        title="折叠侧边栏"
        aria-label="折叠侧边栏"
        :ui="{ leadingIcon: 'm-0 shrink-0' }"
        @click="toggleSidebar"
      />
    </template>

    <UButton
      v-else
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
</template>
