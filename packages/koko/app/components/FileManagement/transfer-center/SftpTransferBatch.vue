<script setup lang="ts">
import type {
  SftpTransferBatchGroup,
  SftpTransferTargetGroup
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import type { SftpTransferGroupStatus } from "#koko/utils/sftpTransferSummary";
import type { FileTransferConflictPolicy, FileTransferTask } from "~/shared/file-transfer/types";
import SftpTransferTarget from "#koko/components/FileManagement/transfer-center/SftpTransferTarget.vue";
import {
  batchHasFailedTasks,
  canPauseTransferTasks,
  canResumeTransferTasks,
  sftpTransferTerminalStatuses
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import {
  completedTargetCount,
  failedTargetCount,
  finishedTransferCount,
  sftpTransferGroupStatus,
  sftpTransferProgress
} from "#koko/utils/sftpTransferSummary";

const props = defineProps<{
  batch: SftpTransferBatchGroup;
  expanded: boolean;
  expandedTargets: Set<string>;
}>();

const emit = defineEmits<{
  toggle: [];
  toggleTarget: [batchId: string, endpointId: string];
  pause: [tasks: FileTransferTask[]];
  resume: [tasks: FileTransferTask[]];
  retry: [tasks: FileTransferTask[]];
  cancel: [batch: SftpTransferBatchGroup];
  cancelTarget: [target: SftpTransferTargetGroup];
  resolve: [tasks: FileTransferTask[], policy: Exclude<FileTransferConflictPolicy, "ask">];
  pauseTask: [task: FileTransferTask];
  resumeTask: [task: FileTransferTask];
  retryTask: [task: FileTransferTask];
  cancelTask: [task: FileTransferTask];
}>();

const { t } = useI18n();
const groupActionButtonUi = { leadingIcon: "size-3.5" };
const status = computed(() => sftpTransferGroupStatus(props.batch.tasks));
const progress = computed(() => sftpTransferProgress(props.batch.tasks));
const canPause = computed(() => canPauseTransferTasks(props.batch.tasks));
const canResume = computed(() => canResumeTransferTasks(props.batch.tasks));
const canCancel = computed(() => props.batch.tasks.some((task) => !sftpTransferTerminalStatuses.has(task.status)));
const hasFailed = computed(() => batchHasFailedTasks(props.batch.tasks));

function targetKey(endpointId: string): string {
  return `${props.batch.id}:${endpointId}`;
}

function isTargetExpanded(endpointId: string): boolean {
  return props.expandedTargets.has(targetKey(endpointId));
}

function statusLabel(value: SftpTransferGroupStatus): string {
  return t(`FileTransfer.Status.${value}`);
}

function statusIcon(value: SftpTransferGroupStatus): string {
  const icons: Record<SftpTransferGroupStatus, string> = {
    queued: "i-lucide-clock",
    preparing: "i-lucide-loader-circle",
    transferring: "i-lucide-arrow-right-left",
    verifying: "i-lucide-shield-check",
    paused: "i-lucide-pause-circle",
    completed: "i-lucide-check-circle-2",
    skipped: "i-lucide-skip-forward",
    failed: "i-lucide-x-circle",
    canceled: "i-lucide-ban",
    partial: "i-lucide-circle-alert"
  };
  return icons[value];
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return t("koko.sftpTransferCenter.justNow");
  if (minutes < 60) return t("koko.sftpTransferCenter.minutesAgo", minutes);
  if (hours < 24) return t("koko.sftpTransferCenter.hoursAgo", hours);
  return new Date(timestamp).toLocaleString();
}
</script>

<template>
  <article class="sftp-transfer-batch rounded-lg border border-default bg-raised overflow-hidden" :class="{ expanded }">
    <div
      class="sftp-transfer-batch__summary flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      @click="emit('toggle')"
      @keydown.enter="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <UIcon name="i-lucide-chevron-right" class="sftp-transfer-batch__chevron size-4 shrink-0 text-muted mt-0.5" />

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <strong class="text-[13px] font-semibold">{{ t("koko.sftpTransferCenter.fileDistribution") }}</strong>
          <span class="sftp-status-pill" :class="status">
            <UIcon :name="statusIcon(status)" />
            {{ statusLabel(status) }}
          </span>
        </div>

        <p class="font-mono text-[11.5px] text-muted mt-0.5">
          {{ t("koko.sftpTransferCenter.fileCount", batch.tasks.length) }} ·
          {{ t("koko.sftpTransferCenter.targetMachineCount", batch.targetCount) }} ·
          {{ t("koko.sftpTransferCenter.source", { source: batch.sourceLabel }) }} ·
          {{ formatRelativeTime(batch.createdAt) }}
        </p>

        <div class="sftp-transfer-batch__stats flex items-center gap-1.5 flex-wrap mt-1.5 text-[11.5px]">
          <span v-if="completedTargetCount(batch.tasks)" class="stat ok">
            <UIcon name="i-lucide-check" />
            {{ t("koko.sftpTransferCenter.completedTargets", completedTargetCount(batch.tasks)) }}
          </span>
          <span v-if="failedTargetCount(batch.tasks)" class="stat fail">
            <UIcon name="i-lucide-alert-circle" />
            {{ t("koko.sftpTransferCenter.failedTargets", failedTargetCount(batch.tasks)) }}
          </span>
        </div>
      </div>

      <div class="sftp-transfer-batch__aside flex flex-col items-end gap-1.5">
        <span class="font-mono text-[13px] font-semibold">{{ progress }}%</span>
        <div class="flex gap-0.5">
          <UButton
            v-if="canPause"
            class="size-[26px] justify-center p-0"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-pause"
            :ui="groupActionButtonUi"
            :title="t('koko.sftpTransferCenter.pauseBatch')"
            @click.stop="emit('pause', batch.tasks)"
          />
          <UButton
            v-if="canResume"
            class="size-[26px] justify-center p-0"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-play"
            :ui="groupActionButtonUi"
            :title="t('koko.sftpTransferCenter.resumeBatch')"
            @click.stop="emit('resume', batch.tasks)"
          />
          <UButton
            v-if="canCancel"
            class="size-[26px] justify-center p-0"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-x"
            :ui="groupActionButtonUi"
            :title="t('koko.sftpTransferCenter.cancelBatch')"
            @click.stop="emit('cancel', batch)"
          />
        </div>
      </div>
    </div>

    <div class="px-3 pb-2.5">
      <div
        class="sftp-progress-bar"
        role="progressbar"
        :aria-label="t('koko.sftpTransferCenter.batchProgress')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
      >
        <i :class="status" :style="{ width: `${progress}%` }"></i>
      </div>
    </div>

    <div
      v-if="hasFailed"
      class="sftp-transfer-banner error mx-3 mb-3 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11.5px]"
    >
      <UIcon name="i-lucide-rotate-ccw" class="size-3.5 shrink-0" />
      <span class="flex-1">
        {{ t("koko.sftpTransferCenter.failedTargetBanner", failedTargetCount(batch.tasks)) }}
      </span>
      <UButton
        class="p-0 text-[11px] font-semibold"
        color="error"
        variant="link"
        :label="t('koko.sftpTransferCenter.retryFailedFiles')"
        @click.stop="emit('retry', batch.tasks)"
      />
    </div>

    <div v-show="expanded" class="sftp-transfer-targets border-t border-default">
      <div v-if="batch.targets.length > 1" class="px-3 py-2.5 border-b border-default">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-network" class="size-3.5 text-primary" />
          <span class="text-[11px] font-medium text-muted">{{ t("koko.sftpTransferCenter.topology") }}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="sftp-status-pill completed">
            <UIcon name="i-lucide-folder" />
            <span class="text-[11px]">{{ batch.sourceLabel }}</span>
          </span>
          <UIcon name="i-lucide-arrow-right" class="size-3.5 text-muted" />
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="target in batch.targets"
              :key="target.endpointId"
              class="sftp-status-pill"
              :class="sftpTransferGroupStatus(target.allTasks)"
            >
              <UIcon :name="statusIcon(sftpTransferGroupStatus(target.allTasks))" />
              <span class="text-[11px]">{{ target.label }}</span>
              <span class="font-mono text-[10px] opacity-70">
                {{ finishedTransferCount(target.allTasks) }}/{{ target.allTasks.length }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <SftpTransferTarget
        v-for="target in batch.targets"
        :key="target.endpointId"
        :target="target"
        :expanded="isTargetExpanded(target.endpointId)"
        @toggle="emit('toggleTarget', batch.id, target.endpointId)"
        @pause="emit('pause', $event)"
        @resume="emit('resume', $event)"
        @retry="emit('retry', $event)"
        @cancel="emit('cancelTarget', $event)"
        @resolve="(tasks, policy) => emit('resolve', tasks, policy)"
        @pause-task="emit('pauseTask', $event)"
        @resume-task="emit('resumeTask', $event)"
        @retry-task="emit('retryTask', $event)"
        @cancel-task="emit('cancelTask', $event)"
      />
    </div>
  </article>
</template>
