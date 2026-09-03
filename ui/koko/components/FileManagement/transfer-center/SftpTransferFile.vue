<script setup lang="ts">
import type { FileTransferConflictPolicy, FileTransferTask } from "@jumpserver/connectors-core";
import type { TransferRateSample } from "#koko/utils/file-transfer/rate";
import prettyBytes from "pretty-bytes";
import SftpTransferActions from "#koko/components/FileManagement/transfer-center/SftpTransferActions.vue";
import { sftpTransferErrorText } from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import {
  bytesPerSecond,
  formatBytesPerSecond,
  formatRemaining,
  pushTransferRateSample,
  remainingSeconds
} from "#koko/utils/file-transfer/rate";
import { sftpTransferProgressColor, sftpTransferStatusClass } from "#koko/utils/sftpTransferSummary";

const props = defineProps<{
  task: FileTransferTask;
  canPause: boolean;
  canResume: boolean;
  tableRow?: boolean;
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
const samples = ref<TransferRateSample[]>([]);
const hasConflict = computed(() => props.task.status === "paused" && props.task.error === "target_exists");
const progress = computed(() => {
  if (props.task.status === "completed" || props.task.status === "skipped") return 100;
  if (!props.task.source.size) return 0;
  return Math.min(100, Math.round((props.task.confirmedBytes / props.task.source.size) * 100));
});
const direction = computed(() => `${props.task.sourceEndpoint.label} → ${props.task.destinationEndpoint.label}`);
const statusText = computed(() => {
  if (props.task.status === "transferring") {
    return `${t("FileTransfer.Status.transferring")} ${progress.value}%`;
  }
  if (props.task.status === "failed" && props.task.error) return sftpTransferErrorText(props.task.error, t);
  return t(`FileTransfer.Status.${props.task.status}`);
});
const rateText = computed(() => {
  if (props.task.status === "completed" || props.task.status === "skipped") {
    return t("koko.sftpTransferCenter.justNow");
  }
  if (props.task.status === "failed") {
    return t("FileTransfer.TransferredSize", { size: prettyBytes(props.task.confirmedBytes) });
  }
  if (props.task.status !== "transferring") return t("FileTransfer.IdleRate");
  const rate = bytesPerSecond(samples.value);
  const remaining = remainingSeconds(props.task.source.size, props.task.confirmedBytes, rate);
  if (rate == null || remaining == null) return t("FileTransfer.IdleRate");
  return t("FileTransfer.SpeedRemaining", {
    speed: formatBytesPerSecond(rate),
    remaining: formatRemaining(remaining)
  });
});

watch(
  () => [props.task.status, props.task.confirmedBytes] as const,
  ([status, bytes]) => {
    if (status !== "transferring") {
      samples.value = [];
      return;
    }
    samples.value = pushTransferRateSample(samples.value, bytes);
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="sftp-transfer-file"
    :class="{
      'is-error': task.status === 'failed',
      'is-conflict': hasConflict,
      'is-table-row': tableRow
    }"
    :role="tableRow ? 'row' : undefined"
  >
    <div class="sftp-transfer-file__name" :role="tableRow ? 'cell' : undefined">
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
    <span class="sftp-transfer-file__direction truncate" :title="direction" :role="tableRow ? 'cell' : undefined">
      {{ direction }}
    </span>
    <div class="sftp-transfer-file__track" :role="tableRow ? 'cell' : undefined">
      <UProgress
        class="sftp-file-progress-bar"
        :color="sftpTransferProgressColor(task)"
        size="xs"
        :model-value="progress"
        :ui="{ base: 'h-[3px]' }"
        :aria-label="t('koko.sftpTransferCenter.fileProgress', { file: task.source.name })"
      />
    </div>
    <span class="sftp-transfer-file__rate truncate" :title="rateText" :role="tableRow ? 'cell' : undefined">
      {{ rateText }}
    </span>
    <span
      class="sftp-transfer-file__status truncate"
      :class="sftpTransferStatusClass(task.status)"
      :title="statusText"
      :role="tableRow ? 'cell' : undefined"
    >
      {{ statusText }}
    </span>
    <SftpTransferActions
      class="sftp-transfer-file__actions"
      :task="task"
      :can-pause="canPause"
      :can-resume="canResume"
      @pause="emit('pause')"
      @retry="emit('retry')"
      @resume="emit('resume')"
      @cancel="emit('cancel')"
      @clear="emit('clear')"
      @resolve="emit('resolve', $event)"
    />
  </div>
</template>
