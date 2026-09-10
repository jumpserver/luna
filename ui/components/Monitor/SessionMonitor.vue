<script setup lang="ts">
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { KokoConnectView } from "#koko";
import LionProvider from "~/components/lion/LionProvider.vue";
import { useSessionMonitor } from "~/composables/useSessionMonitor";
import LionMonitorView from "~/lion/views/MonitorView.vue";

const props = defineProps<{ sessionId: string; ticketId?: string; orgId?: string }>();
const { t } = useI18n();
const { session, sessionContext, component, endpointUrl, loading, error, supportedLock, toggling, togglePause } =
  useSessionMonitor(props.sessionId, props.ticketId, props.orgId);
provide(connectorSessionKey, sessionContext);

const details = computed(() => [
  [t("Common.User"), session.value?.user],
  [t("RightPanel.SessionAsset"), session.value?.asset],
  [t("Common.Account"), session.value?.account],
  [t("RightPanel.SessionProtocol"), session.value?.protocol]
]);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header
      class="flex min-h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-default px-3 py-2 text-xs"
    >
      <span class="font-medium">{{ t("RightPanel.MonitorInfo") }}</span>
      <template v-if="session">
        <span v-for="[label, value] in details" :key="label">
          <span class="text-muted">{{ label }}:</span>
          {{ value }}
        </span>
        <UButton
          v-if="supportedLock"
          size="xs"
          color="neutral"
          variant="soft"
          :icon="session.is_locked ? 'i-lucide-play' : 'i-lucide-pause'"
          :label="t(session.is_locked ? 'FileTransfer.Resume' : 'FileTransfer.Pause')"
          :loading="toggling"
          :disabled="loading || !!error || session.is_finished"
          @click="togglePause"
        />
      </template>
    </header>
    <div class="relative min-h-0 flex-1 overflow-hidden">
      <div v-if="loading" class="grid h-full place-items-center" role="status">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" :aria-label="t('Replay.Loading')" />
      </div>
      <div v-else-if="error" class="grid h-full place-items-center p-4 text-sm text-error" role="alert">
        {{ error }}
      </div>
      <LionProvider v-else-if="component === 'lion'">
        <LionMonitorView :session-id="sessionId" :endpoint-url="endpointUrl" :ticket="sessionContext?.ticket" />
      </LionProvider>
      <KokoConnectView v-else-if="component === 'koko' && sessionContext" />
      <iframe
        v-else-if="component === 'razor'"
        :src="`${endpointUrl}/razor/monitor/${encodeURIComponent(sessionId)}/`"
        :title="t('RightPanel.MonitorInfo')"
        class="h-full w-full border-0"
      />
    </div>
  </div>
</template>
