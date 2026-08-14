<script setup lang="ts">
import prettyBytes from "pretty-bytes";

withDefaults(
  defineProps<{
    selectedCount: number;
    transferableCount: number;
    selectedBytes: number;
    canSend?: boolean;
    canDownload?: boolean;
    remoteStyle?: boolean;
  }>(),
  {
    canSend: false,
    canDownload: false,
    remoteStyle: false
  }
);

const emit = defineEmits<{
  send: [];
  download: [];
  remove: [];
  clear: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="selectedCount"
    class="absolute inset-x-2 bottom-8 z-20 flex items-center gap-2 rounded-md border px-3 shadow-lg"
    :class="
      remoteStyle
        ? 'sftp-selection-bar border-(--app-border-strong) bg-(--app-header-bg)'
        : 'border-default bg-elevated py-1.5'
    "
  >
    <span class="shrink-0 text-xs font-medium">
      {{ t("koko.fileManagement.selectedItems", selectedCount) }}
    </span>
    <span v-if="transferableCount" class="font-ui-mono text-[11px] text-muted">
      {{ prettyBytes(selectedBytes) }}
    </span>
    <div class="flex-1" />
    <UButton
      v-if="canSend && transferableCount"
      size="xs"
      color="primary"
      icon="i-lucide-send"
      :label="t('koko.fileManagement.sendTo')"
      @click="emit('send')"
    />
    <UButton
      v-if="canDownload"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-download"
      :title="t('koko.actions.download')"
      @click="emit('download')"
    />
    <UButton
      size="xs"
      color="error"
      variant="ghost"
      icon="i-lucide-trash-2"
      :title="t('koko.actions.delete')"
      @click="emit('remove')"
    />
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      :title="t('koko.fileManagement.clearSelection')"
      @click="emit('clear')"
    />
  </div>
</template>
