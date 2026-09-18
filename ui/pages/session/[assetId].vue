<script setup lang="ts">
import AiOverlayPanel from "~/components/RightPanel/AiOverlayPanel.vue";
import { isAdminSessionQuery } from "~/composables/useSessionWindowConnect";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

definePageMeta({ layout: "connect" });

const route = useRoute();
const { t } = useI18n();
const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { closeSession, registerSessionDisposer, activeTab } = useWorkspaceTabs();
const { registerKokoTicketProvider } = useWorkspaceConnectors();
const { ensureConnected, error, assetName } = useSessionWindowConnect();
const { authReady } = useAuthSession();
const { open: rightPanelOpen, panelWidth } = useRightPanel();
const { open: aiPanelOpen, setOpen: setAiPanelOpen } = useAiPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const bootstrapped = ref(false);
const isAdminConnect = computed(() => isAdminSessionQuery(route.query));
const adminProtocol = computed(() => String(activeTab.value?.protocol || route.query.protocol || ""));
const adminComponent = computed(() => String(activeTab.value?.payload?.connectMethod?.component || ""));
const adminMethod = computed(() =>
  String(activeTab.value?.connectMethod || activeTab.value?.payload?.connectMethod?.value || "")
);
const isAdminGuiSession = computed(() => {
  if (["lion", "tinker", "razor", "panda"].includes(adminComponent.value)) return true;
  return ["rdp", "vnc"].includes(adminProtocol.value.toLowerCase());
});
const isAdminSftpSession = computed(
  () => adminMethod.value.includes("sftp") || adminProtocol.value.toLowerCase() === "sftp"
);
const showAdminSessionHeader = computed(
  () => isAdminConnect.value && Boolean(activeTab.value) && !isAdminGuiSession.value && !isAdminSftpSession.value
);
const adminSessionTitle = computed(() => {
  const protocol = adminProtocol.value;
  const label = protocol === "k8s" ? "K8s" : protocol.toUpperCase();
  return `${label} ${t("RightPanel.Session")}`.trim();
});
const adminConnectedAt = computed(() => {
  const at = activeTab.value?.connectedAt;
  return at ? new Date(at).toLocaleString() : "";
});

const closeAdminSession = async () => {
  if (activeTab.value) await closeSession(activeTab.value.id).catch(() => undefined);
  if (isDesktopRuntime()) await desktopInvoke("close_window");
  else window.close();
};

useHead(() => ({ title: assetName.value || "JumpServer" }));

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
  registerSessionDisposer(() => {});
  registerKokoTicketProvider(async (request) => {
    if (isDesktopRuntime()) {
      return desktopInvoke("create_koko_connect_ticket", { ...request });
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
  () =>
    [
      bootstrapped.value,
      authReady.value,
      loggedIn.value,
      route.params.assetId,
      route.query.protocol,
      route.query.method
    ] as const,
  () => {
    if (!bootstrapped.value || !authReady.value || !loggedIn.value) return;
    void ensureConnected();
  },
  { immediate: true }
);

const openLogin = () => {
  useEventBus().emit("login", undefined);
};
</script>

<template>
  <div
    data-ai-context="workspace"
    class="relative flex h-full w-full min-h-0 overflow-hidden"
    :style="{ backgroundColor: 'var(--app-main-bg)' }"
  >
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header
        v-if="showAdminSessionHeader"
        class="flex h-14 shrink-0 items-center gap-3 border-b px-3"
        :style="{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-header-bg)' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          class="size-7 justify-center rounded-lg p-0"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          :aria-label="t('Common.Close')"
          @click="closeAdminSession"
        />
        <div class="h-6 w-px shrink-0 bg-[var(--app-border)]" />
        <div class="min-w-0">
          <div class="truncate text-sm font-medium" :style="{ color: 'var(--app-fg)' }">
            {{ adminSessionTitle }}
          </div>
          <div class="flex min-w-0 flex-wrap gap-x-3 text-xs" :style="{ color: 'var(--app-muted)' }">
            <span class="truncate">{{ t("RightPanel.SessionAsset") }}: {{ activeTab?.assetName }}</span>
            <span v-if="adminConnectedAt" class="truncate">{{ t("Replay.StartTime") }}: {{ adminConnectedAt }}</span>
          </div>
        </div>
      </header>
      <template v-if="activeTab">
        <WorkspaceSessionPane :tab="activeTab" class="min-h-0 flex-1" />
        <WorkspacePaneSurfaceHost v-for="pane in activeTab.panes" :key="pane.id" :pane="pane" />

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
            {{ t("WorkspacePane.Reconnect") }}
          </UButton>
        </div>
      </div>

      <div v-else class="grid h-full place-items-center text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
      </div>
    </div>

    <KeepAlive>
      <AiOverlayPanel v-if="activeTab && aiPanelOpen" @close="setAiPanelOpen(false)" />
    </KeepAlive>
  </div>
</template>
