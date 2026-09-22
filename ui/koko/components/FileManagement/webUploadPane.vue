<script setup lang="ts">
import type { BrowserUploadSelection } from "#koko/composables/sftp/file-manager/transfer";
import { collectBrowserUploadSelection } from "#koko/composables/sftp/file-manager/transfer";

const emit = defineEmits<{ upload: [selection: BrowserUploadSelection] }>();
const { t } = useI18n();
const toast = useToast();

const dragging = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);

async function submit(files: FileList | null, dataTransferItems?: Iterable<DataTransferItem>, isFolderPick = false) {
  const selection = await collectBrowserUploadSelection(files || [], dataTransferItems);
  if (selection.items.length) emit("upload", selection);
  else if (isFolderPick && !selection.failures.length)
    toast.add({ title: t("koko.fileManagement.emptyFolderSelected"), color: "warning" });
  if (selection.failures.length) toast.add({ title: t("koko.fileManagement.operationFailed"), color: "warning" });
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  void submit(event.dataTransfer?.files || null, event.dataTransfer?.items);
}

function onInput(event: Event, isFolderPick = false) {
  const input = event.target as HTMLInputElement;
  void submit(input.files, undefined, isFolderPick);
  input.value = "";
}
</script>

<template>
  <div
    class="grid h-full min-h-0 place-items-center p-6"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div
      class="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-default bg-elevated/30'"
    >
      <UIcon name="i-lucide-cloud-upload" class="size-9 text-muted" />
      <div>
        <p class="text-sm font-medium">{{ t("koko.fileManagement.dropFiles") }}</p>
        <p class="mt-1 text-xs text-muted">{{ t("koko.fileManagement.dropFilesHint") }}</p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton size="sm" color="primary" variant="soft" icon="i-lucide-upload" @click="uploadInput?.click()">
          {{ t("koko.fileManagement.chooseFiles") }}
        </UButton>
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-folder-up" @click="folderInput?.click()">
          {{ t("koko.localFile.chooseFolder") }}
        </UButton>
      </div>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="onInput($event)" />
      <!-- ponytail: webkitdirectory can't report empty subdirectories the way the drag-and-drop
           webkitGetAsEntry/readEntries walk does, so an all-empty folder just yields zero items here.
           Upgrade path: switch to the File System Access API's showDirectoryPicker() once broadly supported. -->
      <input ref="folderInput" type="file" multiple webkitdirectory class="hidden" @change="onInput($event, true)" />
    </div>
  </div>
</template>
