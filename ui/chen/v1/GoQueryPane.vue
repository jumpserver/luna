<script setup lang="ts">
import type { ChenGoApi, GoExecution, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { useElementSize, useIntervalFn, useLocalStorage } from "@vueuse/core";
import { executionActive, executionCanCancel } from "./api";
import GoResultGrid from "./GoResultGrid.client.vue";
import MonacoSqlEditor from "./MonacoSqlEditor.client.vue";
import { usePaneResize } from "./usePaneResize";

const props = defineProps<{
  query: QueryWorkspaceTab;
  session: GoSession;
  api: ChenGoApi;
  single: boolean;
  visible: boolean;
}>();
const emit = defineEmits<{
  sql: [value: string];
  run: [sql: string, version: number];
  cancel: [];
  recover: [];
  reconnect: [];
  rows: [id: string, offset?: number];
  retryRows: [];
  restore: [sql: string];
}>();
const { t } = useI18n();
const editor = ref<{
  focus: () => void;
  run: () => void;
  runAll: () => void;
  format: () => void;
  insertText: (text: string) => void;
} | null>(null);
const scope = ref("empty");
const editorError = ref("");
const maximized = ref<"editor" | "results" | null>(null);
const historyOpen = ref(false);
const history = ref<{ execution: GoExecution; sql: string }[]>([]);
watch(
  () => props.query.execution,
  (execution) => {
    if (!execution) return;
    const item = { execution: { ...execution }, sql: props.query.executionSql };
    const index = history.value.findIndex((entry) => entry.execution.id === execution.id);
    if (index < 0) history.value.unshift(item);
    else history.value[index] = item;
    history.value = history.value.slice(0, 50);
  },
  { deep: true }
);
const splitArea = ref<HTMLElement | null>(null);
const { height: splitHeight } = useElementSize(splitArea);
const editorId = useId();
const savedEditorPreference = useLocalStorage("jumpserver-client:chen-v1-editor-ratio", 60, { writeDefaults: false });
const editorPreference = ref(Number.isFinite(savedEditorPreference.value) ? savedEditorPreference.value : 60);
const availableHeight = computed(() => Math.max(0, splitHeight.value - 6));
const minEditorPercent = computed(() =>
  availableHeight.value ? Math.min(50, Math.max(15, 16000 / availableHeight.value)) : 15
);
const maxEditorPercent = computed(() => 100 - minEditorPercent.value);
const editorPercent = computed({
  get: () => Math.min(maxEditorPercent.value, Math.max(minEditorPercent.value, editorPreference.value)),
  set: (value: number) => {
    editorPreference.value = value;
    savedEditorPreference.value = value;
  }
});
const editorResize = usePaneResize({
  axis: "y",
  value: editorPercent,
  min: minEditorPercent,
  max: maxEditorPercent,
  defaultValue: 60,
  step: 2,
  pixelsPerUnit: () => availableHeight.value / 100,
  enabled: () => props.visible && !maximized.value
});
const ready = computed(() => props.session.state === "ready" && props.query.console?.state === "ready");
const active = computed(() => executionActive(props.query.execution));
const displayExecution = computed(() => props.query.resultExecution || props.query.execution);
const canRun = computed(() => ready.value && !active.value && !props.query.busy && !props.query.pending);
const now = ref(Date.now());
const clock = useIntervalFn(
  () => {
    now.value = Date.now();
  },
  250,
  { immediate: false }
);
watch(
  () => active.value && props.visible,
  (running) => {
    now.value = Date.now();
    if (running) clock.resume();
    else clock.pause();
  },
  { immediate: true }
);
function duration(execution: GoExecution | null) {
  if (!execution?.started_at) return "";
  const elapsed = Math.max(
    0,
    (execution.finished_at ? Date.parse(execution.finished_at) : now.value) - Date.parse(execution.started_at)
  );
  if (!Number.isFinite(elapsed)) return "";
  return elapsed < 1000 ? `${elapsed} ms` : `${(elapsed / 1000).toFixed(2)} s`;
}
function resultNumber(id: string, fallback: number) {
  const index = displayExecution.value?.statement_results.findIndex((result) => result.result_id === id) ?? -1;
  return index >= 0 ? index + 1 : fallback + 1;
}
function run(sql: string, version: number) {
  if (!canRun.value) return;
  editorError.value = "";
  emit("run", sql, version);
}
function restore(sql: string) {
  historyOpen.value = false;
  emit("restore", sql);
}
function maximize(pane: "editor" | "results") {
  maximized.value = maximized.value === pane ? null : pane;
}
const gridRows = computed(() =>
  maximized.value === "editor"
    ? "minmax(0, 1fr)"
    : maximized.value === "results"
      ? "minmax(0, 1fr)"
      : `minmax(0, ${editorPercent.value}fr) 6px minmax(0, ${100 - editorPercent.value}fr)`
);
function preventCopy(event: ClipboardEvent) {
  if (!props.session.permissions.can_copy) event.preventDefault();
}
defineExpose({
  focus: () => editor.value?.focus(),
  run: () => editor.value?.run(),
  insertText: (text: string) => {
    if (!props.session.permissions.can_paste || props.query.kind === "preview") return;
    maximized.value = null;
    editor.value?.insertText(text);
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col" data-chen-query>
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <UButton
        v-if="!ready"
        :label="t('Chen.GoV1NewConnection')"
        size="xs"
        color="warning"
        variant="soft"
        :disabled="session.state !== 'ready' || query.busy"
        @click="emit('reconnect')"
      />
      <UButton
        icon="i-lucide-play"
        :label="t(scope === 'selection' ? 'Chen.GoV1RunSelection' : 'Chen.GoV1RunCurrent')"
        size="xs"
        :disabled="!canRun || !query.sql.trim()"
        title="Ctrl/⌘ Enter"
        @click="editor?.run()"
      />
      <UButton
        icon="i-lucide-list-start"
        :label="t('Chen.GoV1RunAll')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!canRun || !query.sql.trim()"
        title="Ctrl/⌘ Shift Enter"
        @click="editor?.runAll()"
      />
      <UTooltip :text="t(session.can_cancel === false ? 'Chen.GoV1CancelUnsupported' : 'Chen.GoV1CancelHint')">
        <span class="inline-flex" :tabindex="session.can_cancel === false ? 0 : undefined">
          <UButton
            icon="i-lucide-square"
            :label="t('Chen.GoV1Cancel')"
            size="xs"
            color="neutral"
            variant="soft"
            :title="t(session.can_cancel === false ? 'Chen.GoV1CancelUnsupported' : 'Chen.GoV1CancelHint')"
            :disabled="!executionCanCancel(query.execution, session.can_cancel)"
            @click="emit('cancel')"
          />
        </span>
      </UTooltip>
      <UButton
        v-if="query.pending && !query.busy"
        :label="t('Chen.GoV1RecoverSubmission')"
        size="xs"
        color="warning"
        variant="soft"
        :disabled="!ready"
        @click="emit('recover')"
      />
      <UButton
        icon="i-lucide-align-left"
        :label="t('Chen.GoV1FormatSql')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="query.kind === 'preview' || !query.sql.trim()"
        title="Alt Shift F"
        @click="editor?.format()"
      />
      <UPopover v-model:open="historyOpen">
        <UButton
          icon="i-lucide-history"
          :label="t('Chen.GoV1QueryHistory')"
          size="xs"
          color="neutral"
          variant="ghost"
        />
        <template #content>
          <div
            class="w-96 max-w-[90vw] p-3"
            :class="{ 'select-none': !session.permissions.can_copy }"
            @copy.capture="preventCopy"
          >
            <p class="mb-2 text-xs text-muted">{{ t("Chen.GoV1HistoryHint") }}</p>
            <div class="max-h-80 space-y-2 overflow-auto">
              <p v-if="!history.length" class="py-3 text-xs text-muted">{{ t("Chen.GoV1HistoryEmpty") }}</p>
              <div v-for="item in history" :key="item.execution.id" class="rounded border border-default p-2">
                <div class="flex items-center gap-2 text-xs text-muted">
                  <span>{{ t(`Chen.GoV1Status_${item.execution.status}`) }}</span>
                  <span>{{ duration(item.execution) }}</span>
                  <time v-if="item.execution.started_at" class="ml-auto">
                    {{ new Date(item.execution.started_at).toLocaleTimeString() }}
                  </time>
                </div>
                <pre class="my-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs">{{ item.sql }}</pre>
                <UButton
                  :label="t('Chen.GoV1RestoreQuery')"
                  icon="i-lucide-file-plus"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :disabled="!session.permissions.can_paste || session.state !== 'ready'"
                  @click="restore(item.sql)"
                />
              </div>
            </div>
          </div>
        </template>
      </UPopover>
      <UPopover>
        <UButton
          class="ml-auto max-w-64"
          icon="i-lucide-database"
          :label="[query.context.database || t('Chen.GoV1Database'), query.context.schema].filter(Boolean).join(' / ')"
          :aria-label="t('Chen.GoV1ConnectionDetails')"
          :title="`${query.context.database} / ${query.context.schema}`"
          :ui="{ label: 'truncate' }"
          size="xs"
          color="neutral"
          variant="ghost"
        />
        <template #content>
          <div class="max-w-sm space-y-2 p-3 text-xs">
            <p class="font-medium">
              {{ query.context.database }}
              <template v-if="query.context.schema">/ {{ query.context.schema }}</template>
            </p>
            <p>{{ session.asset }} · {{ session.account }}</p>
            <p class="text-muted">{{ t("Chen.GoV1DedicatedConnection") }}</p>
            <p>{{ t("Chen.GoV1TransactionUnknown") }}</p>
            <p class="text-muted">{{ t("Chen.GoV1TransactionHint") }}</p>
          </div>
        </template>
      </UPopover>
      <UButton
        :icon="maximized === 'editor' ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
        :aria-label="t(maximized === 'editor' ? 'Chen.GoV1RestoreLayout' : 'Chen.GoV1MaximizeEditor')"
        :title="t(maximized === 'editor' ? 'Chen.GoV1RestoreLayout' : 'Chen.GoV1MaximizeEditor')"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="maximize('editor')"
      />
    </div>
    <div
      v-if="editorError"
      role="alert"
      class="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-words border-b border-default px-3 py-2 text-xs text-warning"
    >
      {{ editorError }}
    </div>
    <div
      v-if="query.error"
      role="alert"
      class="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-words border-b border-default px-3 py-2 text-xs text-error"
    >
      {{ query.error }}
    </div>
    <div v-if="!ready" role="status" class="shrink-0 border-b border-default px-3 py-1.5 text-xs text-warning">
      {{ query.busy ? t("Chen.GoV1Connecting") : t("Chen.GoV1OfflineEditing") }}
    </div>
    <div v-if="query.kind === 'preview'" class="shrink-0 border-b border-default px-3 py-1.5 text-xs text-muted">
      {{ t("Chen.GoV1PreviewHint") }}
    </div>
    <div ref="splitArea" class="grid min-h-0 min-w-0 flex-1" :style="{ gridTemplateRows: gridRows }">
      <div v-show="maximized !== 'results'" :id="editorId" class="min-h-0 min-w-0 overflow-hidden">
        <MonacoSqlEditor
          ref="editor"
          :model-value="query.sql"
          :dialect="session.dialect"
          :console-id="query.console?.id || ''"
          :api="api"
          :can-copy="session.permissions.can_copy"
          :can-paste="session.permissions.can_paste"
          :read-only="query.kind === 'preview'"
          :online="canRun"
          :visible="visible && maximized !== 'results'"
          @update:model-value="emit('sql', $event)"
          @run="run"
          @scope="scope = $event"
          @editor-error="editorError = $event"
        />
      </div>
      <div
        v-show="!maximized"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-label="t('Chen.ResizeSqlEditorResults')"
        :aria-controls="editorId"
        :aria-valuenow="Math.round(editorPercent)"
        :aria-valuemin="Math.round(minEditorPercent)"
        :aria-valuemax="Math.round(maxEditorPercent)"
        :aria-valuetext="`${Math.round(editorPercent)}%`"
        :title="`${t('Chen.ResizeSqlEditorResults')} · ${t('Chen.GoV1ResizeHint')}`"
        class="group relative z-10 cursor-row-resize touch-none bg-[var(--workspace-surface-sidebar)] outline-none hover:bg-primary/15 focus-visible:bg-primary/20"
        :class="{ 'bg-primary/20': editorResize.dragging.value }"
        @pointerdown="editorResize.begin"
        @pointermove="editorResize.move"
        @pointerup="editorResize.end"
        @pointercancel="editorResize.end"
        @lostpointercapture="editorResize.end"
        @keydown="editorResize.keydown"
        @dblclick="editorResize.reset"
      >
        <span
          class="pointer-events-none absolute inset-x-0 top-1/2 border-t border-default group-hover:border-primary group-focus-visible:border-primary"
        />
      </div>
      <div v-show="maximized !== 'editor'" class="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div class="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 text-xs">
          <UIcon
            v-if="active || query.busy || query.loadingRows"
            name="i-lucide-loader-circle"
            class="size-3.5 animate-spin"
          />
          <span
            :class="{
              'text-error': query.execution?.status === 'failed',
              'text-warning': query.execution?.status === 'unknown' || query.execution?.status === 'cancel_requested'
            }"
          >
            {{ query.execution ? t(`Chen.GoV1Status_${query.execution.status}`) : t("Chen.GoV1Ready") }}
          </span>
          <span v-if="duration(query.execution)" class="tabular-nums text-muted">{{ duration(query.execution) }}</span>
          <span v-if="query.loadingRows" class="text-muted">{{ t("Chen.GoV1FetchingRows") }}</span>
          <span
            v-if="query.execution"
            :title="t(single ? 'Chen.GoV1SingleAuditExplanation' : 'Chen.GoV1AuditExplanation')"
            :class="query.execution.audit_status === 'failed' ? 'text-error' : 'text-muted'"
          >
            {{ t("Chen.GoV1Audit") }}: {{ t(`Chen.GoV1Audit_${query.execution.audit_status}`) }}
          </span>
          <span v-if="query.execution?.status === 'unknown'" class="text-warning">{{ t("Chen.GoV1DoNotRetry") }}</span>
          <span v-if="query.resultExecution && query.resultExecution.id !== query.execution?.id" class="text-warning">
            {{ t("Chen.GoV1PreviousResult") }}
          </span>
          <span v-if="query.rows" class="ml-auto text-muted">
            {{ query.rows.rows.length ? query.rows.offset + 1 : 0 }}–{{ query.rows.offset + query.rows.rows.length }} /
            {{ query.rows.total_rows }}{{ query.rows.truncated ? "+" : "" }} {{ t("Chen.GoV1RowsUnit") }}
          </span>
          <UButton
            v-if="query.rows && query.rows.offset > 0"
            icon="i-lucide-chevron-left"
            :aria-label="t('Chen.GoV1Previous')"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="query.loadingRows"
            @click="emit('rows', query.resultId, Math.max(0, query.rows.offset - 200))"
          />
          <UButton
            v-if="query.rows?.next_offset !== undefined"
            icon="i-lucide-chevron-right"
            :aria-label="t('Chen.GoV1Next')"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="query.loadingRows"
            @click="emit('rows', query.resultId, query.rows.next_offset)"
          />
          <UButton
            :class="{ 'ml-auto': !query.rows }"
            :icon="maximized === 'results' ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            :aria-label="t(maximized === 'results' ? 'Chen.GoV1RestoreLayout' : 'Chen.GoV1MaximizeResults')"
            :title="t(maximized === 'results' ? 'Chen.GoV1RestoreLayout' : 'Chen.GoV1MaximizeResults')"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="maximize('results')"
          />
        </div>
        <div
          v-if="displayExecution?.result_ids.length"
          role="group"
          :aria-label="t('Chen.GoV1Result')"
          class="flex min-w-0 shrink-0 items-center gap-1 border-b border-default px-2 py-1"
        >
          <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            <UButton
              v-for="(id, index) in displayExecution!.result_ids"
              :key="id"
              :label="`${t('Chen.GoV1Result')} ${resultNumber(id, index)}`"
              :aria-pressed="id === query.resultId"
              class="shrink-0"
              :variant="id === query.resultId ? 'soft' : 'ghost'"
              size="xs"
              color="neutral"
              @click="emit('rows', id)"
            />
          </div>
          <UPopover v-if="query.resultExecution">
            <UButton
              icon="i-lucide-code"
              label="SQL"
              :aria-label="t('Chen.GoV1ResultSource')"
              :title="t('Chen.GoV1ResultSource')"
              class="shrink-0"
              size="xs"
              color="neutral"
              variant="ghost"
            />
            <template #content>
              <div class="w-[32rem] max-w-[90vw] p-3 text-xs">
                <p class="mb-2 text-muted" :title="query.resultExecution.id">
                  {{ t("Chen.GoV1ResultSource") }}
                  <time v-if="query.resultExecution.started_at">
                    · {{ new Date(query.resultExecution.started_at).toLocaleTimeString() }}
                  </time>
                </p>
                <pre
                  class="max-h-80 overflow-auto whitespace-pre-wrap break-words"
                  :class="{ 'select-none': !session.permissions.can_copy }"
                  @copy="preventCopy"
                  >{{ query.resultSql }}</pre>
              </div>
            </template>
          </UPopover>
        </div>
        <div
          v-if="query.execution?.error"
          role="alert"
          class="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-ui-mono text-xs text-error"
        >
          {{ query.execution.error.code }} · {{ query.execution.error.message }}
        </div>
        <div
          v-if="query.resultLoadError"
          role="alert"
          class="flex max-h-32 shrink-0 items-start gap-2 overflow-auto border-b border-default px-3 py-2 text-xs text-warning"
        >
          <div class="min-w-0 flex-1 whitespace-pre-wrap break-words">
            <p>{{ t("Chen.GoV1ResultLoadFailed") }}</p>
            <p class="mt-1 text-muted">{{ query.resultLoadError.message }}</p>
          </div>
          <UButton
            :label="t('Chen.GoV1RetryResult')"
            class="shrink-0"
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="!ready || query.loadingRows"
            @click="emit('retryRows')"
          />
        </div>
        <GoResultGrid
          v-if="query.rows"
          :key="query.rows.id"
          :rows="query.rows"
          :can-copy="session.permissions.can_copy"
          class="min-h-0 flex-1"
        />
        <div v-else class="min-h-0 flex-1 overflow-auto p-3 text-xs text-muted">
          <p v-for="(result, index) in query.execution?.statement_results || []" :key="index">
            {{ result.rows_affected !== undefined ? `${t("Chen.GoV1RowsAffected")}: ${result.rows_affected}` : "" }}
          </p>
          <p v-if="!query.execution">{{ t("Chen.GoV1ReadyHint") }}</p>
          <p v-else-if="query.execution.status === 'succeeded' && !query.execution.result_ids.length">
            {{ t("Chen.GoV1NoResultSet") }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
