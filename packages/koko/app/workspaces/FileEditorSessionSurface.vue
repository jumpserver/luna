<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";

import { useKokoHostAdapter } from "@jumpserver/koko/host";
import KokoSftpIde from "#koko/components/SftpIde/index.vue";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";

const props = defineProps<{ tab: KokoWorkspaceTab }>();
const { t } = useI18n();
const tab = toRef(props, "tab");
const editor = ref<{ requestClose: () => Promise<boolean> } | null>(null);
const host = useKokoHostAdapter();
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab, {
  protocol: "sftp"
});
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
    <KokoSftpIde ref="editor" :sftp-token="tokenId" class="h-full" />
  </BaseWorkspaceShell>
</template>
