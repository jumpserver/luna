<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";

import KokoConnectView from "#koko/pages/ConnectView.vue";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: KokoWorkspaceTab }>();
const { t } = useI18n();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab, {
  disableAutoHash: "false"
});

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <BaseWorkspaceShell
    :ready="Boolean(context) && !loading && !error"
    :loading="loading"
    :error="error"
    :loading-text="t('koko.workspace.preparingConnection')"
  >
    <div class="relative h-full w-full min-h-0">
      <KokoConnectView />
    </div>
  </BaseWorkspaceShell>
</template>
