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
</script>

<template>
  <div
    v-if="selectedCount"
    class="sftp-selection-bar"
    role="toolbar"
    :aria-label="t('koko.fileManagement.selectedItems', selectedCount)"
  >
    <div class="sftp-selection-bar__info">
      <span class="sftp-selection-bar__count">
        {{ t("koko.fileManagement.selectedPrefix") }}
        <b>{{ selectedCount }}</b>
        {{ t("koko.fileManagement.selectedSuffix") }}
      </span>
    </div>
    <div class="sftp-selection-bar__actions">
      <UButton
        v-if="canSend && transferableCount"
        class="sftp-selection-bar__btn"
        color="primary"
        variant="ghost"
        size="xs"
        :icon="sendIcon"
        :label="isPeerSend ? t('koko.fileManagement.sendToOpposite') : t('koko.fileManagement.sendTo')"
        @click="emit('send')"
      />
      <UButton
        v-if="canDownload"
        class="sftp-selection-bar__btn"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-download"
        :label="t('koko.actions.download')"
        @click="emit('download')"
      />
      <UButton
        class="sftp-selection-bar__btn"
        color="error"
        variant="ghost"
        size="xs"
        icon="i-lucide-trash-2"
        :label="t('koko.actions.delete')"
        @click="emit('remove')"
      />
      <UButton
        class="sftp-selection-bar__btn"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-x"
        :label="t('koko.fileManagement.clearSelection')"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
