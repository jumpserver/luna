<script setup lang="ts">
import type { FileTransferConflictPolicy, FileTransferTask } from "@jumpserver/connectors-core";
import type { SftpTransferTargetGroup } from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import type { SftpTransferGroupStatus } from "#koko/utils/sftpTransferSummary";
import SftpTransferFile from "#koko/components/FileManagement/transfer-center/SftpTransferFile.vue";
import {
  canPauseTransferTasks,
  canResumeTransferTasks,
  getTargetTransferError,
  sftpTransferConflictError,
  sftpTransferTerminalStatuses,
  targetHasConflictTasks
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import { finishedTransferCount, sftpTransferGroupStatus, sftpTransferProgress } from "#koko/utils/sftpTransferSummary";

const props = defineProps<{
  target: SftpTransferTargetGroup;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  pause: [tasks: FileTransferTask[]];
  resume: [tasks: FileTransferTask[]];
  retry: [tasks: FileTransferTask[]];
  cancel: [target: SftpTransferTargetGroup];
  resolve: [tasks: FileTransferTask[], policy: Exclude<FileTransferConflictPolicy, "ask">];
  pauseTask: [task: FileTransferTask];
  resumeTask: [task: FileTransferTask];
  retryTask: [task: FileTransferTask];
  cancelTask: [task: FileTransferTask];
}>();

const { t } = useI18n();
const groupActionButtonUi = { leadingIcon: "size-3.5" };

const status = computed(() => sftpTransferGroupStatus(props.target.allTasks));
const progress = computed(() => sftpTransferProgress(props.target.allTasks));
const conflictTask = computed(() =>
  props.target.allTasks.find((task) => task.status === "paused" && task.error === sftpTransferConflictError)
);
const hasConflict = computed(() => targetHasConflictTasks(props.target.allTasks));
const error = computed(() => getTargetTransferError(props.target.allTasks));
const canPause = computed(() => canPauseTransferTasks(props.target.allTasks));
const canResume = computed(() => canResumeTransferTasks(props.target.allTasks));
const canCancel = computed(() => props.target.allTasks.some((task) => !sftpTransferTerminalStatuses.has(task.status)));
const canRetry = computed(() => props.target.allTasks.some((task) => task.status === "failed"));

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
</script>

<template>
  <section class="sftp-transfer-target" :class="{ expanded }">
    <div
      class="sftp-transfer-target__summary flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
      role="button"
      tabindex="0"
      :aria-expanded="expanded"
      @click="emit('toggle')"
      @keydown.enter="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <UIcon name="i-lucide-chevron-right" class="sftp-transfer-target__chevron size-3.5 shrink-0 text-tertiary" />
      <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-primary" />

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p class="font-mono text-xs font-medium truncate">{{ target.label }}</p>
          <span class="sftp-status-pill" :class="status">
            <UIcon :name="statusIcon(status)" />
            <span class="text-[11px]">{{ statusLabel(status) }}</span>
          </span>
          <span class="font-mono text-[11px] text-muted whitespace-nowrap">
            {{ finishedTransferCount(target.allTasks) }}/{{ target.allTasks.length }}
          </span>
        </div>
        <p class="font-mono text-[11px] text-muted mt-1 truncate">
          {{ t("koko.sftpTransferCenter.writingTo", { path: target.destinationPath }) }}
        </p>
      </div>

      <div
        class="sftp-target-progress-bar"
        role="progressbar"
        :aria-label="t('koko.sftpTransferCenter.targetProgress', { target: target.label })"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
      >
        <i :class="status" :style="{ width: `${progress}%` }"></i>
      </div>

      <div class="sftp-transfer-target__actions flex gap-0.5">
        <UButton
          v-if="canRetry"
          class="size-6.5 justify-center p-0"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-rotate-ccw"
          :ui="groupActionButtonUi"
          :title="t('koko.sftpTransferCenter.retryTarget')"
          @click.stop="emit('retry', target.allTasks)"
        />
        <UButton
          v-if="canPause"
          class="size-6.5 justify-center p-0"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-pause"
          :ui="groupActionButtonUi"
          :title="t('koko.sftpTransferCenter.pauseTarget')"
          @click.stop="emit('pause', target.allTasks)"
        />
        <UButton
          v-if="canResume"
          class="size-6.5 justify-center p-0"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-play"
          :ui="groupActionButtonUi"
          :title="t('koko.sftpTransferCenter.resumeTarget')"
          @click.stop="emit('resume', target.allTasks)"
        />
        <UButton
          v-if="canCancel"
          class="size-6.5 justify-center p-0"
          color="error"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          :ui="groupActionButtonUi"
          :title="t('koko.sftpTransferCenter.cancelTarget')"
          @click.stop="emit('cancel', target)"
        />
      </div>
    </div>

    <div
      v-if="hasConflict"
      class="sftp-transfer-banner warning mx-3 mb-2 ml-8.5 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
    >
      <UIcon name="i-lucide-alert-triangle" class="size-3 shrink-0 mt-0.5" />
      <div class="flex-1">
        <b>{{ target.label }}</b>
        ·
        {{
          t("koko.sftpTransferCenter.targetConflict", {
            filename: conflictTask?.source.name
          })
        }}
        <div class="sftp-conflict-actions">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            @click.stop="emit('resolve', target.allTasks, 'overwrite')"
          >
            {{ t("koko.sftpTransferCenter.overwrite") }}
          </UButton>
          <UButton size="xs" color="neutral" variant="outline" @click.stop="emit('resolve', target.allTasks, 'skip')">
            {{ t("koko.sftpTransferCenter.skip") }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            @click.stop="emit('resolve', target.allTasks, 'keep_both')"
          >
            {{ t("koko.sftpTransferCenter.keepBoth") }}
          </UButton>
        </div>
      </div>
    </div>

    <div
      v-else-if="error"
      class="sftp-transfer-banner error mx-3 mb-2 ml-8.5 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
    >
      <UIcon name="i-lucide-alert-circle" class="size-3 shrink-0 mt-0.5" />
      <div class="flex-1">
        <b>{{ target.label }}</b>
        · {{ error }}
      </div>
    </div>

    <div v-show="expanded" class="sftp-transfer-files flex-col gap-0.5 px-3 pb-2 pl-8.5">
      <SftpTransferFile
        v-for="task in target.tasks"
        :key="task.id"
        :task="task"
        :can-pause="canPauseTransferTasks([task])"
        :can-resume="canResumeTransferTasks([task])"
        @pause="emit('pauseTask', task)"
        @retry="emit('retryTask', task)"
        @resume="emit('resumeTask', task)"
        @cancel="emit('cancelTask', task)"
      />
    </div>
  </section>
</template>
