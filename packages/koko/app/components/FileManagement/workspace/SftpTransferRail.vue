<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    canTransferRight?: boolean;
    canTransferLeft?: boolean;
    transferring?: boolean;
    /** Session dual SFTP uses "to opposite"; global uses remote/local wording. */
    mode?: "session" | "global";
  }>(),
  {
    canTransferRight: false,
    canTransferLeft: false,
    transferring: false,
    mode: "session"
  }
);

const emit = defineEmits<{
  transfer: [direction: "left-to-right" | "right-to-left"];
}>();

const { t } = useI18n();

const rightTooltip = computed(() =>
  props.mode === "global" ? t("koko.fileManagement.transferToRemote") : t("koko.fileManagement.sendToOpposite")
);
const leftTooltip = computed(() =>
  props.mode === "global" ? t("koko.fileManagement.transferToLocal") : t("koko.fileManagement.sendToOpposite")
);
</script>

<template>
  <div
    class="sftp-transfer-rail flex w-11 shrink-0 flex-col items-center justify-center gap-2 border-x border-default bg-[var(--workspace-surface-main)]"
    role="toolbar"
    :aria-label="t('koko.fileManagement.sendTo')"
  >
    <UTooltip :text="rightTooltip">
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-arrow-right"
        :disabled="!canTransferRight || transferring"
        :loading="transferring"
        :aria-label="rightTooltip"
        @click="emit('transfer', 'left-to-right')"
      />
    </UTooltip>
    <UTooltip :text="leftTooltip">
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-arrow-left"
        :disabled="!canTransferLeft || transferring"
        :loading="transferring"
        :aria-label="leftTooltip"
        @click="emit('transfer', 'right-to-left')"
      />
    </UTooltip>
  </div>
</template>
