<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { KokoConnectView } from "@jumpserver/koko";
import { getAuthenticatedTerminalCommandHistoryScope } from "~/composables/useTerminalCommandHistory";
import { useUserInfoStore } from "~/store/modules/userInfo";

definePageMeta({ layout: "connect" });

const route = useRoute();
const colorMode = useColorMode();
const { t } = useI18n();
const { activePaneId } = useWorkspaceTabs();
const { currentSite, currentUser, loggedIn } = storeToRefs(useUserInfoStore());
const { bootstrapPersistedSession } = useAuthSession();
const sessionContext = ref<ConnectorSessionContext | null>(null);
const aiOpen = ref(true);

provide(connectorSessionKey, sessionContext);

const tokenId = computed(() => String(route.query.token || ""));

function currentHistoryScope() {
  return getAuthenticatedTerminalCommandHistoryScope({
    authenticated: loggedIn.value,
    site: currentSite.value,
    userId: currentUser.value?.userId || ""
  });
}

function syncHistoryScope() {
  if (!sessionContext.value) return;
  const scope = currentHistoryScope();
  if (sessionContext.value.terminalCommandHistoryScope === scope) return;
  sessionContext.value.terminalCommandHistoryScope = scope;
}

onMounted(async () => {
  if (!tokenId.value) return;

  const paneId = `standalone:${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  sessionContext.value = {
    component: "koko",
    tokenId: tokenId.value,
    ticket: String(route.query.ticket || ""),
    endpointUrl: window.location.origin,
    terminalThemeName: colorMode.value === "dark" ? "OneHalfDark" : "OneHalfLight",
    colorMode: colorMode.value,
    themeType: colorMode.value === "dark" ? "darkGary" : "default",
    disableAutoHash: String(route.query.disableautohash || "false"),
    tabId: paneId,
    terminalCommandHistoryScope: "",
    terminalProfile: {
      protocol: String(route.query.protocol || "ssh"),
      assetPlatform: String(route.query.platform || "")
    }
  };
  activePaneId.value = paneId;
  await bootstrapPersistedSession();
  syncHistoryScope();
});

watch([loggedIn, currentSite, () => currentUser.value?.userId], syncHistoryScope);

onBeforeUnmount(() => {
  if (activePaneId.value === sessionContext.value?.tabId) {
    activePaneId.value = "";
  }
});
</script>

<template>
  <div class="relative flex h-full min-h-0">
    <div class="relative min-w-0 flex-1">
      <KokoConnectView v-if="sessionContext" />
      <div v-else class="grid h-full place-items-center text-sm text-muted">
        {{ t("koko.workspace.missingToken") }}
      </div>

      <UButton
        v-if="sessionContext"
        size="sm"
        color="neutral"
        variant="soft"
        class="absolute right-3 top-3 z-40 shadow-md backdrop-blur-sm"
        :icon="aiOpen ? 'i-lucide-panel-right-close' : 'i-lucide-sparkles'"
        :aria-label="aiOpen ? t('RightPanel.Close') : t('RightPanel.AI')"
        @click="aiOpen = !aiOpen"
      />
    </div>

    <aside
      v-if="sessionContext && aiOpen"
      class="h-full min-h-0 w-[min(360px,42vw)] shrink-0 border-l border-default bg-default"
    >
      <RightPanelAiPanel />
    </aside>
  </div>
</template>
