<script lang="ts" setup>
import WorkspaceBatchCommandBottomPanel from "~/components/Workspace/batchCommandBottomPanel.vue";
import WorkspaceShell from "~/components/Workspace/shell.vue";
import WorkspaceStatusFooter from "~/components/Workspace/statusFooter.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();
const { activeWorkspaceMode, uiWorkspaceMode } = useWorkspaceMode();
const { registerSessionDisposer } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { batchPanelOpen } = useBatchCommandPanel();

const showWorkspaceSidebar = computed(
  () =>
    uiWorkspaceMode.value !== "files"
    && uiWorkspaceMode.value !== "tools"
    && (uiWorkspaceMode.value !== "assets" || loggedIn.value)
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
</script>

<template>
  <UCard variant="outline" :ui="cardUi" style="background-color: transparent">
    <SettingsModal v-if="!isTauriRuntime()" />

    <WorkspaceShell :sidebar-visible="showWorkspaceSidebar">
      <template #header>
        <Header />
      </template>

      <template #sidebar>
        <SideBar />
      </template>

      <Main class="h-full min-h-0">
        <WorkspaceTerminalArea v-show="activeWorkspaceMode === 'assets'" class="h-full min-h-0" />
        <div v-show="activeWorkspaceMode !== 'assets'" class="h-full min-h-0">
          <slot />
        </div>
      </Main>

      <template #rightPanel>
        <RightPanel />
      </template>

      <template #bottomPanel>
        <div v-show="activeWorkspaceMode === 'assets' && batchPanelOpen" class="min-h-0">
          <WorkspaceBatchCommandBottomPanel />
        </div>
      </template>

      <template #footer>
        <div v-show="activeWorkspaceMode === 'assets'">
          <WorkspaceStatusFooter />
        </div>
      </template>
    </WorkspaceShell>
  </UCard>
</template>
