<script setup lang="ts">
import prettyBytes from "pretty-bytes";

const props = withDefaults(
  defineProps<{
    selectedCount: number;
    transferableCount: number;
    selectedBytes: number;
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
  return "i-lucide-send";
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
      <span v-if="transferableCount" class="sftp-selection-bar__size">
        {{ t("koko.fileManagement.selectedSizeTotal", { size: prettyBytes(selectedBytes) }) }}
      </span>
    </div>
    <div class="sftp-selection-bar__actions">
      <button
        v-if="canSend && transferableCount"
        type="button"
        class="sftp-selection-bar__btn sftp-selection-bar__btn--primary"
        @click="emit('send')"
      >
        <UIcon :name="sendIcon" class="size-3.5" />
        {{ isPeerSend ? t("koko.fileManagement.sendToOpposite") : t("koko.fileManagement.sendTo") }}
      </button>
      <button v-if="canDownload" type="button" class="sftp-selection-bar__btn" @click="emit('download')">
        <UIcon name="i-lucide-download" class="size-3.5" />
        {{ t("koko.actions.download") }}
      </button>
      <button type="button" class="sftp-selection-bar__btn sftp-selection-bar__btn--danger" @click="emit('remove')">
        <UIcon name="i-lucide-trash-2" class="size-3.5" />
        {{ t("koko.actions.delete") }}
      </button>
      <button type="button" class="sftp-selection-bar__btn sftp-selection-bar__btn--ghost" @click="emit('clear')">
        <UIcon name="i-lucide-x" class="size-3.5" />
        {{ t("koko.fileManagement.clearSelection") }}
      </button>
    </div>
  </div>
</template>
