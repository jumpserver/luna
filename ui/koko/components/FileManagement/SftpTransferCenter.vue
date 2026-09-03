<script setup lang="ts">
import type { FileTransferConflictPolicy, FileTransferTask } from "@jumpserver/connectors-core";
import type { TableColumn } from "@nuxt/ui";
import type { TransferRateSample } from "#koko/utils/file-transfer/rate";
import prettyBytes from "pretty-bytes";
import SftpTransferActions from "#koko/components/FileManagement/transfer-center/SftpTransferActions.vue";
import {
  canPauseTransferTasks,
  canResumeTransferTasks,
  sftpTransferConflictError,
  sftpTransferErrorText,
  sftpTransferTerminalStatuses,
  useSftpTransferCenterSelectors
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";
import { useSftpTransferUi } from "#koko/composables/sftp/useSftpTransferUi";
import { useFileTransferStore } from "#koko/stores/fileTransfer";
import {
  bytesPerSecond,
  formatBytesPerSecond,
  formatRemaining,
  pushTransferRateSample,
  remainingSeconds
} from "#koko/utils/file-transfer/rate";
import {
  sftpTransferProgress,
  sftpTransferProgressColor,
  sftpTransferStatusClass
} from "#koko/utils/sftpTransferSummary";

const { t } = useI18n();
const store = useFileTransferStore();
const { open, setOpen, ensureRestored } = useSftpTransferUi();
const filter = ref<"all">("all");
const drawerHeight = useLocalStorage("jumpserver-client:sftp-transfer-center-height", 194);
const resizing = ref(false);
let resizeStartY = 0;
let resizeStartHeight = 194;

const { sftpTasks, hasFinishedTasks } = useSftpTransferCenterSelectors({
  tasks: () => store.tasks ?? [],
  filter
});
const activeTaskCount = computed(
  () => sftpTasks.value.filter((task) => !sftpTransferTerminalStatuses.has(task.status)).length
);
const attentionCount = computed(
  () =>
    sftpTasks.value.filter(
      (task) => task.status === "failed" || (task.status === "paused" && task.error === sftpTransferConflictError)
    ).length
);
const progress = computed(() => sftpTransferProgress(sftpTasks.value));
const drawerStyle = computed(() => ({ "--sftp-transfer-center-height": `${drawerHeight.value}px` }));
const samplesByTaskId = new Map<string, TransferRateSample[]>();
const columns = computed<TableColumn<FileTransferTask>[]>(() => [
  {
    id: "file",
    accessorFn: (task) => task.source.name,
    header: t("koko.sftpTransferCenter.columns.file"),
    meta: { class: { th: "w-[22%]", td: "w-[22%]" } }
  },
  {
    id: "direction",
    accessorFn: (task) => transferDirection(task),
    header: t("koko.sftpTransferCenter.columns.direction"),
    meta: { class: { th: "w-[24%]", td: "w-[24%]" } }
  },
  {
    id: "progress",
    accessorFn: (task) => transferProgress(task),
    header: t("koko.sftpTransferCenter.columns.progress"),
    meta: { class: { th: "w-[16%]", td: "w-[16%]" } }
  },
  {
    id: "rate",
    accessorFn: (task) => transferRateText(task),
    header: t("koko.sftpTransferCenter.columns.rate"),
    meta: { class: { th: "w-[18%]", td: "w-[18%]" } }
  },
  {
    id: "status",
    accessorFn: (task) => transferStatusText(task),
    header: t("koko.sftpTransferCenter.columns.status"),
    meta: { class: { th: "w-[12%]", td: "w-[12%]" } }
  },
  {
    id: "actions",
    header: t("Common.Actions"),
    meta: { class: { th: "w-[112px] text-right", td: "w-[112px]" } }
  }
]);

watch(
  () => sftpTasks.value.map((task) => [task.id, task.status, task.confirmedBytes] as const),
  (taskStates) => {
    const currentIds = new Set(taskStates.map(([id]) => id));
    for (const [id, status, confirmedBytes] of taskStates) {
      if (status !== "transferring") {
        samplesByTaskId.delete(id);
        continue;
      }
      samplesByTaskId.set(id, pushTransferRateSample(samplesByTaskId.get(id) || [], confirmedBytes));
    }
    for (const id of samplesByTaskId.keys()) {
      if (!currentIds.has(id)) samplesByTaskId.delete(id);
    }
  },
  { immediate: true }
);

function transferRowId(task: FileTransferTask): string {
  return task.id;
}

function transferDirection(task: FileTransferTask): string {
  return `${task.sourceEndpoint.label} → ${task.destinationEndpoint.label}`;
}

function transferProgress(task: FileTransferTask): number {
  if (task.status === "completed" || task.status === "skipped") return 100;
  if (!task.source.size) return 0;
  return Math.min(100, Math.round((task.confirmedBytes / task.source.size) * 100));
}

function transferStatusText(task: FileTransferTask): string {
  if (task.status === "transferring") {
    return `${t("FileTransfer.Status.transferring")} ${transferProgress(task)}%`;
  }
  if (task.status === "failed" && task.error) return sftpTransferErrorText(task.error, t);
  return t(`FileTransfer.Status.${task.status}`);
}

function transferRateText(task: FileTransferTask): string {
  if (task.status === "completed" || task.status === "skipped") return t("koko.sftpTransferCenter.justNow");
  if (task.status === "failed") {
    return t("FileTransfer.TransferredSize", { size: prettyBytes(task.confirmedBytes) });
  }
  if (task.status !== "transferring") return t("FileTransfer.IdleRate");
  const rate = bytesPerSecond(samplesByTaskId.get(task.id) || []);
  const remaining = remainingSeconds(task.source.size, task.confirmedBytes, rate);
  if (rate == null || remaining == null) return t("FileTransfer.IdleRate");
  return t("FileTransfer.SpeedRemaining", {
    speed: formatBytesPerSecond(rate),
    remaining: formatRemaining(remaining)
  });
}

function drawerHeightBounds() {
  if (!import.meta.client) return { min: 96, max: 420 };
  return { min: 96, max: Math.max(160, Math.min(520, Math.round(window.innerHeight * 0.62))) };
}

function clampDrawerHeight(value: number): number {
  const { min, max } = drawerHeightBounds();
  return Math.min(max, Math.max(min, Math.round(value)));
}

function onResizeMove(event: PointerEvent): void {
  if (!resizing.value) return;
  drawerHeight.value = clampDrawerHeight(resizeStartHeight + resizeStartY - event.clientY);
}

function stopResize(): void {
  if (!resizing.value || !import.meta.client) return;
  resizing.value = false;
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
}

function startResize(event: PointerEvent): void {
  if (!import.meta.client || event.button !== 0) return;
  event.preventDefault();
  resizeStartY = event.clientY;
  resizeStartHeight = drawerHeight.value;
  resizing.value = true;
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const step = event.shiftKey ? 32 : 8;
  if (event.key === "ArrowUp") drawerHeight.value = clampDrawerHeight(drawerHeight.value + step);
  else if (event.key === "ArrowDown") drawerHeight.value = clampDrawerHeight(drawerHeight.value - step);
  else if (event.key === "Home") drawerHeight.value = drawerHeightBounds().min;
  else if (event.key === "End") drawerHeight.value = drawerHeightBounds().max;
  else return;
  event.preventDefault();
}

function resolveConflict(task: FileTransferTask, policy: Exclude<FileTransferConflictPolicy, "ask">): void {
  store.resolveBatchConflict(task.batchId, policy);
}

function clearFinishedTransfers(): void {
  store.clearFinished(sftpTasks.value.map((task) => task.id));
}

onMounted(() => {
  drawerHeight.value = clampDrawerHeight(drawerHeight.value);
  void ensureRestored();
});

onBeforeUnmount(stopResize);
</script>

<template>
  <Transition name="sftp-transfer-dock">
    <aside
      v-if="open"
      id="sftp-transfer-center"
      class="sftp-transfer-center-drawer"
      :class="{ 'is-resizing': resizing }"
      :style="drawerStyle"
      role="region"
      :aria-label="t('koko.sftpTransferCenter.queueTitle')"
    >
      <div
        class="sftp-transfer-resize-handle"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-label="t('koko.sftpTransferCenter.resizeHandle')"
        :aria-valuemin="drawerHeightBounds().min"
        :aria-valuemax="drawerHeightBounds().max"
        :aria-valuenow="drawerHeight"
        @pointerdown="startResize"
        @keydown="resizeWithKeyboard"
      />

      <header class="sftp-transfer-drawer-header">
        <strong>{{ t("koko.sftpTransferCenter.queueTitle") }}</strong>
        <span class="sftp-transfer-drawer-summary">
          {{ t("koko.sftpTransferCenter.queueSummary", { active: activeTaskCount, attention: attentionCount }) }}
        </span>
        <UBadge v-if="attentionCount" color="warning" variant="soft" size="xs" :label="String(attentionCount)" />
        <UProgress
          class="sftp-transfer-drawer-progress"
          color="primary"
          size="xs"
          :model-value="progress"
          :ui="{ base: 'h-[3px]' }"
          :aria-label="t('koko.sftpTransferCenter.batchProgress')"
        />
        <span class="flex-1" />
        <UTooltip v-if="hasFinishedTasks" :text="t('FileTransfer.ClearFinished')">
          <UButton
            class="size-8 justify-center rounded-lg p-0"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="sm"
            :aria-label="t('FileTransfer.ClearFinished')"
            @click="clearFinishedTransfers"
          />
        </UTooltip>
        <UButton
          class="size-8 justify-center rounded-lg p-0"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          size="sm"
          :aria-label="t('koko.sftpTransferCenter.collapse')"
          @click="setOpen(false)"
        />
      </header>

      <div class="sftp-transfer-drawer-body">
        <UTable
          sticky
          class="sftp-transfer-table"
          :data="sftpTasks"
          :columns="columns"
          :get-row-id="transferRowId"
          :empty="t('FileTransfer.Empty')"
        >
          <template #file-cell="{ row }">
            <div class="sftp-transfer-table__file">
              <UIcon
                :name="
                  row.original.status === 'completed'
                    ? 'i-lucide-check'
                    : row.original.status === 'failed'
                      ? 'i-lucide-x-circle'
                      : 'i-lucide-file'
                "
                class="size-3 shrink-0 text-tertiary"
              />
              <span class="truncate" :title="row.original.source.name">{{ row.original.source.name }}</span>
            </div>
          </template>

          <template #direction-cell="{ row }">
            <span class="sftp-transfer-table__secondary" :title="transferDirection(row.original)">
              {{ transferDirection(row.original) }}
            </span>
          </template>

          <template #progress-cell="{ row }">
            <UProgress
              class="sftp-file-progress-bar"
              :color="sftpTransferProgressColor(row.original)"
              size="xs"
              :model-value="transferProgress(row.original)"
              :ui="{ base: 'h-[3px]' }"
              :aria-label="t('koko.sftpTransferCenter.fileProgress', { file: row.original.source.name })"
            />
          </template>

          <template #rate-cell="{ row }">
            <span class="sftp-transfer-table__secondary" :title="transferRateText(row.original)">
              {{ transferRateText(row.original) }}
            </span>
          </template>

          <template #status-cell="{ row }">
            <span
              class="sftp-transfer-table__status"
              :class="sftpTransferStatusClass(row.original.status)"
              :title="transferStatusText(row.original)"
            >
              {{ transferStatusText(row.original) }}
            </span>
          </template>

          <template #actions-cell="{ row }">
            <SftpTransferActions
              :task="row.original"
              :can-pause="canPauseTransferTasks([row.original])"
              :can-resume="canResumeTransferTasks([row.original])"
              @pause="store.pauseTask(row.original.id)"
              @retry="store.retryTask(row.original.id)"
              @resume="store.resumeTask(row.original.id)"
              @cancel="store.cancelTask(row.original.id)"
              @clear="store.clearFinished([row.original.id])"
              @resolve="resolveConflict(row.original, $event)"
            />
          </template>
        </UTable>
      </div>
    </aside>
  </Transition>
</template>
