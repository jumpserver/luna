<script setup lang="ts">
import type { SftpCapabilities } from "#koko/composables/sftp/protocol";
import type { KokoWorkspaceTab } from "#koko/host";

import KokoFileManagement from "#koko/components/FileManagement/index.vue";
import { useKokoHostAdapter } from "#koko/host";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = withDefaults(
  defineProps<{
    tab: KokoWorkspaceTab;
    /** Right-panel / sidebar embedding: single-pane file browser without dual-remote chrome. */
    compact?: boolean;
    /** Workspace pane id to guard when this SFTP surface has active transfers. */
    closeGuardSessionId?: string;
    /** Stable owner used by the shared AI panel to resolve the selected SFTP target. */
    aiOwnerId?: string;
  }>(),
  { compact: false }
);
const emit = defineEmits<{
  capabilities: [capabilities: SftpCapabilities | null];
}>();
const { t } = useI18n();
const host = useKokoHostAdapter();
const tab = toRef(props, "tab");
function handleConnectionChange(connected: boolean) {
  if (!connected) return;
  host.markSessionConnected(tab.value.id);
}

function handleConnectionFailure(reason: string, dismissible: boolean) {
  host.markSessionDisconnected(tab.value.id, reason, { dismissible });
}
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab, {
  protocol: "sftp"
});

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <BaseWorkspaceShell
    :ready="Boolean(context)"
    :loading="loading"
    :error="error"
    :loading-text="t('koko.workspace.preparingSftp')"
  >
    <KokoFileManagement
      :sftp-token="tokenId"
      :compact="compact"
      :close-guard-session-id="closeGuardSessionId || (compact ? undefined : tab.id)"
      :ai-owner-id="aiOwnerId || tab.id"
      :source-asset="{ id: tab.assetId, name: tab.assetName || tab.assetId, account: tab.account }"
      class="h-full"
      @capabilities="emit('capabilities', $event)"
      @connection-change="handleConnectionChange"
      @connection-failure="handleConnectionFailure"
    />
  </BaseWorkspaceShell>
</template>
