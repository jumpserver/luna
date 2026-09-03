<script setup lang="ts">
import type { FileTransferConflictPolicy, FileTransferTask } from "@jumpserver/connectors-core";
import type { DropdownMenuItem } from "@nuxt/ui";
import { canRetryTransferTask } from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";

const props = defineProps<{
  task: FileTransferTask;
  canPause: boolean;
  canResume: boolean;
}>();

const emit = defineEmits<{
  pause: [];
  resume: [];
  retry: [];
  cancel: [];
  clear: [];
  resolve: [policy: Exclude<FileTransferConflictPolicy, "ask">];
}>();

const { t } = useI18n();
const terminalStatuses = new Set(["completed", "skipped", "failed", "canceled"]);
const actionButtonUi = { leadingIcon: "size-3" };
const hasConflict = computed(() => props.task.status === "paused" && props.task.error === "target_exists");
const canRetry = computed(() => canRetryTransferTask(props.task));
const conflictItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: t("koko.sftpTransferCenter.overwrite"), onSelect: () => emit("resolve", "overwrite") },
    { label: t("koko.sftpTransferCenter.skip"), onSelect: () => emit("resolve", "skip") },
    { label: t("koko.sftpTransferCenter.keepBoth"), onSelect: () => emit("resolve", "keep_both") }
  ]
]);
</script>

<template>
  <div class="sftp-transfer-actions">
    <UDropdownMenu v-if="hasConflict" :items="conflictItems" :content="{ align: 'end', side: 'top' }">
      <UButton
        class="size-6 justify-center p-0"
        color="warning"
        variant="ghost"
        size="xs"
        icon="i-lucide-triangle-alert"
        :ui="actionButtonUi"
        :title="t('FileTransfer.ConflictTitle')"
        :aria-label="t('FileTransfer.ConflictTitle')"
      />
    </UDropdownMenu>
    <UButton
      v-if="canPause"
      class="size-6 justify-center p-0"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-pause"
      :ui="actionButtonUi"
      :title="t('FileTransfer.Pause')"
      :aria-label="t('FileTransfer.Pause')"
      @click="emit('pause')"
    />
    <UButton
      v-if="canRetry"
      class="size-6 justify-center p-0"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-rotate-ccw"
      :ui="actionButtonUi"
      :title="t('koko.sftpTransferCenter.retryFile')"
      :aria-label="t('koko.sftpTransferCenter.retryFile')"
      @click="emit('retry')"
    />
    <UButton
      v-if="canResume"
      class="size-6 justify-center p-0"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-play"
      :ui="actionButtonUi"
      :title="t('FileTransfer.Resume')"
      :aria-label="t('FileTransfer.Resume')"
      @click="emit('resume')"
    />
    <UButton
      v-if="!terminalStatuses.has(task.status)"
      class="size-6 justify-center p-0"
      color="error"
      variant="ghost"
      size="xs"
      icon="i-lucide-x"
      :ui="actionButtonUi"
      :title="t('FileTransfer.Cancel')"
      :aria-label="t('FileTransfer.Cancel')"
      @click="emit('cancel')"
    />
    <UButton
      v-else
      class="size-6 justify-center p-0"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-trash-2"
      :ui="actionButtonUi"
      :title="t('FileTransfer.ClearFinished')"
      :aria-label="t('FileTransfer.ClearFinished')"
      @click="emit('clear')"
    />
  </div>
</template>
