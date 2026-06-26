<script lang="ts" setup>
const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();
const route = useRoute();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();

const cardUi = computed(() => {
  const base = ["rounded-none", "overflow-visible"];

  if (isWindows.value) {
    base.push("border-0", "ring-0", "shadow-none", "bg-transparent");
  }

  return {
    header: "p-0 sm:px-0",
    body: "p-0 sm:p-0",
    footer: "p-0 sm:p-0",
    root: base.join(" ")
  };
});

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
});

watch(
  () => route.path,
  (path) => {
    const normalizedPath = path.toLowerCase();
    const isToolRoute = normalizedPath.includes("/videoplayer") || normalizedPath.includes("/transcode");

    setWorkspaceMode(isToolRoute ? "tools" : "assets");
  },
  { immediate: true }
);
</script>

<template>
  <UCard
    variant="outline"
    :ui="cardUi"
    style="background-color: transparent"
  >
    <div class="flex h-screen w-full flex-col border-none">
      <Header />

      <div class="flex min-h-0 flex-1 gap-0">
        <SideBar />

        <Main class="flex-1 min-w-0">
          <WorkspaceTerminalArea v-if="activeWorkspaceMode === 'assets'" />
          <slot v-else />
        </Main>
      </div>
    </div>
  </UCard>
</template>
