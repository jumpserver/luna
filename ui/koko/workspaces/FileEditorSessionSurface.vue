<script setup lang="ts">
import type { KokoWorkspaceTab } from "#koko/host";

import KokoSftpIde from "#koko/components/SftpIde/index.vue";
import { useKokoHostAdapter } from "#koko/host";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: KokoWorkspaceTab }>();
const { t } = useI18n();
const tab = toRef(props, "tab");
const editor = ref<{ requestClose: () => Promise<boolean> } | null>(null);
const host = useKokoHostAdapter();
let sessionReady = false;

function handleConnectionChange(connected: boolean) {
  if (!connected) return;
  sessionReady = true;
  host.markSessionConnected(tab.value.id);
}

function handleConnectionFailure(reason: string) {
  if (sessionReady) host.markSessionDisconnected(tab.value.id, reason);
  else {
    host.markSessionFailed(
      { id: tab.value.id, assetId: tab.value.assetId, protocol: tab.value.protocol, account: tab.value.account },
      reason
    );
  }
}

const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab, {
  protocol: "sftp"
});
const editorScopeKey = computed(
  () => `${host.getWindowOrigin()}\u0000${props.tab.assetId}\u0000${props.tab.account || ""}`
);
let unregisterCloseGuard: (() => void) | undefined;

watch(tokenId, () => void prepareSession(), { immediate: true });
watch(
  () => props.tab.id,
  (sessionId) => {
    unregisterCloseGuard?.();
    unregisterCloseGuard = host.registerSessionCloseGuard?.(
      sessionId,
      () => editor.value?.requestClose() ?? Promise.resolve(true)
    );
  },
  { immediate: true }
);
onBeforeUnmount(() => unregisterCloseGuard?.());
</script>

<template>
  <BaseWorkspaceShell
    :ready="Boolean(context)"
    :loading="loading"
    :error="error"
    :loading-text="t('koko.workspace.preparingFileEditor')"
  >
    <KokoSftpIde
      ref="editor"
      :sftp-token="tokenId"
      :workspace-key="editorScopeKey"
      @connection-change="handleConnectionChange"
      @connection-failure="handleConnectionFailure"
    />
  </BaseWorkspaceShell>
</template>
