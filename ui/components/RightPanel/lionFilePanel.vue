<script setup lang="ts">
import FileManager from "@/lion/components/FileManager.vue";
import { getLionWorkspaceSession } from "@/lion/workspaces/useLionWorkspaceSessionRegistry";

const { t } = useI18n();
const { activePaneId, activeTab } = useWorkspaceTabs();
const activeSessionId = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value)?.id || tab?.id || "";
});
const controller = computed(() => getLionWorkspaceSession(activeSessionId.value));
</script>

<template>
  <div v-if="controller?.driverName.value" class="h-full min-h-0 overflow-hidden p-2">
    <FileManager
      compact
      class="h-full"
      :loading="controller.fileSystemLoading.value"
      :files="controller.currentFolderFiles.value"
      :name="controller.driverName.value"
      :folder="controller.currentFolder.value"
      :display-uploading-files="controller.displayUploadingFiles.value"
      :download-disabled="controller.actionPermission.value?.enable_download !== true"
      :upload-disabled="controller.actionPermission.value?.enable_upload !== true"
      @open-folder="controller.openFolder"
      @download-file="controller.downloadFile"
      @upload-file="controller.uploadFile"
      @remove-upload-file="controller.removeUploadFile"
    />
  </div>

  <div v-else class="grid h-full place-items-center px-4 text-center">
    <UEmpty
      icon="i-lucide-folder-x"
      size="sm"
      variant="naked"
      :title="t('RightPanel.LionFilesUnavailableTitle')"
      :description="t('RightPanel.LionFilesUnavailableDescription')"
    />
  </div>
</template>
