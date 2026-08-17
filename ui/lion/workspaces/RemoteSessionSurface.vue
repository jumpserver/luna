<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { KokoBaseWorkspaceShell as BaseWorkspaceShell } from "@jumpserver/koko";
import ConnectView from "@/lion/views/ConnectView.vue";
import { useBaseWorkspaceSession } from "@/lion/workspaces/useBaseWorkspaceSession";
import LionProvider from "~/components/lion/LionProvider.vue";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();
const { t } = useI18n();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionFailed } = useWorkspaceTabs();
const disconnectedError = ref("");
const workspaceError = computed(() => error.value || disconnectedError.value);

function handleDisconnected(message: string) {
  disconnectedError.value = message;
  markSessionFailed({
    tabId: props.tab.id,
    assetId: props.tab.assetId,
    protocol: props.tab.protocol,
    account: props.tab.account
  });
}

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <LionProvider>
    <BaseWorkspaceShell
      :ready="Boolean(context) && !loading && !workspaceError"
      :loading="loading"
      :error="workspaceError"
      loading-text="正在准备远程桌面连接..."
      :retry-label="t('Reconnect')"
      @retry="emit('reconnect')"
    >
      <div class="relative h-full w-full min-h-0">
        <ConnectView :tab-id="tab.id" @disconnected="handleDisconnected" />
      </div>
    </BaseWorkspaceShell>
  </LionProvider>
</template>
