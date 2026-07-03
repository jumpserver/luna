<script setup lang="ts">
import KokoSearchInput from "~/koko/components/SearchInput/index.vue";
import { useKokoTerminalEvents } from "~/koko/composables/useTerminalEvents";
import { useKokoTerminalSocket } from "~/koko/composables/useTerminalSocket";
import { useKokoZmodem } from "~/koko/composables/useZmodem";

const showSearchInput = ref(false);
const { onMittEvent } = useKokoTerminalEvents();
const { containerRef, searchAddon } = useKokoTerminalSocket();
const { uploadOpen, fileInfo, confirmUpload, cancelUpload } = useKokoZmodem();

onMittEvent("open-search", () => {
  showSearchInput.value = true;
});

const onUploadChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  fileInfo.value = input.files?.[0] || null;
};
</script>

<template>
  <KokoSearchInput v-if="showSearchInput" :search-addon="searchAddon" @close="showSearchInput = false" />

  <UModal v-model:open="uploadOpen" :title="$t('UploadTitle') || 'Upload file'" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <label class="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-sm">
        <UIcon name="i-lucide-upload" class="size-8" />
        <span>{{ $t('UploadTips') || 'Select a file to upload' }}</span>
        <input type="file" class="hidden" @change="onUploadChange">
      </label>
      <div v-if="fileInfo" class="mt-2 text-xs text-muted">
        {{ fileInfo.name }}
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="cancelUpload">
        {{ $t('Cancel') || 'Cancel' }}
      </UButton>
      <UButton color="primary" @click="confirmUpload">
        {{ $t('Upload') || 'Upload' }}
      </UButton>
    </template>
  </UModal>

  <div id="terminal-container" ref="containerRef" class="h-full w-full min-h-0" />
</template>

<style scoped>
#terminal-container :deep(.terminal) {
  height: 100%;
  padding: 10px 0 5px 10px;
}

#terminal-container :deep(.xterm-viewport)::-webkit-scrollbar {
  height: 4px;
  width: 7px;
}

#terminal-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.35);
  border-radius: 3px;
}
</style>
