<script setup lang="ts">
import {
  getKokoLinuxMetrics,
  subscribeKokoLinuxMetrics,
  unsubscribeKokoLinuxMetrics,
  useKokoConnectionStore
} from "@jumpserver/koko";
import { useNow } from "@vueuse/core";
import prettyBytes from "pretty-bytes";
import { getLionWorkspaceSession } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";
import RightPanelMetricSparkline from "~/components/RightPanel/metricSparkline.vue";
import RightPanelSessionShareSection from "~/components/RightPanel/sessionShareSection.vue";

const { t } = useI18n();
const { activeTab, activePaneId } = useWorkspaceTabs();
const { open: rightPanelOpen, activeTab: rightPanelTab } = useRightPanel();
const { getSessionDetails } = useWorkspaceSessionDetails();
const connectionStore = useKokoConnectionStore();
const now = useNow({ interval: 1000 });
const basicInfoOpen = ref(true);
const metricsOpen = ref(true);
const shareInfoOpen = ref(true);

const activeSession = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});

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
  const session = activeSession.value;
  if (!session?.connectedAt || session.status !== "connected") return "-";
  return formatConnectionDuration(now.value.getTime() - session.connectedAt);
});

const sessionDetails = computed(() => {
  const session = activeSession.value;
  return session ? getSessionDetails(session.id) || null : null;
});
const lionSession = computed(() => getLionWorkspaceSession(activeSession.value?.id || ""));

const isConnectedSession = computed(() => activeSession.value?.status === "connected");
const isLinuxSSHSession = computed(() => {
  const session = activeSession.value;
  if (!session || session.protocol.toLowerCase() !== "ssh") return false;
  return /linux|unix/.test(`${session.assetType} ${session.assetPlatform}`.toLowerCase());
});

const metricsTabId = computed(() => {
  if (
    !rightPanelOpen.value ||
    rightPanelTab.value !== "session" ||
    !isConnectedSession.value ||
    !isLinuxSSHSession.value ||
    !metricsOpen.value
  ) {
    return "";
  }
  return activeSession.value?.id || "";
});

watch(
  metricsTabId,
  (next, previous) => {
    if (previous && previous !== next) unsubscribeKokoLinuxMetrics(previous);
    if (next) subscribeKokoLinuxMetrics(next, activeSession.value?.assetId || "");
  },
  { immediate: true }
);

onUnmounted(() => {
  if (metricsTabId.value) unsubscribeKokoLinuxMetrics(metricsTabId.value);
});

const metricsState = computed(() => {
  const tabId = activeSession.value?.id || "";
  return tabId ? getKokoLinuxMetrics(tabId) : null;
});
const metrics = computed(() => metricsState.value?.latest || null);
const metricsHistory = computed(() => metricsState.value?.history || []);
const cpuHistory = computed(() => metricsHistory.value.map((sample) => sample.cpuPercent));
const memoryHistory = computed(() => metricsHistory.value.map((sample) => sample.memoryPercent));
const diskReadHistory = computed(() => metricsHistory.value.map((sample) => sample.diskReadBytesPerSecond));
const diskWriteHistory = computed(() => metricsHistory.value.map((sample) => sample.diskWriteBytesPerSecond));
const networkRXHistory = computed(() => metricsHistory.value.map((sample) => sample.networkRxBytesPerSecond));
const networkTXHistory = computed(() => metricsHistory.value.map((sample) => sample.networkTxBytesPerSecond));

const formatBytes = (value: number) => prettyBytes(Math.max(0, value), { maximumFractionDigits: 1 });
const formatRate = (value: number) => `${formatBytes(value)}/s`;
const formatPercent = (value: number) => `${Math.max(0, value).toFixed(1)}%`;

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? t("RightPanel.MetricsUptimeDays", { days, hours }) : t("RightPanel.MetricsUptimeHours", { hours });
}

const showShareSection = computed(() => {
  if (!isConnectedSession.value) return false;
  if (lionSession.value) return Boolean(lionSession.value.share.sessionId.value);
  return Boolean(sessionDetails.value?.shareAllowed);
});

