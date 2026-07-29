<script setup lang="ts">
import KokoSearchInput from "#koko/components/SearchInput/index.vue";
import { TerminalMittEvent } from "#koko/composables/terminal/protocol";
import { useKokoTerminalEvents } from "#koko/composables/terminal/useTerminalEvents";
import { useKokoTerminalSocket } from "#koko/composables/terminal/useTerminalSocket";

const showSearchInput = ref(false);
const { onMittEvent } = useKokoTerminalEvents();
const { containerRef, searchAddon, zmodem } = useKokoTerminalSocket();
const { uploadOpen, fileInfo, confirmUpload, cancelUpload } = zmodem;

onMittEvent(TerminalMittEvent.OpenSearch, () => {
  showSearchInput.value = true;
});

const onUploadChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  fileInfo.value = input.files?.[0] || null;
};
</script>

<template>
  <KokoSearchInput v-if="showSearchInput && searchAddon" :search-addon="searchAddon" @close="showSearchInput = false" />

  <UModal v-model:open="uploadOpen" :title="$t('koko.terminal.uploadTitle')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <label class="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-sm">
        <UIcon name="i-lucide-upload" class="size-8" />
        <span>{{ $t("koko.terminal.uploadTips") }}</span>
        <input type="file" class="hidden" @change="onUploadChange" />
      </label>
      <div v-if="fileInfo" class="mt-2 text-xs text-muted">
        {{ fileInfo.name }}
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="cancelUpload">
        {{ $t("koko.actions.cancel") }}
      </UButton>
      <UButton color="primary" @click="confirmUpload">
        {{ $t("koko.actions.upload") }}
      </UButton>
    </template>
  </UModal>

  <div id="terminal-container" ref="containerRef" class="h-full w-full min-h-0" />
</template>

<style scoped>
/* 背景与 xterm 主题背景同源（--app-main-bg），padding 区域无色差 */
#terminal-container {
  background: var(--app-main-bg);
}

#terminal-container :deep(.terminal) {
  height: 100%;
  padding: 12px 4px 8px 12px;
}

/* 主题切换瞬间由容器背景兜底，避免闪色块；滚动条不覆盖，走 main.css 全局窄样式 */
#terminal-container :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
