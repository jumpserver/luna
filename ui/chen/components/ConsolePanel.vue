<script setup lang="ts">
import type {
  ChenConsoleExecutionStatus,
  ChenConsoleTimelineEntry,
  ChenConsoleTimelineResult,
  ChenPromptConsoleTab,
  ChenQueryLikeWorkspaceTab
} from "~/chen/types";

import ConsoleResultGrid from "~/chen/components/ConsoleResultGrid.client.vue";

const props = defineProps<{
  tab: ChenPromptConsoleTab;
  contextLabel: string;
  promptLabel: string;
  canCopy: boolean;
}>();

const emit = defineEmits<{
  run: [tab: ChenPromptConsoleTab];
  cancel: [tab: ChenQueryLikeWorkspaceTab];
  clear: [tab: ChenPromptConsoleTab];
  updatePendingSql: [tab: ChenPromptConsoleTab, value: string];
}>();

const timelineRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
let historyIndex: number | null = null;
let historyDraft = "";
let followLatest = true;

const pendingSqlValue = computed({
  get: () => props.tab.pendingSql,
  set: (value: string) => emit("updatePendingSql", props.tab, value)
});
const busy = computed(() =>
  Boolean(props.tab.state.loading || props.tab.state.inQuery || props.tab.activeTimelineEntryId)
);

const statusDetails: Record<ChenConsoleExecutionStatus, { icon: string; label: string; class: string }> = {
  running: { icon: "i-lucide-loader-circle", label: "Running", class: "animate-spin text-primary" },
  cancelling: { icon: "i-lucide-loader-circle", label: "Cancelling", class: "animate-spin text-warning" },
  success: { icon: "i-lucide-circle-check", label: "Completed", class: "text-success" },
  error: { icon: "i-lucide-circle-x", label: "Failed", class: "text-error" },
  cancelled: { icon: "i-lucide-ban", label: "Cancelled", class: "text-warning" }
};

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
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
    return `${shown} shown · truncated at ${limit}`;
  }
  const total = typeof result.state.total === "number" && result.state.total >= 0 ? result.state.total : shown;
  return total > shown ? `${shown} shown · ${total} total` : `${shown} ${shown === 1 ? "row" : "rows"}`;
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

defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--app-main-bg)]">
    <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-1.5 text-xs">
      <div class="flex min-w-0 items-center gap-2 text-muted">
        <UIcon name="i-lucide-square-terminal" class="size-4 text-primary" />
        <span class="truncate">{{ tab.state.currentContext || contextLabel || "Console" }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          v-if="tab.state.canCancel"
          icon="i-lucide-square"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Cancel query"
          @click="emit('cancel', tab)"
        />
        <UButton
          icon="i-lucide-eraser"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Clear console"
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
        Run a SQL statement to start the timeline.
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
            <span v-if="elapsed(entry)" class="shrink-0 tabular-nums text-muted">{{ elapsed(entry) }}</span>
          </header>

          <pre
            class="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-ui-mono text-[13px] leading-5 text-highlighted"
            >{{ entry.sql }}</pre>

          <div v-if="entry.logs.length" class="border-t border-default px-3 py-2 font-ui-mono text-xs text-muted">
            <div v-for="(log, logIndex) in entry.logs" :key="`${entry.id}:log:${logIndex}`">{{ log }}</div>
          </div>

          <div v-for="(result, resultIndex) in entry.results" :key="result.id" class="border-t border-default">
            <div class="flex items-center justify-between gap-3 bg-[var(--app-surface-panel)] px-3 py-1.5 text-[11px]">
              <span class="font-medium text-highlighted">Result {{ resultIndex + 1 }}</span>
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
            Waiting for results…
          </div>
        </article>
      </div>
    </div>

    <div
      class="flex shrink-0 items-start gap-2 border-t border-default bg-[var(--app-surface-panel)] px-3 py-2 font-ui-mono text-sm"
    >
      <span class="shrink-0 pt-1 text-primary">{{ promptLabel }}</span>
      <textarea
        ref="inputRef"
        v-model="pendingSqlValue"
        class="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 text-[var(--app-fg)] outline-none placeholder:text-[var(--app-muted)]"
        :disabled="busy"
        rows="1"
        placeholder="Enter SQL; press Cmd/Ctrl+Enter to run"
        spellcheck="false"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>
