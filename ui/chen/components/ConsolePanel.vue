<script setup lang="ts">
import type {
  ChenConsoleExecutionStatus,
  ChenConsoleTimelineEntry,
  ChenConsoleTimelineResult,
  ChenPromptConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenSqlEditorSnapshot
} from "~/chen/types";

import ConsoleResultGrid from "~/chen/components/ConsoleResultGrid.client.vue";
import ExecutionPlanTree from "~/chen/components/ExecutionPlanTree.vue";

const props = defineProps<{
  tab: ChenPromptConsoleTab;
  contextLabel: string;
  promptLabel: string;
  canCopy: boolean;
  aiEnabled: boolean;
}>();

const emit = defineEmits<{
  run: [tab: ChenPromptConsoleTab];
  cancel: [tab: ChenQueryLikeWorkspaceTab];
  clear: [tab: ChenPromptConsoleTab];
  updatePendingSql: [tab: ChenPromptConsoleTab, value: string];
  aiGenerate: [tab: ChenPromptConsoleTab];
  aiExplain: [tab: ChenPromptConsoleTab];
  aiRepair: [tab: ChenPromptConsoleTab];
  explainPlan: [tab: ChenPromptConsoleTab, sql: string, entryId?: string];
}>();

const { t } = useI18n();

const timelineRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const inputAreaHeight = ref(64);
let historyIndex: number | null = null;
let historyDraft = "";
let followLatest = true;
let resizeStartY = 0;
let resizeStartHeight = 0;

const MIN_INPUT_AREA_HEIGHT = 64;
const MAX_INPUT_AREA_HEIGHT = 192;

const pendingSqlValue = computed({
  get: () => props.tab.pendingSql,
  set: (value: string) => emit("updatePendingSql", props.tab, value)
});
const busy = computed(() => {
  const active = props.tab.timelineEntries.find((entry) => entry.id === props.tab.activeTimelineEntryId);
  return Boolean(
    props.tab.state.loading ||
    props.tab.state.inQuery ||
    active?.status === "running" ||
    active?.status === "cancelling"
  );
});
const statementEmpty = computed(() => !props.tab.pendingSql.trim());
const aiItems = computed(() => [
  {
    label: t("RightPanel.SQLAIGenerate"),
    icon: "i-lucide-wand-sparkles",
    disabled: !props.aiEnabled || busy.value,
    onSelect: () => emit("aiGenerate", props.tab)
  },
  {
    label: t("RightPanel.SQLAIExplain"),
    icon: "i-lucide-message-square-text",
    disabled: !props.aiEnabled || busy.value || statementEmpty.value,
    onSelect: () => emit("aiExplain", props.tab)
  },
  {
    label: t("RightPanel.SQLAIRepair"),
    icon: "i-lucide-wrench",
    disabled: !props.aiEnabled || busy.value || (statementEmpty.value && !props.tab.lastSqlError),
    onSelect: () => emit("aiRepair", props.tab)
  }
]);

function editorSnapshot(): ChenSqlEditorSnapshot {
  const documentSql = props.tab.pendingSql;
  const element = inputRef.value;
  const selectionFrom = element?.selectionStart ?? 0;
  const selectionTo = element?.selectionEnd ?? 0;
  const hasSelection = selectionTo > selectionFrom;
  return {
    documentSql,
    selectedSql: hasSelection ? documentSql.slice(selectionFrom, selectionTo) : "",
    selectionFrom: hasSelection ? selectionFrom : 0,
    selectionTo: hasSelection ? selectionTo : 0
  };
}

const statusDetails = computed<Record<ChenConsoleExecutionStatus, { icon: string; label: string; class: string }>>(
  () => ({
    running: { icon: "i-lucide-loader-circle", label: t("Chen.Running"), class: "animate-spin text-primary" },
    cancelling: { icon: "i-lucide-loader-circle", label: t("Chen.Cancelling"), class: "animate-spin text-warning" },
    success: { icon: "i-lucide-circle-check", label: t("Chen.Completed"), class: "text-success" },
    error: { icon: "i-lucide-circle-x", label: t("Chen.Failed"), class: "text-error" },
    cancelled: { icon: "i-lucide-ban", label: t("Chen.Cancelled"), class: "text-warning" }
  })
);

function run() {
  if (busy.value || !pendingSqlValue.value.trim()) return;
  historyIndex = null;
  historyDraft = "";
  followLatest = true;
  emit("run", props.tab);
}

