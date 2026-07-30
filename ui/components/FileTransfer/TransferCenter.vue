<script setup lang="ts">
import { useFileTransferStore } from "~/store/modules/fileTransfer";

const { t } = useI18n();
const store = useFileTransferStore();

const collapsedStorageKey = "jumpserver:file-transfer:collapsed";
const positionStorageKey = "jumpserver:file-transfer:position";

const panel = ref<HTMLElement | null>(null);
const collapsed = ref(true);
const position = ref<{ x: number, y: number } | null>(null);
const dragging = ref(false);

const activeCount = computed(() => store.activeTasks.length);
const tasks = computed(() => store.tasks.slice().sort((left, right) => right.updatedAt - left.updatedAt));
const conflictTask = computed(() => store.conflictTask);
const panelStyle = computed(() =>
  position.value ? { left: `${position.value.x}px`, top: `${position.value.y}px` } : { bottom: "16px", right: "16px" }
);

let dragOffset = { x: 0, y: 0 };

function progress(task: (typeof store.tasks)[number]) {
  if (!task.source.size) return task.status === "completed" ? 100 : 0;

  return Math.round((task.confirmedBytes / task.source.size) * 100);
}

function clampPosition() {
  if (!position.value || !panel.value) return;

  const margin = 8;
  position.value = {
    x: Math.min(
      Math.max(margin, position.value.x),
      Math.max(margin, window.innerWidth - panel.value.offsetWidth - margin)
    ),
    y: Math.min(
      Math.max(margin, position.value.y),
      Math.max(margin, window.innerHeight - panel.value.offsetHeight - margin)
    )
  };
}

function persistPosition() {
  if (!position.value) return;
  localStorage.setItem(positionStorageKey, JSON.stringify(position.value));
}

function stopDragging() {
  if (!dragging.value) return;
  dragging.value = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopDragging);
  window.removeEventListener("pointercancel", stopDragging);
  persistPosition();
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  position.value = {
    x: event.clientX - dragOffset.x,
    y: event.clientY - dragOffset.y
  };
  clampPosition();
}

function startDragging(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement | null)?.closest("button")) return;
  const rect = panel.value?.getBoundingClientRect();
  if (!rect) return;
  event.preventDefault();
  position.value = { x: rect.left, y: rect.top };
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  dragging.value = true;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
}

function restorePosition() {
  const saved = localStorage.getItem(positionStorageKey);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved) as { x?: unknown, y?: unknown };
    if (
      typeof parsed.x === "number"
      && Number.isFinite(parsed.x)
      && typeof parsed.y === "number"
      && Number.isFinite(parsed.y)
    ) {
      position.value = { x: parsed.x, y: parsed.y };
    }
  } catch {
    localStorage.removeItem(positionStorageKey);
  }
}

onMounted(async () => {
  await store.restore();
  collapsed.value = localStorage.getItem(collapsedStorageKey) === "true";
  restorePosition();
  window.addEventListener("resize", clampPosition);
  await nextTick();
  clampPosition();
});

watch(collapsed, (value) => {
  if (!import.meta.client) return;
  localStorage.setItem(collapsedStorageKey, String(value));
  void nextTick(clampPosition);
});

onBeforeUnmount(() => {
  stopDragging();
  window.removeEventListener("resize", clampPosition);
});
</script>

