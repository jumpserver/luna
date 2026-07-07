<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import KokoConnectView from "~/koko/pages/ConnectView.vue";
import BaseWorkspaceShell from "~/koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "~/koko/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab, {
  disableAutoHash: "false"
});

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <BaseWorkspaceShell :ready="Boolean(context) && !loading && !error" :loading="loading" :error="error" loading-text="正在准备 Koko 连接...">
    <div class="relative h-full w-full min-h-0">
      <KokoConnectView />
    </div>
  </BaseWorkspaceShell>
</template>
