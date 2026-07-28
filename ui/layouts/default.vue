<script lang="ts" setup>
import WorkspaceBatchCommandBottomPanel from "~/components/Workspace/batchCommandBottomPanel.vue";
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();
const route = useRoute();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();
const { registerSessionDisposer } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { batchPanelOpen } = useBatchCommandPanel();

const showWorkspaceSidebar = computed(() =>
  activeWorkspaceMode.value !== "files"
  && activeWorkspaceMode.value !== "tools"
  && (activeWorkspaceMode.value !== "assets" || loggedIn.value)
);

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
  // ponytail: koko WS sessions close on component unmount; no Rust builtin bridge
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isTauriRuntime()) {
      return useTauriCoreInvoke("create_koko_connect_ticket", {
        baseUrl: request.baseUrl,
        tokenId: request.tokenId
      });
    }

    const url = `${request.baseUrl.replace(/\/+$/, "")}/koko/api/connect-ticket/`;
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getWebApiMutationHeaders() },
      body: JSON.stringify({ token_id: request.tokenId })
    });

    if (!response.ok) {
      throw new Error(`create koko connect ticket failed: ${response.status}`);
    }

    return response.json() as Promise<{ ticket?: string }>;
  });
});

onBeforeUnmount(() => {
  registerSessionDisposer(null);
  registerKokoTicketProvider(null);
});

watch(
  () => route.path,
  (path) => {
    const normalizedPath = path.toLowerCase();
    const isFileRoute = normalizedPath.includes("/files");
    const isToolRoute = normalizedPath.includes("/tools") || normalizedPath.includes("/videoplayer") || normalizedPath.includes("/transcode");

    setWorkspaceMode(isFileRoute ? "files" : isTauriRuntime() && isToolRoute ? "tools" : "assets");
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

      <template v-if="activeWorkspaceMode === 'assets' && batchPanelOpen" #bottomPanel>
        <WorkspaceBatchCommandBottomPanel />
      </template>

      <template v-if="activeWorkspaceMode === 'assets'" #footer>
        <WorkspaceStatusFooter />
      </template>
    </WorkspaceShell>
  </UCard>
</template>
