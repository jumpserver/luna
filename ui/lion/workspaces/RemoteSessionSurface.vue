<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { KokoBaseWorkspaceShell as BaseWorkspaceShell } from "@jumpserver/koko";
import ConnectView from "@/lion/views/ConnectView.vue";
import { useBaseWorkspaceSession } from "@/lion/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <BaseWorkspaceShell
    :ready="Boolean(context) && !loading && !error"
    :loading="loading"
    :error="error"
    loading-text="正在准备远程桌面连接..."
  >
    <div class="relative h-full w-full min-h-0">
      <ConnectView />
    </div>
  </BaseWorkspaceShell>
</template>