function moveHistory(direction: -1 | 1) {
  const entries = props.tab.historyEntries;
  if (!entries.length) return;
  if (historyIndex === null) {
    if (direction > 0) return;
    historyDraft = pendingSqlValue.value;
    historyIndex = entries.length - 1;
  } else {
    historyIndex += direction;
    if (historyIndex < 0) historyIndex = 0;
    if (historyIndex >= entries.length) {
      historyIndex = null;
      pendingSqlValue.value = historyDraft;
      return;
    }
  }
  pendingSqlValue.value = entries[historyIndex]?.sql || "";
  nextTick(() => inputRef.value?.setSelectionRange(pendingSqlValue.value.length, pendingSqlValue.value.length));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    run();
    return;
  }
  if (event.key === "ArrowUp" && !event.shiftKey && inputRef.value?.selectionStart === 0) {
    event.preventDefault();
    moveHistory(-1);
    return;
  }
  if (event.key === "ArrowDown" && !event.shiftKey && inputRef.value?.selectionEnd === pendingSqlValue.value.length) {
    event.preventDefault();
    moveHistory(1);
  }
}

function beginInputAreaResize(event: PointerEvent) {
  if (event.button !== 0) return;
  resizeStartY = event.clientY;
  resizeStartHeight = inputAreaHeight.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}

function resizeInputArea(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  if (!target.hasPointerCapture(event.pointerId)) return;
  inputAreaHeight.value = Math.min(
    MAX_INPUT_AREA_HEIGHT,
    Math.max(MIN_INPUT_AREA_HEIGHT, resizeStartHeight + resizeStartY - event.clientY)
  );
}

function resizeInputAreaWithKeyboard(event: KeyboardEvent) {
  const delta = event.key === "ArrowUp" ? 16 : event.key === "ArrowDown" ? -16 : 0;
  if (!delta) return;
  inputAreaHeight.value = Math.min(
    MAX_INPUT_AREA_HEIGHT,
    Math.max(MIN_INPUT_AREA_HEIGHT, inputAreaHeight.value + delta)
  );
  event.preventDefault();
}

function clear() {
  if (busy.value) return;
  emit("clear", props.tab);
  inputRef.value?.focus();
}

function handleTimelineScroll() {
  const element = timelineRef.value;
  if (!element) return;
  followLatest = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}

function scrollToLatest() {
  if (!followLatest) return;
  nextTick(() => timelineRef.value?.scrollTo({ top: timelineRef.value.scrollHeight }));
}

function resultSummary(result: ChenConsoleTimelineResult) {
  const shown = result.data.data.length;
  if (result.state.truncated) {
    const limit =
      typeof result.state.rowLimit === "number" && result.state.rowLimit > 0 ? result.state.rowLimit : shown;
    return t("Chen.RowsShownTruncated", { shown, limit });
  }
  const total = typeof result.state.total === "number" && result.state.total >= 0 ? result.state.total : shown;
  return total > shown ? t("Chen.RowsShownTotal", { shown, total }) : t("Chen.RowCount", { count: shown });
}

