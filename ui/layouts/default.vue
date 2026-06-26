<script lang="ts" setup>
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();
const route = useRoute();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();
const { registerSessionDisposer } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();

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
  if (isTauriRuntime()) {
    registerSessionDisposer((id: string) =>
      useTauriCoreInvoke("builtin_session_close", {
        payload: { tabId: id }
      })
    );
    registerKokoTicketProvider((request) =>
      useTauriCoreInvoke("create_koko_connect_ticket", {
        baseUrl: request.baseUrl,
        tokenId: request.tokenId
      })
    );
  }
});

onBeforeUnmount(() => {
  registerSessionDisposer(null);
  registerKokoTicketProvider(null);
});

watch(
  () => route.path,
  (path) => {
    const normalizedPath = path.toLowerCase();
    const isToolRoute = normalizedPath.includes("/videoplayer") || normalizedPath.includes("/transcode");

    setWorkspaceMode(isTauriRuntime() && isToolRoute ? "tools" : "assets");
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
    <WorkspaceShell>
      <template #header>
        <Header />
      </template>

      <template #sidebar>
        <SideBar />
      </template>

      <Main class="h-full min-h-0">
        <WorkspaceTerminalArea v-if="activeWorkspaceMode === 'assets'" />
        <slot v-else />
      </Main>

      <template #footer>
        <WorkspaceStatusFooter />
      </template>
    </WorkspaceShell>
  </UCard>
</template>