<template>
  <section
    v-if="activeCount || tasks.length"
    ref="panel"
    :style="panelStyle"
    class="fixed z-50 w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-(--app-border) bg-(--app-panel-bg) shadow-lg"
  >
    <header
      class="flex h-11 touch-none select-none items-center gap-2 px-3"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      @pointerdown="startDragging"
    >
      <UIcon name="i-lucide-cloud-upload" class="size-4 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ activeCount ? t("FileTransfer.ActiveCount", { count: activeCount }) : t("FileTransfer.Title") }}
        </p>
      </div>
      <UButton
        v-if="!collapsed && tasks.some((task) => ['completed', 'skipped', 'failed', 'canceled'].includes(task.status))"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-list-x"
        :title="t('FileTransfer.ClearFinished')"
        @click="store.clearFinished"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="collapsed ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :title="collapsed ? t('FileTransfer.Expand') : t('FileTransfer.Collapse')"
        @click="collapsed = !collapsed"
      />
    </header>
    <div v-show="!collapsed" class="border-t border-(--app-border) p-2">
      <div class="max-h-80 space-y-2 overflow-y-auto">
        <article
          v-for="task in tasks"
          :key="task.id"
          class="rounded-md border border-(--app-border) bg-(--app-main-bg) p-2.5"
          :class="{ 'file-transfer-task--completed': task.status === 'completed' }"
        >
          <div class="flex items-start gap-2 text-xs">
            <UIcon
              :name="task.status === 'completed' ? 'i-lucide-circle-check' : 'i-lucide-file'"
              class="size-3.5 shrink-0"
              :class="task.status === 'completed' ? 'text-success' : 'text-(--app-muted)'"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate" :class="{ 'text-success': task.status === 'completed' }">
                {{ task.source.name }}
              </p>
              <p class="mt-0.5 truncate text-[10px] text-(--app-muted)">
                {{ task.sourceEndpoint.label }} → {{ task.destinationEndpoint.label }}
              </p>
            </div>
            <UBadge v-if="task.status === 'completed'" color="success" variant="subtle" size="xs" icon="i-lucide-check">
              {{ t(`FileTransfer.Status.${task.status}`) }}
            </UBadge>
            <span v-else class="shrink-0 text-[10px] text-(--app-muted)">
              {{ t(`FileTransfer.Status.${task.status}`) }}
            </span>
            <UButton
              v-if="!['completed', 'failed', 'skipped', 'canceled'].includes(task.status)"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :title="t('FileTransfer.Cancel')"
              @click="store.cancelTask(task.id)"
            />
          </div>
          <div
            v-if="!['completed', 'failed', 'skipped', 'canceled'].includes(task.status)"
            class="mt-2 flex items-center gap-2"
          >
            <UProgress class="min-w-0 flex-1" size="xs" :value="progress(task)" color="primary" />
            <span class="w-8 text-right font-ui-mono text-[10px] text-(--app-muted)">{{ progress(task) }}%</span>
          </div>
          <p v-if="task.error && task.error !== 'target_exists'" class="mt-1 truncate text-[11px] text-error">
            {{ task.error }}
          </p>
          <div v-if="task.status === 'paused' && task.error !== 'target_exists'" class="mt-1 flex justify-end">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-play"
              :title="t('FileTransfer.Resume')"
              @click="store.resumeTask(task.id)"
            />
          </div>
        </article>
      </div>
    </div>
  </section>
  <UModal
    :open="Boolean(conflictTask)"
    :title="t('FileTransfer.ConflictTitle')"
    :description="t('FileTransfer.ConflictDescription')"
    :ui="{ content: 'max-w-md' }"
    @update:open="
      (open) => {
        if (!open && conflictTask) store.cancelBatch(conflictTask.batchId);
      }
    "
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('FileTransfer.Cancel')"
        @click="conflictTask && store.cancelBatch(conflictTask.batchId)"
      />
      <UButton
        color="neutral"
        variant="soft"
        :label="t('FileTransfer.Skip')"
        @click="conflictTask && store.resolveBatchConflict(conflictTask.batchId, 'skip')"
      />
      <UButton
        color="primary"
        :label="t('FileTransfer.Overwrite')"
        @click="conflictTask && store.resolveBatchConflict(conflictTask.batchId, 'overwrite')"
      />
    </template>
  </UModal>
</template>

<style scoped>
.file-transfer-task--completed {
  border-color: color-mix(in srgb, var(--ui-success) 45%, var(--app-border));
  background: color-mix(in srgb, var(--ui-success) 10%, var(--app-main-bg));
}
</style>
