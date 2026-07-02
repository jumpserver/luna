<script lang="ts" setup>
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();
const route = useRoute();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();
const { registerSessionDisposer } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const { consumeWindowAssetPayload } = useAssetWindowLauncher();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const showWorkspaceSidebar = computed(() => activeWorkspaceMode.value !== "assets" || loggedIn.value);

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
  warmupWebSettings();
  preloadSettingsModal();
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

watch(
  () => [loggedIn.value, route.query.asset_window_payload] as const,
  async ([isLoggedIn, payload]) => {
    if (!isLoggedIn || typeof payload !== "string" || !payload) return;
    await consumeWindowAssetPayload(payload);
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
    <SettingsModal v-if="!isTauriRuntime()" />

    <WorkspaceShell>
      <template #header>
        <Header />
      </template>

      <template v-if="showWorkspaceSidebar" #sidebar>
        <SideBar />
      </template>

      <Main class="h-full min-h-0">
        <WorkspaceTerminalArea v-if="activeWorkspaceMode === 'assets'" />
        <slot v-else />
      </Main>

      <template #rightPanel>
        <RightPanel />
      </template>

      <template #footer>
        <WorkspaceStatusFooter />
      </template>
    </WorkspaceShell>
  </UCard>
</template>
