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
    icon: "i-lucide-house",
    label: "我的资产"
  }] as Array<{ key: "assets" | "tools", icon: string, label: string }>;

  if (showTools.value) {
    modes.push({
      key: "tools",
      icon: "i-lucide-layout-grid",
      label: "工具集"
    });
  }

  return modes;
});

const setMode = async (mode: "assets" | "tools") => {
  if (mode === "tools" && !showTools.value) return;

  const toolPaths = [localePath({ path: "/tools" }), localePath("videoplayer"), localePath({ path: "/transcode" })];

  if (mode !== "tools") {
    if (toolPaths.includes(route.path)) {
      await navigateTo(localePath({ path: "/" }));
    }

    setWorkspaceMode(mode);
    return;
  }

  if (!toolPaths.includes(route.path)) {
    await navigateTo(localePath({ path: "/tools" }));
  }

  setWorkspaceMode(mode);
};

const toggleSidebar = () => {
  setCollapse(!collapse.value);
};
</script>

<template>
  <div
    class="relative z-20 flex h-full items-center gap-1"
    :class="isMacClient ? 'pl-[88px] pr-2' : 'px-3'"
  >
    <div v-if="!isMacClient" class="mr-1.5 flex items-center">
      <img src="/logo.png" alt="JumpServer" class="h-5 w-5 rounded">
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
          class="size-6 justify-center rounded-none p-0"
          :class="
            activeWorkspaceMode === mode.key
              ? 'sidebar-icon-active'
              : 'sidebar-icon-muted'
          "
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          @click="setMode(mode.key)"
        />

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          class="size-6 justify-center rounded-none p-0 sidebar-icon-muted"
          icon="i-lucide-panel-left"
          title="折叠侧边栏"
          aria-label="折叠侧边栏"
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          @click="toggleSidebar"
        />
      </div>
    </template>

    <UButton
      v-else
      color="neutral"
      variant="ghost"
      size="sm"
      class="size-6 justify-center rounded-none bg-transparent p-0 sidebar-icon-muted"
      icon="i-lucide-panel-left"
      title="展开侧边栏"
      aria-label="展开侧边栏"
      :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
      @click="toggleSidebar"
    />
  </div>
</template>
