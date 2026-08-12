<script setup lang="ts">
import type { SftpTransferGroupStatus } from "#koko/utils/sftpTransferSummary";
import type { FileTransferConflictPolicy, FileTransferStatus, FileTransferTask } from "~/shared/file-transfer/types";
import prettyBytes from "pretty-bytes";
import {
  completedTargetCount,
  failedTargetCount,
  finishedTransferCount,
  sftpTransferGroupStatus,
  sftpTransferProgress
} from "#koko/utils/sftpTransferSummary";
import { useFileTransferStore } from "~/store/modules/fileTransfer";

interface TargetGroup {
  endpointId: string;
  label: string;
  destinationPath: string;
  tasks: FileTransferTask[];
  allTasks: FileTransferTask[]; // 未经过滤的所有任务，用于状态计算
}

interface BatchGroup {
  id: string;
  batchIds: string[];
  sourceLabel: string;
  createdAt: number;
  targets: TargetGroup[];
  tasks: FileTransferTask[]; // 未经过滤的所有任务，用于状态计算
  displayTasks: FileTransferTask[]; // 过滤后的显示任务
  targetCount: number;
}

type TaskFilter = "all" | "active" | "failed" | "completed" | "canceled";

interface FlightPosition {
  id: number;
  left: number;
  top: number;
  deltaX: number;
  deltaY: number;
  middleX: number;
  middleY: number;
}

const { t } = useI18n();
const store = useFileTransferStore();
const open = ref(false);
const filter = ref<TaskFilter>("all");
const expandedBatches = ref(new Set<string>());
const expandedTargets = ref(new Set<string>());
const triggerRef = ref<HTMLElement | null>(null);
const attracting = ref(false);

const conflictError = "target_exists";
const flight = ref<FlightPosition | null>(null);
let animationSequence = 0;
let attentionTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const terminalStatuses = new Set<FileTransferStatus>(["completed", "skipped", "failed", "canceled"]);
const groupActionButtonUi = { leadingIcon: "size-3.5" };
const fileActionButtonUi = { leadingIcon: "size-3" };
const taskFilters: readonly { value: TaskFilter; labelKey: string }[] = [
  { value: "all", labelKey: "koko.sftpTransferCenter.filters.all" },
  { value: "active", labelKey: "koko.sftpTransferCenter.filters.active" },
  { value: "failed", labelKey: "koko.sftpTransferCenter.filters.failed" },
  { value: "completed", labelKey: "koko.sftpTransferCenter.filters.completed" },
  { value: "canceled", labelKey: "koko.sftpTransferCenter.filters.canceled" }
];
const sftpTasks = computed(() =>
  store.tasks.filter(
    (task) => task.sourceEndpoint.id.startsWith("sftp:") || task.destinationEndpoint.id.startsWith("sftp:")
  )
);
const activeCount = computed(
  () =>
    new Set(
      sftpTasks.value.filter((task) => !terminalStatuses.has(task.status)).map((task) => task.destinationEndpoint.id)
    ).size
);
const hasFinishedTasks = computed(() => sftpTasks.value.some((task) => terminalStatuses.has(task.status)));

function setOpen(value: boolean): void {
  open.value = value;
}

function selectFilter(value: TaskFilter): void {
  filter.value = value;
}

const visibleTasks = computed(() => {
  if (filter.value === "active") return sftpTasks.value.filter((task) => !terminalStatuses.has(task.status));
  if (filter.value === "failed") return sftpTasks.value.filter((task) => task.status === "failed");
  if (filter.value === "completed") return sftpTasks.value.filter((task) => task.status === "completed");
  if (filter.value === "canceled") return sftpTasks.value.filter((task) => task.status === "canceled");
  return sftpTasks.value;
});

