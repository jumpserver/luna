<script setup lang="ts">
import { useNow } from "@vueuse/core";
import RightPanelSessionShareSection from "~/components/RightPanel/sessionShareSection.vue";
import { useKokoConnectionStore } from "~/koko/stores/connection";

const { t } = useI18n();
const { activeTab } = useWorkspaceTabs();
const { getSessionDetails } = useWorkspaceSessionDetails();
const connectionStore = useKokoConnectionStore();
const now = useNow({ interval: 1000 });

function formatConnectionDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

const connectionDuration = computed(() => {
  const tab = activeTab.value;
  if (!tab?.connectedAt || tab.status !== "connected") return "-";
  return formatConnectionDuration(now.value.getTime() - tab.connectedAt);
});

const sessionDetails = computed(() => {
  const tab = activeTab.value;
  if (!tab) return null;
  return getSessionDetails(tab.id) || null;
});

const isConnectedSession = computed(() =>
  activeTab.value?.status === "connected"
);

const showShareSection = computed(() =>
  Boolean(sessionDetails.value?.shareAllowed && isConnectedSession.value)
);

const sessionRows = computed(() => {
  const tab = activeTab.value;
  const details = sessionDetails.value;
  if (!tab) return [];

  const tokenId = tab.payload?.id || tab.payload?.token?.id;

  return [
    { label: t("RightPanel.SessionAsset"), value: details?.asset || tab.assetName },
    { label: t("RightPanel.SessionAddress"), value: details?.address || tab.address },
    { label: t("RightPanel.SessionAccount"), value: details?.account || tab.account },
    { label: t("RightPanel.SessionProtocol"), value: tab.protocol.toUpperCase() },
    { label: t("RightPanel.SessionDuration"), value: connectionDuration.value },
    {
      label: t("RightPanel.SessionId"),
      value: details?.sessionId || connectionStore.sessionId || tokenId || "-"
    }
  ];
});

const statusLabel = computed(() => {
  const status = activeTab.value?.status;
  if (status === "connected") return t("RightPanel.SessionStatusConnected");
  if (status === "connecting" || status === "ready") return t("RightPanel.SessionStatusConnecting");
  if (status === "failed") return t("RightPanel.SessionStatusFailed");
  return t("RightPanel.SessionStatusIdle");
});

const canShare = computed(() =>
  showShareSection.value && Boolean(connectionStore.enableShare && connectionStore.sessionId)
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-y-auto">
    <div v-if="!activeTab" class="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <UEmpty
        icon="i-lucide-terminal"
        size="sm"
        variant="naked"
        :title="t('RightPanel.SessionEmptyTitle')"
        :description="t('RightPanel.SessionEmptyDescription')"
      />
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div
        class="shrink-0 space-y-3 p-3"
        :class="showShareSection ? 'border-b border-gray-200 dark:border-white/10' : ''"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-[13px] font-medium text-gray-900 dark:text-white">
              {{ activeTab.assetName }}
            </div>
            <div class="truncate font-ui-mono text-[10px] text-gray-500 dark:text-gray-400">
              {{ activeTab.address }}
            </div>
          </div>
          <UBadge
            size="xs"
            :color="activeTab.status === 'connected' ? 'success' : activeTab.status === 'failed' ? 'error' : 'warning'"
            variant="subtle"
          >
            {{ statusLabel }}
          </UBadge>
        </div>

        <dl class="space-y-2">
          <div
            v-for="row in sessionRows"
            :key="row.label"
            class="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[11px]"
          >
            <dt class="text-gray-500 dark:text-gray-400">
              {{ row.label }}
            </dt>
            <dd class="min-w-0 truncate text-gray-800 dark:text-gray-100">
              {{ row.value || "-" }}
            </dd>
          </div>
        </dl>
      </div>

      <div v-if="showShareSection" class="min-h-0 flex-1 p-3">
        <RightPanelSessionShareSection :disabled="!canShare" />
      </div>

      <div v-else-if="!isConnectedSession" class="grid flex-1 place-items-center px-4 text-center">
        <UEmpty
          icon="i-lucide-loader-circle"
          size="sm"
          variant="naked"
          :title="t('RightPanel.SessionWaitingTitle')"
          :description="t('RightPanel.SessionWaitingDescription')"
        />
      </div>
    </div>
  </div>
</template>
