<script setup lang="ts">
import type { FileTransferTask } from "@jumpserver/connectors-core";
import prettyBytes from "pretty-bytes";

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
}>();

const { t } = useI18n();
const terminalStatuses = new Set(["completed", "skipped", "failed", "canceled"]);
const fileActionButtonUi = { leadingIcon: "size-3" };
const progress = computed(() => {
  if (props.task.status === "completed" || props.task.status === "skipped") return 100;
  if (!props.task.source.size) return 0;
  return Math.min(100, Math.round((props.task.confirmedBytes / props.task.source.size) * 100));
});
</script>

<template>
  <div class="sftp-transfer-file">
    <div class="sftp-transfer-file__name">
      <UIcon
        :name="
          task.status === 'completed'
            ? 'i-lucide-check'
            : task.status === 'failed'
              ? 'i-lucide-x-circle'
              : 'i-lucide-file'
        "
        class="size-3 shrink-0 text-tertiary"
      />
      <span class="truncate">{{ task.source.name }}</span>
    </div>
    <span class="sftp-transfer-file__status">
      {{ prettyBytes(task.source.size) }} ·
      <template v-if="task.status === 'transferring'">{{ progress }}%</template>
      <template v-else>{{ t(`FileTransfer.Status.${task.status}`) }}</template>
    </span>
    <div class="sftp-transfer-file__actions">
      <UButton
        v-if="canPause"
        class="size-5.5 justify-center p-0"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-pause"
        :ui="fileActionButtonUi"
        :title="t('FileTransfer.Pause')"
        @click="void emit('pause')"
      />
      <UButton
        v-if="task.status === 'failed'"
        class="size-5.5 justify-center p-0"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-rotate-ccw"
        :ui="fileActionButtonUi"
        :title="t('koko.sftpTransferCenter.retryFile')"
        @click="void emit('retry')"
      />
      <UButton
        v-if="canResume"
        class="size-5.5 justify-center p-0"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-play"
        :ui="fileActionButtonUi"
        :title="t('FileTransfer.Resume')"
        @click="void emit('resume')"
      />
      <UButton
        v-if="!terminalStatuses.has(task.status)"
        class="size-5.5 justify-center p-0"
        color="error"
        variant="ghost"
        size="xs"
        icon="i-lucide-x"
        :ui="fileActionButtonUi"
        :title="t('FileTransfer.Cancel')"
        @click="void emit('cancel')"
      />
    </div>
    <div class="sftp-transfer-file__progress">
      <div
        class="sftp-file-progress-bar"
        role="progressbar"
        :aria-label="t('koko.sftpTransferCenter.fileProgress', { file: task.source.name })"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
      >
        <i :class="task.status" :style="{ width: `${progress}%` }"></i>
      </div>
    </div>
  </div>
</template>