const batches = computed<BatchGroup[]>(() => {
  const groups = new Map<string, FileTransferTask[]>();

  // 使用所有任务（未过滤）构建分组，以保留完整的状态信息
  for (const task of sftpTasks.value) {
    const separatorIndex = task.batchId.indexOf("::target::");
    const groupId = separatorIndex >= 0 ? task.batchId.slice(0, separatorIndex) : task.batchId;
    const tasks = groups.get(groupId) || [];
    tasks.push(task);
    groups.set(groupId, tasks);
  }

  return [...groups.entries()]
    .map(([id, allTasks]) => {
      // 根据过滤器筛选要显示的任务
      const displayTasks = allTasks.filter((task) => visibleTasks.value.includes(task));

      // 如果过滤后没有任务要显示，跳过这个批次
      if (!displayTasks.length) return null;

      const targetMap = new Map<string, FileTransferTask[]>();
      for (const task of displayTasks) {
        const targetTasks = targetMap.get(task.destinationEndpoint.id) || [];
        targetTasks.push(task);
        targetMap.set(task.destinationEndpoint.id, targetTasks);
      }

      return {
        id,
        batchIds: [...new Set(allTasks.map((task) => task.batchId))],
        sourceLabel: allTasks[0]?.sourceEndpoint.label || "SFTP",
        createdAt: Math.min(...allTasks.map((task) => task.createdAt)),
        tasks: allTasks, // 保留所有任务用于状态计算
        displayTasks, // 过滤后的任务用于显示
        targetCount: new Set(allTasks.map((task) => task.destinationEndpoint.id)).size,
        targets: [...targetMap.entries()].map(([endpointId, targetTasks]) => ({
          endpointId,
          label: targetTasks[0]?.destinationEndpoint.label || endpointId,
          destinationPath: targetTasks[0]?.destinationPath || "/",
          tasks: targetTasks,
          allTasks: allTasks.filter((task) => task.destinationEndpoint.id === endpointId) // 目标的所有任务
        }))
      };
    })
    .filter((batch): batch is NonNullable<typeof batch> => batch !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
});

watch(
  () => batches.value[0]?.id,
  (id) => {
    if (id) expandedBatches.value.add(id);
  },
  { immediate: true }
);

function statusLabel(status: SftpTransferGroupStatus) {
  return t(`FileTransfer.Status.${status}`);
}

function statusIcon(status: SftpTransferGroupStatus) {
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
  return icons[status] || "i-lucide-circle";
}

function toggleBatch(id: string) {
  const next = new Set(expandedBatches.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedBatches.value = next;
}

function toggleTarget(batchId: string, endpointId: string) {
  const key = `${batchId}:${endpointId}`;
  const next = new Set(expandedTargets.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedTargets.value = next;
}

function isTargetExpanded(batchId: string, endpointId: string) {
  return expandedTargets.value.has(`${batchId}:${endpointId}`);
}

function cancelTarget(target: TargetGroup) {
  void Promise.all(target.allTasks.map((task) => store.cancelTask(task.id)));
}

function cancelDistribution(batch: BatchGroup) {
  void Promise.all(batch.batchIds.map((batchId) => store.cancelBatch(batchId)));
}

function pauseTasks(tasks: FileTransferTask[]) {
  tasks.filter((task) => !terminalStatuses.has(task.status)).forEach((task) => store.pauseTask(task.id));
}

function resumeTasks(tasks: FileTransferTask[]) {
  tasks
    .filter((task) => task.status === "paused" && task.error !== conflictError)
    .forEach((task) => store.resumeTask(task.id));
}

function retryTasks(tasks: FileTransferTask[]) {
  tasks.filter((task) => task.status === "failed").forEach((task) => store.retryTask(task.id));
}

function taskProgress(task: FileTransferTask) {
  if (task.status === "completed" || task.status === "skipped") return 100;
  if (!task.source.size) return 0;
  return Math.min(100, Math.round((task.confirmedBytes / task.source.size) * 100));
}

function canPause(tasks: FileTransferTask[]) {
  return tasks.some((task) => !terminalStatuses.has(task.status) && task.status !== "paused");
}

function canResume(tasks: FileTransferTask[]) {
  const resumableTasks = tasks.filter((task) => !terminalStatuses.has(task.status) && task.error !== conflictError);
  return resumableTasks.length > 0 && resumableTasks.every((task) => task.status === "paused");
}

// 检查批次是否有失败
function batchHasFailed(batch: BatchGroup): boolean {
  return batch.tasks.some((task) => task.status === "failed");
}

// 检查目标是否有冲突
function targetHasConflict(target: TargetGroup): boolean {
  return target.allTasks.some((task) => task.status === "paused" && task.error === conflictError);
}

// 获取目标的错误信息
function getTargetError(target: TargetGroup): string | null {
  const failedTask = target.allTasks.find((task) => task.status === "failed" && task.error);
  if (failedTask?.error) return failedTask.error;

  const conflictTask = target.allTasks.find((task) => task.status === "paused" && task.error === conflictError);
  if (conflictTask) return conflictError;

  return null;
}

// 格式化相对时间
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return t("koko.sftpTransferCenter.justNow");
  if (minutes < 60) return t("koko.sftpTransferCenter.minutesAgo", minutes);
  if (hours < 24) return t("koko.sftpTransferCenter.hoursAgo", hours);
  return new Date(timestamp).toLocaleString();
}

function resolveConflicts(tasks: FileTransferTask[], policy: Exclude<FileTransferConflictPolicy, "ask">) {
  const conflictBatchIds = new Set(
    tasks.filter((task) => task.status === "paused" && task.error === conflictError).map((task) => task.batchId)
  );
  conflictBatchIds.forEach((batchId) => store.resolveBatchConflict(batchId, policy));
}

function signalQueued(origin?: DOMRect) {
  const target = triggerRef.value?.getBoundingClientRect();
  if (!target) return;

  if (attentionTimer) clearTimeout(attentionTimer);
  if (settleTimer) clearTimeout(settleTimer);
  attracting.value = false;
  flight.value = null;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (origin && !reducedMotion) {
    const left = origin.left + origin.width / 2 - 14;
    const top = origin.top + origin.height / 2 - 14;
    const deltaX = target.left + target.width / 2 - 14 - left;
    const deltaY = target.top + target.height / 2 - 14 - top;
    flight.value = {
      id: ++animationSequence,
      left,
      top,
      deltaX,
      deltaY,
      middleX: deltaX * 0.58,
      middleY: deltaY * 0.48 - 24
    };
  }

  attentionTimer = setTimeout(
    () => {
      attracting.value = true;
      settleTimer = setTimeout(
        () => {
          attracting.value = false;
        },
        reducedMotion ? 700 : 900
      );
    },
    origin && !reducedMotion ? 430 : 0
  );
}

onBeforeUnmount(() => {
  if (attentionTimer) clearTimeout(attentionTimer);
  if (settleTimer) clearTimeout(settleTimer);
});

onMounted(() => void store.restore());

defineExpose({ signalQueued });
</script>

<template>
  <span
    ref="triggerRef"
    class="sftp-transfer-trigger-anchor"
    :class="{ 'is-attracting': attracting }"
    data-sftp-tour="transfer-center"
  >
    <UButton
      class="sftp-transfer-trigger"
      color="neutral"
      variant="ghost"
      icon="i-lucide-cloud-upload"
      :label="t('koko.sftpTransferCenter.title')"
      @click="setOpen(true)"
    >
      <template #trailing>
        <UBadge v-if="activeCount" color="primary" variant="solid" size="xs">{{ activeCount }}</UBadge>
      </template>
    </UButton>
  </span>

  <Teleport to="body">
    <span
      v-if="flight"
      :key="flight.id"
      class="sftp-transfer-flight"
      aria-hidden="true"
      :style="{
        left: `${flight.left}px`,
        top: `${flight.top}px`,
        '--sftp-flight-x': `${flight.deltaX}px`,
        '--sftp-flight-y': `${flight.deltaY}px`,
        '--sftp-flight-middle-x': `${flight.middleX}px`,
        '--sftp-flight-middle-y': `${flight.middleY}px`
      }"
      @animationend="flight = null"
    >
      <UIcon name="i-lucide-send" class="size-3.5" />
    </span>
  </Teleport>

  <USlideover
    v-model:open="open"
    class="sftp-transfer-center-drawer"
    :ui="{
      body: 'p-0 sm:p-0 flex min-h-0 flex-col overflow-hidden',
      footer: 'px-3.5 py-2',
      header: 'px-3.5 py-3'
    }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2.5">
          <UIcon name="i-lucide-cloud-upload" class="size-4.5 shrink-0 text-primary" />
          <h2 class="flex-1 text-sm font-semibold">{{ t("koko.sftpTransferCenter.title") }}</h2>
          <span class="font-mono text-[11px] text-muted bg-elevated rounded-full px-2 py-0.5">
            {{ batches.length }}
          </span>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="sm" @click="setOpen(false)" />
      </div>
    </template>

    <template #body>
      <!-- Filters -->
      <div class="flex shrink-0 items-center gap-1.5 flex-wrap border-b border-default px-3.5 py-2">
        <button
          v-for="item in taskFilters"
          :key="item.value"
          type="button"
          class="sftp-transfer-filter-chip"
          :class="{ on: filter === item.value }"
          :aria-pressed="filter === item.value"
          @click="selectFilter(item.value)"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>

      <!-- Batch List -->
      <div v-if="batches.length" class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5">
        <article
          v-for="batch in batches"
          :key="batch.id"
          class="sftp-transfer-batch rounded-lg border border-default bg-raised overflow-hidden"
          :class="{ expanded: expandedBatches.has(batch.id) }"
        >
          <!-- Batch Summary -->
          <div
            class="sftp-transfer-batch__summary flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
            role="button"
            tabindex="0"
            :aria-expanded="expandedBatches.has(batch.id)"
            @click="toggleBatch(batch.id)"
            @keydown.enter="toggleBatch(batch.id)"
            @keydown.space.prevent="toggleBatch(batch.id)"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="sftp-transfer-batch__chevron size-4 shrink-0 text-muted mt-0.5"
            />

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <strong class="text-[13px] font-semibold">{{ t("koko.sftpTransferCenter.fileDistribution") }}</strong>
                <span class="sftp-status-pill" :class="sftpTransferGroupStatus(batch.tasks)">
                  <UIcon :name="statusIcon(sftpTransferGroupStatus(batch.tasks))" />
                  {{ statusLabel(sftpTransferGroupStatus(batch.tasks)) }}
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
              <span class="font-mono text-[13px] font-semibold">{{ sftpTransferProgress(batch.tasks) }}%</span>
              <div class="flex gap-0.5">
                <UButton
                  v-if="canPause(batch.tasks)"
                  class="size-[26px] justify-center p-0"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-pause"
                  :ui="groupActionButtonUi"
                  :title="t('koko.sftpTransferCenter.pauseBatch')"
                  @click.stop="pauseTasks(batch.tasks)"
                />
                <UButton
                  v-if="canResume(batch.tasks)"
                  class="size-[26px] justify-center p-0"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-play"
                  :ui="groupActionButtonUi"
                  :title="t('koko.sftpTransferCenter.resumeBatch')"
                  @click.stop="resumeTasks(batch.tasks)"
                />
                <UButton
                  v-if="batch.tasks.some((task) => !terminalStatuses.has(task.status))"
                  class="size-[26px] justify-center p-0"
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-x"
                  :ui="groupActionButtonUi"
                  :title="t('koko.sftpTransferCenter.cancelBatch')"
                  @click.stop="cancelDistribution(batch)"
                />
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="px-3 pb-2.5">
            <div
              class="sftp-progress-bar"
              role="progressbar"
              :aria-label="t('koko.sftpTransferCenter.batchProgress')"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="sftpTransferProgress(batch.tasks)"
            >
              <i
                :class="sftpTransferGroupStatus(batch.tasks)"
                :style="{ width: `${sftpTransferProgress(batch.tasks)}%` }"
              ></i>
            </div>
          </div>

          <!-- Failed tasks are summarized at batch level; conflicts are shown only above the affected file list. -->
          <div
            v-if="batchHasFailed(batch)"
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
              @click.stop="retryTasks(batch.tasks)"
            />
          </div>

          <!-- Targets -->
          <div v-show="expandedBatches.has(batch.id)" class="sftp-transfer-targets border-t border-default">
            <!-- Topology Visualization -->
            <div v-if="batch.targets.length > 1" class="px-3 py-2.5 border-b border-default">
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-lucide-network" class="size-3.5 text-primary" />
                <span class="text-[11px] font-medium text-muted">{{ t("koko.sftpTransferCenter.topology") }}</span>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Source -->
                <span class="sftp-status-pill completed">
                  <UIcon name="i-lucide-folder" />
                  <span class="text-[11px]">{{ batch.sourceLabel }}</span>
                </span>
                <UIcon name="i-lucide-arrow-right" class="size-3.5 text-muted" />
                <!-- Targets -->
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

            <!-- Target List -->
            <section
              v-for="target in batch.targets"
              :key="target.endpointId"
              class="sftp-transfer-target"
              :class="{ expanded: isTargetExpanded(batch.id, target.endpointId) }"
            >
              <div
                class="sftp-transfer-target__summary flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                role="button"
                tabindex="0"
                :aria-expanded="isTargetExpanded(batch.id, target.endpointId)"
                @click="toggleTarget(batch.id, target.endpointId)"
                @keydown.enter="toggleTarget(batch.id, target.endpointId)"
                @keydown.space.prevent="toggleTarget(batch.id, target.endpointId)"
              >
                <UIcon
                  name="i-lucide-chevron-right"
                  class="sftp-transfer-target__chevron size-3.5 shrink-0 text-tertiary"
                />
                <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-primary" />

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-mono text-xs font-medium truncate">{{ target.label }}</p>
                    <span class="sftp-status-pill" :class="sftpTransferGroupStatus(target.allTasks)">
                      <UIcon :name="statusIcon(sftpTransferGroupStatus(target.allTasks))" />
                      <span class="text-[11px]">{{ statusLabel(sftpTransferGroupStatus(target.allTasks)) }}</span>
                    </span>
                    <span class="font-mono text-[11px] text-muted whitespace-nowrap">
                      {{ finishedTransferCount(target.allTasks) }}/{{ target.allTasks.length }}
                    </span>
                  </div>
                  <p class="font-mono text-[11px] text-muted mt-1 truncate">
                    {{ t("koko.sftpTransferCenter.writingTo", { path: target.destinationPath }) }}
                  </p>
                </div>

                <!-- Target Progress Bar -->
                <div
                  class="sftp-target-progress-bar"
                  role="progressbar"
                  :aria-label="t('koko.sftpTransferCenter.targetProgress', { target: target.label })"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuenow="sftpTransferProgress(target.allTasks)"
                >
                  <i
                    :class="sftpTransferGroupStatus(target.allTasks)"
                    :style="{ width: `${sftpTransferProgress(target.allTasks)}%` }"
                  ></i>
                </div>

                <div class="sftp-transfer-target__actions flex gap-0.5">
                  <UButton
                    v-if="target.allTasks.some((task) => task.status === 'failed')"
                    class="size-[26px] justify-center p-0"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-rotate-ccw"
                    :ui="groupActionButtonUi"
                    :title="t('koko.sftpTransferCenter.retryTarget')"
                    @click.stop="retryTasks(target.allTasks)"
                  />
                  <UButton
                    v-if="canPause(target.allTasks)"
                    class="size-[26px] justify-center p-0"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-pause"
                    :ui="groupActionButtonUi"
                    :title="t('koko.sftpTransferCenter.pauseTarget')"
                    @click.stop="pauseTasks(target.allTasks)"
                  />
                  <UButton
                    v-if="canResume(target.allTasks)"
                    class="size-[26px] justify-center p-0"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-play"
                    :ui="groupActionButtonUi"
                    :title="t('koko.sftpTransferCenter.resumeTarget')"
                    @click.stop="resumeTasks(target.allTasks)"
                  />
                  <UButton
                    v-if="target.allTasks.some((task) => !terminalStatuses.has(task.status))"
                    class="size-[26px] justify-center p-0"
                    color="error"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-x"
                    :ui="groupActionButtonUi"
                    :title="t('koko.sftpTransferCenter.cancelTarget')"
                    @click.stop="cancelTarget(target)"
                  />
                </div>
              </div>

              <!-- Conflict is shown once, directly above the affected file list. -->
              <div
                v-if="targetHasConflict(target)"
                class="sftp-transfer-banner warning mx-3 mb-2 ml-[34px] flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
              >
                <UIcon name="i-lucide-alert-triangle" class="size-3 shrink-0 mt-0.5" />
                <div class="flex-1">
                  <b>{{ target.label }}</b>
                  ·
                  {{
                    t("koko.sftpTransferCenter.targetConflict", {
                      filename: target.allTasks.find((t) => t.error === conflictError)?.source.name
                    })
                  }}
                  <div class="sftp-conflict-actions">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click.stop="resolveConflicts(target.allTasks, 'overwrite')"
                    >
                      {{ t("koko.sftpTransferCenter.overwrite") }}
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click.stop="resolveConflicts(target.allTasks, 'skip')"
                    >
                      {{ t("koko.sftpTransferCenter.skip") }}
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click.stop="resolveConflicts(target.allTasks, 'keep_both')"
                    >
                      {{ t("koko.sftpTransferCenter.keepBoth") }}
                    </UButton>
                  </div>
                </div>
              </div>

              <div
                v-else-if="getTargetError(target)"
                class="sftp-transfer-banner error mx-3 mb-2 ml-[34px] flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
              >
                <UIcon name="i-lucide-alert-circle" class="size-3 shrink-0 mt-0.5" />
                <div class="flex-1">
                  <b>{{ target.label }}</b>
                  · {{ getTargetError(target) }}
                </div>
              </div>

              <!-- File List -->
              <div
                v-show="isTargetExpanded(batch.id, target.endpointId)"
                class="sftp-transfer-files flex-col gap-0.5 px-3 pb-2 pl-[34px]"
              >
                <div v-for="task in target.tasks" :key="task.id" class="sftp-transfer-file">
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
                    <template v-if="task.status === 'transferring'">{{ taskProgress(task) }}%</template>
                    <template v-else>{{ statusLabel(task.status) }}</template>
                  </span>
                  <div class="sftp-transfer-file__actions">
                    <UButton
                      v-if="canPause([task])"
                      class="size-[22px] justify-center p-0"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-pause"
                      :ui="fileActionButtonUi"
                      :title="t('FileTransfer.Pause')"
                      @click="store.pauseTask(task.id)"
                    />
                    <UButton
                      v-if="task.status === 'failed'"
                      class="size-[22px] justify-center p-0"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-rotate-ccw"
                      :ui="fileActionButtonUi"
                      :title="t('koko.sftpTransferCenter.retryFile')"
                      @click="store.retryTask(task.id)"
                    />
                    <UButton
                      v-if="canResume([task])"
                      class="size-[22px] justify-center p-0"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-play"
                      :ui="fileActionButtonUi"
                      :title="t('FileTransfer.Resume')"
                      @click="store.resumeTask(task.id)"
                    />
                    <UButton
                      v-if="!terminalStatuses.has(task.status)"
                      class="size-[22px] justify-center p-0"
                      color="error"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-x"
                      :ui="fileActionButtonUi"
                      :title="t('FileTransfer.Cancel')"
                      @click="store.cancelTask(task.id)"
                    />
                  </div>

                  <!-- Every file keeps its own progress track, including queued and zero-progress files. -->
                  <div class="sftp-transfer-file__progress">
                    <div
                      class="sftp-file-progress-bar"
                      role="progressbar"
                      :aria-label="t('koko.sftpTransferCenter.fileProgress', { file: task.source.name })"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      :aria-valuenow="taskProgress(task)"
                    >
                      <i :class="task.status" :style="{ width: `${taskProgress(task)}%` }"></i>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </article>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center gap-3 py-16 text-muted">
        <UIcon name="i-lucide-inbox" class="size-12 opacity-50" />
        <p class="text-sm">{{ t("FileTransfer.Empty") }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="text-[11px] text-muted">{{ t("koko.sftpTransferCenter.schedulingHint") }}</p>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          :disabled="!hasFinishedTasks"
          :label="t('FileTransfer.ClearFinished')"
          @click="store.clearFinished(sftpTasks.map((task) => task.id))"
        />
      </div>
    </template>
  </USlideover>
</template>