function elapsed(entry: ChenConsoleTimelineEntry) {
  if (!entry.completedAt) return "";
  const milliseconds = Math.max(0, entry.completedAt - entry.startedAt);
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(2)} s`;
}

function gridHeight(result: ChenConsoleTimelineResult) {
  return `${Math.min(Math.max(result.data.data.length, 1), 8) * 28 + 33}px`;
}

watch(() => {
  const entry = props.tab.timelineEntries.at(-1);
  return [props.tab.timelineEntries.length, entry?.logs.length, entry?.results.length, entry?.status];
}, scrollToLatest);

watch(busy, (isBusy, wasBusy) => {
  if (!isBusy && wasBusy) nextTick(() => inputRef.value?.focus());
});

onMounted(() => {
  scrollToLatest();
  inputRef.value?.focus();
});

defineExpose({ focus: () => inputRef.value?.focus(), editorSnapshot });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--app-main-bg)]">
    <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-1.5 text-xs">
      <div class="flex min-w-0 items-center gap-2 text-muted">
        <UIcon name="i-lucide-square-terminal" class="size-4 text-primary" />
        <span class="truncate">{{ tab.state.currentContext || contextLabel || t("Chen.Console") }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UTooltip :text="t('RightPanel.SQLAIDisabledDescription')" :disabled="aiEnabled">
          <UDropdownMenu :items="aiItems">
            <UButton
              icon="i-lucide-sparkles"
              trailing-icon="i-lucide-chevron-down"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="!aiEnabled || busy"
            >
              AI
            </UButton>
          </UDropdownMenu>
        </UTooltip>
        <UButton
          icon="i-lucide-eraser"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('Chen.ClearConsole')"
          :disabled="busy"
          @click="clear"
        />
      </div>
    </div>

    <div ref="timelineRef" class="min-h-0 flex-1 overflow-auto px-3 py-3" @scroll="handleTimelineScroll">
      <div
        v-if="!tab.timelineEntries.length"
        class="flex h-full min-h-40 items-center justify-center text-xs text-muted"
      >
        {{ t("Chen.RunSqlForTimeline") }}
      </div>

      <div v-else class="mx-auto flex w-full max-w-[1200px] flex-col gap-3">
        <article
          v-for="(entry, entryIndex) in tab.timelineEntries"
          :key="entry.id"
          class="overflow-hidden rounded-md border border-default bg-[var(--app-surface-card-soft)]"
        >
          <header class="flex items-center justify-between gap-3 border-b border-default px-3 py-2 text-xs">
            <div class="flex min-w-0 items-center gap-2 font-medium text-highlighted">
              <span class="text-muted">#{{ entryIndex + 1 }}</span>
              <UIcon
                :name="statusDetails[entry.status].icon"
                class="size-3.5 shrink-0"
                :class="statusDetails[entry.status].class"
              />
              <span>{{ statusDetails[entry.status].label }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UButton
                v-if="entry.status === 'running' || entry.status === 'cancelling'"
                icon="i-lucide-square"
                size="sm"
                color="error"
                :disabled="entry.status === 'cancelling'"
                @click="emit('cancel', tab)"
              >
                {{ t("Chen.Stop") }}
              </UButton>
              <UButton
                v-else
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-git-fork"
                @click="emit('explainPlan', tab, entry.sql, entry.id)"
              >
                {{ t("ExecutionPlan.explain") }}
              </UButton>
              <span v-if="elapsed(entry)" class="tabular-nums text-muted">{{ elapsed(entry) }}</span>
            </div>
          </header>

          <pre
            class="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-ui-mono text-[13px] leading-5 text-highlighted"
            >{{ entry.sql }}</pre>

          <div v-if="entry.logs.length" class="border-t border-default px-3 py-2 font-ui-mono text-xs text-muted">
            <div v-for="(log, logIndex) in entry.logs" :key="`${entry.id}:log:${logIndex}`">{{ log }}</div>
          </div>

          <div v-if="entry.executionPlanLoading || entry.executionPlan" class="border-t border-default">
            <ExecutionPlanTree :plan="entry.executionPlan || null" :loading="entry.executionPlanLoading" />
          </div>

          <div v-for="(result, resultIndex) in entry.results" :key="result.id" class="border-t border-default">
            <div class="flex items-center justify-between gap-3 bg-[var(--app-surface-panel)] px-3 py-1.5 text-[11px]">
              <span class="font-medium text-highlighted">
                {{ t("Chen.ResultNumber", { number: resultIndex + 1 }) }}
              </span>
              <span class="text-muted">{{ resultSummary(result) }}</span>
            </div>
            <ConsoleResultGrid :dataset="result.data" :can-copy="canCopy" :style="{ height: gridHeight(result) }" />
          </div>

          <div
            v-if="
              (entry.status === 'running' || entry.status === 'cancelling') &&
              !entry.results.length &&
              !entry.logs.length
            "
            class="flex items-center gap-2 border-t border-default px-3 py-2 text-xs text-muted"
          >
            <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
            {{ t("Chen.WaitingForResults") }}
          </div>
        </article>
      </div>
    </div>

    <div
      class="relative flex shrink-0 items-start gap-2 border-t border-default bg-[var(--app-surface-panel)] px-3 py-2 font-ui-mono text-sm"
      :style="{ height: `${inputAreaHeight}px` }"
    >
      <div
        role="separator"
        tabindex="0"
        :aria-label="t('Chen.ResizeConsoleInput')"
        aria-orientation="horizontal"
        :aria-valuenow="inputAreaHeight"
        :aria-valuemin="MIN_INPUT_AREA_HEIGHT"
        :aria-valuemax="MAX_INPUT_AREA_HEIGHT"
        class="absolute inset-x-0 top-0 z-20 h-px cursor-row-resize touch-none bg-default/60 outline-none hover:bg-primary/60 focus-visible:bg-primary/60 active:bg-primary"
        @pointerdown="beginInputAreaResize"
        @pointermove.prevent="resizeInputArea"
        @keydown="resizeInputAreaWithKeyboard"
      >
        <div class="absolute -inset-y-1.5 inset-x-0" />
      </div>
      <span class="shrink-0 pt-3 text-primary">{{ promptLabel }}</span>
      <textarea
        ref="inputRef"
        v-model="pendingSqlValue"
        class="h-full min-h-12 flex-1 resize-none rounded-sm border border-default bg-transparent px-2 py-2 text-[var(--app-fg)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--app-muted)] focus:border-primary focus:ring-1 focus:ring-[var(--app-focus-ring)]"
        :disabled="busy"
        rows="1"
        :placeholder="t('Chen.ConsoleInputPlaceholder')"
        spellcheck="false"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>
