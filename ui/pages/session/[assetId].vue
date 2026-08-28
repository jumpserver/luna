<script setup lang="ts">
import AiOverlayPanel from "~/components/RightPanel/AiOverlayPanel.vue";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

definePageMeta({ layout: "connect" });

const route = useRoute();
const { t } = useI18n();
const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { registerSessionDisposer, activeTab } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const { ensureConnected, error } = useSessionWindowConnect();
const { open: rightPanelOpen, panelWidth, toggle: toggleRightPanel } = useRightPanel();
const { open: aiPanelOpen, setOpen: setAiPanelOpen, toggleAi } = useAiPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const bootstrapped = ref(false);

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isDesktopRuntime()) {
      return desktopInvoke("create_koko_connect_ticket", {
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
  bootstrapped.value = true;
});

onBeforeUnmount(() => {
  registerSessionDisposer(null);
  registerKokoTicketProvider(null);
});

watch(
  () => [bootstrapped.value, loggedIn.value, route.params.assetId, route.query.protocol, route.query.method] as const,
  () => {
    if (!bootstrapped.value || !loggedIn.value) return;
    void ensureConnected();
  },
  { immediate: true }
);

const openLogin = () => {
  useEventBus().emit("login", undefined);
};

const handleToggleAi = () => {
  toggleAi();
};
</script>

<template>
  <div
    data-ai-context="workspace"
    class="relative flex h-dvh w-full min-h-0 overflow-hidden"
    :style="{ backgroundColor: 'var(--app-main-bg)' }"
  >
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <template v-if="activeTab">
        <WorkspaceSessionPane :tab="activeTab" class="h-full min-h-0" />
        <WorkspacePaneSurfaceHost v-for="pane in activeTab.panes" :key="pane.id" :pane="pane" />

        <div
          class="absolute top-2 z-40 flex items-center gap-1"
          :style="rightPanelOpen ? { right: `${panelWidth}px` } : { right: '12px' }"
        >
          <UTooltip :text="t(aiPanelOpen ? 'RightPanel.AIClose' : 'RightPanel.AIOpen')" :delay-duration="150">
            <UButton
              size="sm"
              color="primary"
              :variant="aiPanelOpen ? 'soft' : 'ghost'"
              class="shadow-md backdrop-blur-sm"
              icon="i-lucide-sparkles"
              :aria-label="t(aiPanelOpen ? 'RightPanel.AIClose' : 'RightPanel.AIOpen')"
              :aria-pressed="aiPanelOpen"
              @click="handleToggleAi"
            />
          </UTooltip>

          <UTooltip :text="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')" :delay-duration="150">
            <UButton
              size="sm"
              color="neutral"
              :variant="rightPanelOpen ? 'soft' : 'ghost'"
              class="shadow-md backdrop-blur-sm"
              :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
              :aria-label="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
              :aria-pressed="rightPanelOpen"
              @click="toggleRightPanel"
            />
          </UTooltip>
        </div>

        <aside
          class="absolute inset-y-0 right-0 z-30 overflow-hidden border-l border-default transition-transform duration-150 ease-out will-change-transform"
          :style="{
            width: `${panelWidth}px`,
            transform: rightPanelOpen ? 'translateX(0)' : 'translateX(100%)',
            pointerEvents: rightPanelOpen ? 'auto' : 'none'
          }"
          :aria-hidden="!rightPanelOpen"
        >
          <RightPanel class="h-full min-h-0" />
        </aside>
      </template>

      <div v-else-if="!loggedIn" class="grid h-full place-items-center text-sm" :style="{ color: 'var(--app-muted)' }">
        <div class="flex flex-col items-center gap-4">
          <UIcon name="i-lucide-log-in" class="size-10" />
          <p>{{ t("Common.Login") }}</p>
          <UButton color="primary" variant="soft" @click="openLogin">
            {{ t("Common.Login") }}
          </UButton>
        </div>
      </div>

      <div v-else-if="error" class="grid h-full place-items-center p-6 text-sm text-muted">
        <div class="flex max-w-sm flex-col items-center gap-3 text-center">
          <UIcon name="i-lucide-circle-alert" class="size-7" />
          <p>{{ error }}</p>
          <UButton size="sm" color="primary" variant="soft" @click="ensureConnected">
            {{ t("Reconnect") }}
          </UButton>
        </div>
      </div>

      <div v-else class="grid h-full place-items-center text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
      </div>
    </div>

    <AiOverlayPanel v-if="activeTab && aiPanelOpen" @close="setAiPanelOpen(false)" />
  </div>
</template>
