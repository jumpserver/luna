<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";

import KokoFileManagement from "#koko/components/Drawer/FileManagement/index.vue";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: KokoWorkspaceTab }>();
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
    loading-text="正在准备 SFTP 文件管理..."
  >
    <KokoFileManagement :sftp-token="tokenId" class="h-full" />
  </BaseWorkspaceShell>
</template>
