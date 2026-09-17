<script setup lang="ts">
import { hasFolderBrowserUpload } from "#koko/composables/sftp/file-manager/transfer";

const emit = defineEmits<{ upload: [files: File[]] }>();
const { t } = useI18n();
const toast = useToast();

const dragging = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);

function submit(files: FileList | null, dataTransferItems?: Iterable<DataTransferItem>) {
  const items = files ? Array.from(files) : [];
  if (hasFolderBrowserUpload(items, dataTransferItems)) {
    toast.add({ title: t("koko.fileManagement.folderTransferUnsupported"), color: "warning" });
    return;
  }
  if (items.length) emit("upload", items);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  submit(event.dataTransfer?.files || null, event.dataTransfer?.items);
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  submit(input.files);
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
      <UButton size="sm" color="primary" variant="soft" icon="i-lucide-upload" @click="uploadInput?.click()">
        {{ t("koko.fileManagement.chooseFiles") }}
      </UButton>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="onInput" />
    </div>
  </div>
</template>
