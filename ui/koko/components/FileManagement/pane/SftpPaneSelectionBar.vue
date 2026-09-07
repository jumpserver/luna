<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    selectedCount: number;
    transferableCount: number;
    canSend?: boolean;
    canDownload?: boolean;
    sendPeerDirection?: "left" | "right";
  }>(),
  {
    canSend: false,
    canDownload: false
  }
);

const emit = defineEmits<{
  send: [];
  download: [];
  remove: [];
  clear: [];
}>();

const { t } = useI18n();

const isPeerSend = computed(() => props.sendPeerDirection === "left" || props.sendPeerDirection === "right");
const sendIcon = computed(() => {
  if (props.sendPeerDirection === "right") return "i-lucide-arrow-right";
  if (props.sendPeerDirection === "left") return "i-lucide-arrow-left";
  return "i-lucide-forward";
});
const sendLabel = computed(() =>
  isPeerSend.value ? t("koko.fileManagement.sendToOpposite") : t("koko.fileManagement.sendTo")
);
</script>

<template>
  <div
    v-if="selectedCount"
    class="sftp-status-actions flex min-w-0 shrink-0 items-center gap-0.5"
    role="toolbar"
    :aria-label="t('koko.fileManagement.selectedItems', selectedCount)"
  >
    <UButton
      v-if="canSend && transferableCount"
      color="primary"
      variant="ghost"
      size="xs"
      :icon="sendIcon"
      :label="sendLabel"
      :title="sendLabel"
      :aria-label="sendLabel"
      @click="emit('send')"
    />
    <UButton
      v-if="canDownload"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-download"
      :label="t('koko.actions.download')"
      :title="t('koko.actions.download')"
      :aria-label="t('koko.actions.download')"
      @click="emit('download')"
    />
    <UButton
      color="error"
      variant="ghost"
      size="xs"
      icon="i-lucide-trash-2"
      :label="t('koko.actions.delete')"
      :title="t('koko.actions.delete')"
      :aria-label="t('koko.actions.delete')"
      @click="emit('remove')"
    />
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-x"
      :label="t('koko.fileManagement.clearSelection')"
      :title="t('koko.fileManagement.clearSelection')"
      :aria-label="t('koko.fileManagement.clearSelection')"
      @click="emit('clear')"
    />
  </div>
</template>
