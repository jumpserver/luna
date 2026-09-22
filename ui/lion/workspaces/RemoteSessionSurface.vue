<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { KokoBaseWorkspaceShell as BaseWorkspaceShell } from "#koko";
import ConnectView from "@/lion/views/ConnectView.vue";
import { useBaseWorkspaceSession } from "@/lion/workspaces/useBaseWorkspaceSession";
import LionProvider from "~/components/lion/LionProvider.vue";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { t } = useI18n();
const tab = toRef(props, "tab");
const { context, error, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionConnected, markSessionDisconnected } = useWorkspaceTabs();

function handleConnected() {
  markSessionConnected(props.tab.id);
}

function handleDisconnected(message: string) {
  markSessionDisconnected(props.tab.id, message);
}

watch(tokenId, () => void prepareSession(), { immediate: true });
</script>

<template>
  <LionProvider>
    <BaseWorkspaceShell
      :ready="Boolean(context) && !loading && !error"
      :loading="loading"
      :error="error"
      :loading-text="t('koko.workspace.preparingRemoteDesktop')"
    >
      <div class="relative h-full w-full min-h-0">
        <ConnectView :tab-id="tab.id" @connected="handleConnected" @disconnected="handleDisconnected" />
      </div>
    </BaseWorkspaceShell>
  </LionProvider>
</template>
