<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";

import KokoFileManagement from "#koko/components/FileManagement/index.vue";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = withDefaults(
  defineProps<{
    tab: KokoWorkspaceTab;
    /** Right-panel / sidebar embedding: single-pane file browser without dual-remote chrome. */
    compact?: boolean;
  }>(),
  { compact: false }
);
const { t } = useI18n();
const tab = toRef(props, "tab");
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
    <KokoFileManagement :sftp-token="tokenId" :compact="compact" class="h-full" />
  </BaseWorkspaceShell>
</template>