const sessionRows = computed(() => {
  const session = activeSession.value;
  const details = sessionDetails.value;
  if (!session) return [];
  const tokenId = session.payload?.id || session.payload?.token?.id;

  return [
    { label: t("RightPanel.SessionAsset"), value: details?.asset || session.assetName },
    { label: t("RightPanel.SessionAddress"), value: details?.address || session.address },
    { label: t("RightPanel.SessionAccount"), value: details?.account || session.account },
    { label: t("RightPanel.SessionProtocol"), value: session.protocol.toUpperCase() },
    { label: t("RightPanel.SessionDuration"), value: connectionDuration.value },
    {
      label: t("RightPanel.SessionId"),
      value:
        details?.sessionId ||
        lionSession.value?.share.sessionId.value ||
        (!lionSession.value ? connectionStore.sessionId : "") ||
        tokenId ||
        "-"
    }
  ];
});

const statusLabel = computed(() => {
  const status = activeSession.value?.status;
  if (status === "connected") return t("RightPanel.SessionStatusConnected");
  if (status === "connecting" || status === "ready") return t("RightPanel.SessionStatusConnecting");
  if (status === "failed") return t("RightPanel.SessionStatusFailed");
  return t("RightPanel.SessionStatusIdle");
});

const canShare = computed(() => {
  if (!showShareSection.value) return false;
  if (lionSession.value) {
    return Boolean(lionSession.value.share.enableShare.value && lionSession.value.share.sessionId.value);
  }
  return Boolean(connectionStore.enableShare && connectionStore.sessionId);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-y-auto">
    <div v-if="!activeSession" class="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <UEmpty
        icon="i-lucide-terminal"
        size="sm"
        variant="naked"
        :title="t('RightPanel.SessionEmptyTitle')"
        :description="t('RightPanel.SessionEmptyDescription')"
      />
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <UCollapsible v-model:open="basicInfoOpen" class="shrink-0">
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="h-9 cursor-pointer justify-start rounded-none px-3 text-xs font-semibold"
          :aria-label="t('RightPanel.BasicInfo')"
        >
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0 text-primary" />
          <span>{{ t("RightPanel.BasicInfo") }}</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="ml-auto size-3.5 shrink-0 transition-transform duration-150"
            :class="basicInfoOpen ? 'rotate-90' : ''"
          />
        </UButton>

        <template #content>
          <div class="space-y-3 px-3 pb-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-[13px] font-medium text-highlighted">
                  {{ activeSession.assetName }}
                </div>
                <div class="truncate font-ui-mono text-[10px] text-muted">
                  {{ activeSession.address }}
                </div>
              </div>
              <UBadge
                size="xs"
                :color="
                  activeSession.status === 'connected'
                    ? 'success'
                    : activeSession.status === 'failed'
                      ? 'error'
                      : 'warning'
                "
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
                <dt class="text-muted">{{ row.label }}</dt>
                <dd class="min-w-0 truncate text-highlighted">{{ row.value || "-" }}</dd>
              </div>
            </dl>
          </div>
        </template>
      </UCollapsible>

      <UCollapsible
        v-if="isConnectedSession && isLinuxSSHSession"
        v-model:open="metricsOpen"
        class="shrink-0 border-t border-default"
      >
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="h-9 cursor-pointer justify-start rounded-none px-3 text-xs font-semibold"
          :aria-label="t('RightPanel.MonitorInfo')"
        >
          <UIcon name="i-lucide-activity" class="size-3.5 shrink-0 text-primary" />
          <span>{{ t("RightPanel.MonitorInfo") }}</span>
          <div v-if="metrics" class="ml-auto flex min-w-0 items-center gap-1.5 text-[10px] font-normal text-muted">
            <UBadge v-if="metricsState?.cached" size="xs" color="neutral" variant="subtle">
              {{ t("RightPanel.MetricsCached") }}
            </UBadge>
            <span class="inline-flex shrink-0 items-center gap-1 font-ui-mono">
              <UIcon name="i-lucide-radio" class="size-3" />
              Koko {{ metricsState?.latencyMs == null ? "--" : `${metricsState.latencyMs} ms` }}
            </span>
          </div>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 shrink-0 transition-transform duration-150"
            :class="[metricsOpen ? 'rotate-90' : '', metrics ? '' : 'ml-auto']"
          />
        </UButton>

        <template #content>
          <div v-if="metrics" class="space-y-2 px-3 pb-3">
            <div class="grid grid-cols-2 gap-2 text-[10px] text-muted">
              <span class="truncate">{{ metrics.hostname }} · {{ metrics.kernel }}</span>
              <span class="text-right">
                {{ metrics.architecture }} · {{ metrics.cpuCores }} CPU · {{ formatUptime(metrics.uptimeSeconds) }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-lg border border-default bg-elevated/40 p-2">
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-muted">CPU</span>
                  <span class="font-ui-mono font-medium text-highlighted">{{ formatPercent(metrics.cpuPercent) }}</span>
                </div>
                <RightPanelMetricSparkline :primary="cpuHistory" :fixed-max="100" />
              </div>
              <div class="rounded-lg border border-default bg-elevated/40 p-2">
                <div class="flex items-center justify-between gap-1 text-[11px]">
                  <span class="text-muted">{{ t("RightPanel.MetricsMemory") }}</span>
                  <span class="font-ui-mono font-medium text-highlighted">
                    {{ formatPercent(metrics.memoryPercent) }}
                  </span>
                </div>
                <RightPanelMetricSparkline :primary="memoryHistory" :fixed-max="100" />
                <div class="truncate text-[9px] text-muted">
                  {{ formatBytes(metrics.memoryUsedBytes) }} / {{ formatBytes(metrics.memoryTotalBytes) }}
                </div>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated/40 p-2">
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="text-muted">
                  {{ t("RightPanel.MetricsDisk") }} · {{ formatPercent(metrics.diskPercent) }}
                </span>
                <span class="font-ui-mono text-[10px] text-highlighted">
                  R {{ formatRate(metrics.diskReadBytesPerSecond) }} · W
                  {{ formatRate(metrics.diskWriteBytesPerSecond) }}
                </span>
              </div>
              <RightPanelMetricSparkline :primary="diskReadHistory" :secondary="diskWriteHistory" />
            </div>

            <div class="rounded-lg border border-default bg-elevated/40 p-2">
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="text-muted">{{ t("RightPanel.MetricsNetwork") }}</span>
                <span class="font-ui-mono text-[10px] text-highlighted">
                  ↓ {{ formatRate(metrics.networkRxBytesPerSecond) }} · ↑
                  {{ formatRate(metrics.networkTxBytesPerSecond) }}
                </span>
              </div>
              <RightPanelMetricSparkline :primary="networkRXHistory" :secondary="networkTXHistory" />
            </div>
          </div>

          <div
            v-else-if="metricsState?.status === 'unavailable'"
            class="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-elevated p-2 text-[11px] text-muted"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
            <span>{{ metricsState.message || t("RightPanel.MetricsUnavailable") }}</span>
          </div>

          <div v-else class="flex items-center gap-2 px-3 pb-3 text-[11px] text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
            {{ t("RightPanel.MetricsLoading") }}
          </div>
        </template>
      </UCollapsible>

      <UCollapsible v-if="showShareSection" v-model:open="shareInfoOpen" class="shrink-0 border-t border-default">
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="h-9 cursor-pointer justify-start rounded-none px-3 text-xs font-semibold"
          :aria-label="t('RightPanel.ShareInfo')"
        >
          <UIcon name="i-lucide-share-2" class="size-3.5 shrink-0 text-primary" />
          <span>{{ t("RightPanel.ShareInfo") }}</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="ml-auto size-3.5 shrink-0 transition-transform duration-150"
            :class="shareInfoOpen ? 'rotate-90' : ''"
          />
        </UButton>

        <template #content>
          <div class="px-3 pb-3">
            <RightPanelSessionShareSection :disabled="!canShare" />
          </div>
        </template>
      </UCollapsible>

      <div
        v-else-if="!isConnectedSession"
        class="grid flex-1 place-items-center border-t border-default px-4 text-center"
      >
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
