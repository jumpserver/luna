<script setup lang="ts">
import type {
  SftpTransferBatchGroup as BatchGroup,
  SftpTransferTargetGroup as TargetGroup,
  SftpTransferTaskFilter as TaskFilter
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import type { FileTransferConflictPolicy, FileTransferTask } from "~/shared/file-transfer/types";
import SftpTransferBatch from "#koko/components/FileManagement/transfer-center/SftpTransferBatch.vue";
import {
  sftpTransferConflictError,
  sftpTransferTerminalStatuses,
  useSftpTransferCenterSelectors
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import { useFileTransferStore } from "~/store/modules/fileTransfer";

interface FlightPosition {
  id: number;
  left: number;
  top: number;
  deltaX: number;
  deltaY: number;
  middleX: number;
  middleY: number;
}

const props = withDefaults(
  defineProps<{
    /** Emphasized trigger for the professional workbench header. */
    prominent?: boolean;
  }>(),
  { prominent: false }
);

const { t } = useI18n();
const store = useFileTransferStore();
const open = ref(false);
const filter = ref<TaskFilter>("all");
const expandedBatches = ref(new Set<string>());
const expandedTargets = ref(new Set<string>());
const triggerRef = ref<HTMLElement | null>(null);
const attracting = ref(false);
const flight = ref<FlightPosition | null>(null);
let animationSequence = 0;
let attentionTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const taskFilters: readonly { value: TaskFilter; labelKey: string }[] = [
  { value: "all", labelKey: "koko.sftpTransferCenter.filters.all" },
  { value: "active", labelKey: "koko.sftpTransferCenter.filters.active" },
  { value: "failed", labelKey: "koko.sftpTransferCenter.filters.failed" },
  { value: "completed", labelKey: "koko.sftpTransferCenter.filters.completed" },
  { value: "canceled", labelKey: "koko.sftpTransferCenter.filters.canceled" }
];
const { sftpTasks, activeCount, hasFinishedTasks, batches } = useSftpTransferCenterSelectors({
  tasks: () => store.tasks,
  filter
});

watch(
  () => batches.value[0]?.id,
  (id) => {
    if (id) expandedBatches.value.add(id);
  },
  { immediate: true }
);

function toggleBatch(id: string): void {
  const next = new Set(expandedBatches.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedBatches.value = next;
}

function toggleTarget(batchId: string, endpointId: string): void {
  const key = `${batchId}:${endpointId}`;
  const next = new Set(expandedTargets.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedTargets.value = next;
}

function cancelTarget(target: TargetGroup): void {
  void Promise.all(target.allTasks.map((task) => store.cancelTask(task.id)));
}

function cancelDistribution(batch: BatchGroup): void {
  void Promise.all(batch.batchIds.map((batchId) => store.cancelBatch(batchId)));
}

function pauseTasks(tasks: FileTransferTask[]): void {
  tasks.filter((task) => !sftpTransferTerminalStatuses.has(task.status)).forEach((task) => store.pauseTask(task.id));
}

function resumeTasks(tasks: FileTransferTask[]): void {
  tasks
    .filter((task) => task.status === "paused" && task.error !== sftpTransferConflictError)
    .forEach((task) => store.resumeTask(task.id));
}

function retryTasks(tasks: FileTransferTask[]): void {
  tasks.filter((task) => task.status === "failed").forEach((task) => store.retryTask(task.id));
}

function resolveConflicts(tasks: FileTransferTask[], policy: Exclude<FileTransferConflictPolicy, "ask">): void {
  const conflictBatchIds = new Set(
    tasks
      .filter((task) => task.status === "paused" && task.error === sftpTransferConflictError)
      .map((task) => task.batchId)
  );
  conflictBatchIds.forEach((batchId) => store.resolveBatchConflict(batchId, policy));
}

function signalQueued(origin?: DOMRect): void {
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
    :class="{ 'is-attracting': attracting, 'is-prominent': props.prominent }"
    data-sftp-tour="transfer-center"
  >
    <UButton
      class="sftp-transfer-trigger"
      :color="activeCount || props.prominent ? 'primary' : 'neutral'"
      :variant="activeCount || props.prominent ? 'soft' : 'ghost'"
      :size="props.prominent ? 'sm' : 'xs'"
      icon="i-lucide-cloud-upload"
      :label="t('koko.sftpTransferCenter.title')"
      @click="open = true"
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
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="sm" @click="open = false" />
      </div>
    </template>

    <template #body>
      <div class="flex shrink-0 items-center gap-1.5 flex-wrap border-b border-default px-3.5 py-2">
        <button
          v-for="item in taskFilters"
          :key="item.value"
          type="button"
          class="sftp-transfer-filter-chip"
          :class="{ on: filter === item.value }"
          :aria-pressed="filter === item.value"
          @click="filter = item.value"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>

      <div v-if="batches.length" class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5">
        <SftpTransferBatch
          v-for="batch in batches"
          :key="batch.id"
          :batch="batch"
          :expanded="expandedBatches.has(batch.id)"
          :expanded-targets="expandedTargets"
          @toggle="toggleBatch(batch.id)"
          @toggle-target="toggleTarget"
          @pause="pauseTasks"
          @resume="resumeTasks"
          @retry="retryTasks"
          @cancel="cancelDistribution"
          @cancel-target="cancelTarget"
          @resolve="resolveConflicts"
          @pause-task="store.pauseTask($event.id)"
          @resume-task="store.resumeTask($event.id)"
          @retry-task="store.retryTask($event.id)"
          @cancel-task="store.cancelTask($event.id)"
        />
      </div>

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
