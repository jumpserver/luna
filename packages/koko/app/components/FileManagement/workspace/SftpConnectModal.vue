<script setup lang="ts">
import type { useSftpWorkspacePanes } from "#koko/composables/sftp/file-manager/useSftpWorkspacePanes";

type WorkspaceController = ReturnType<typeof useSftpWorkspacePanes>;

const props = defineProps<{ workspace: WorkspaceController }>();
const { t } = useI18n();
const {
  assetTree,
  connectModalOpen,
  connectRemoteAsset,
  openRemoteInCurrentTab,
  organizationSelector,
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
        <div class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2">
          <component :is="organizationSelector" class="min-w-0" />
          <UInput
            v-model="remoteAssetSearch"
            class="min-w-0"
            icon="i-lucide-search"
            :placeholder="t('koko.fileManagement.searchAssets')"
          />
        </div>
        <UCheckbox
          v-model="openRemoteInCurrentTab"
          :label="t('koko.fileManagement.openInCurrentTab')"
          :disabled="remoteConnecting"
        />
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
