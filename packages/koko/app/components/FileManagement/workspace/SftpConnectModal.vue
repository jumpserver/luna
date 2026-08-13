<script setup lang="ts">
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";

type WorkspaceController = ReturnType<typeof useSftpWorkspacePanes>;

const props = defineProps<{ workspace: WorkspaceController }>();
const { t } = useI18n();
const {
  assetTree,
  connectModalOpen,
  connectRemoteAsset,
  organizationSelector,
  recentConnections,
  reconnectRecent,
  remoteAssetSearch,
  remoteConnecting
} = props.workspace;
</script>

<template>
  <UModal
    v-model:open="connectModalOpen"
    :title="t('koko.fileManagement.connectRemoteSftp')"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3 px-2.5 py-1 text-[11px] text-muted">
          <span>{{ t("koko.fileManagement.currentOrganization") }}</span>
          <div class="min-w-0 max-w-55 flex-1">
            <component :is="organizationSelector" class="justify-end" />
          </div>
        </div>
        <UInput
          v-model="remoteAssetSearch"
          icon="i-lucide-search"
          :placeholder="t('koko.fileManagement.searchAssets')"
        />
        <div v-if="recentConnections.length" class="space-y-1.5">
          <p class="px-0.5 text-[11px] text-muted">{{ t("koko.fileManagement.recentConnections") }}</p>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="item in recentConnections"
              :key="`recent-${item.assetId}`"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-history"
              :label="item.assetName"
              :loading="remoteConnecting"
              @click="reconnectRecent(item)"
            />
          </div>
        </div>
        <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
          <component :is="assetTree" :search="remoteAssetSearch" open @select="connectRemoteAsset" />
        </div>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" :label="t('koko.actions.cancel')" @click="connectModalOpen = false" />
    </template>
  </UModal>
</template>
