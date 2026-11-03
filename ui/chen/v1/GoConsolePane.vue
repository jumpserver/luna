<script setup lang="ts">
import type { ChenGoApi, GoRows, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import type { ChenSqlAiOperation } from "~/chen/composables/useChenSqlAiSessions";
import type { ChenConsoleTimelineEntry, ChenPromptConsoleTab } from "~/chen/types";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ConsolePanel from "~/chen/components/ConsolePanel.vue";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { formatChenSql } from "~/chen/utils/sqlFormat";
import { executionActive, executionCanCancel } from "./api";

const props = defineProps<{
  query: QueryWorkspaceTab;
  session: GoSession;
  api: ChenGoApi;
  disabled: boolean;
  visible: boolean;
  aiAvailable?: boolean;
  canExplain: boolean;
}>();
const emit = defineEmits<{
  sql: [sql: string];
  run: [sql: string, version: number];
  explain: [sql: string, version: number];
  cancel: [];
  ai: [operation: ChenSqlAiOperation];
}>();
const { t } = useI18n();
const panel = ref<InstanceType<typeof ConsolePanel>>();
const revision = ref(1);
watch(
  () => props.query.sql,
  () => revision.value++,
  { flush: "sync" }
);
const timeline = reactive<ChenConsoleTimelineEntry[]>([]);
const history = reactive<{ id: string; sql: string }[]>([]);
const loadingResults = new Set<string>();
let generation = 0;
let disposed = false;
let clearedExecution = "";
// ponytail: keep bounded in-memory history; persistent or full-result history belongs in a server-backed store.
const MAX_ENTRIES = 50;
const MAX_BYTES = 8 * 1024 * 1024;
const sizes = new Map<string, number>();
function trimHistory() {
  while (
    timeline.length > MAX_ENTRIES ||
    (timeline.length > 1 && [...sizes.values()].reduce((a, b) => a + b, 0) > MAX_BYTES)
  ) {
    const removed = timeline.shift()!;
    sizes.delete(removed.id);
  }
}
const tab = computed<ChenPromptConsoleTab>(() => ({
  id: props.query.id,
  kind: "console",
  title: props.query.title,
  nodeKey: props.query.console?.id || "",
  pendingSql: props.query.sql,
  aiRevision: revision.value,
  lastSqlError: null,
  timelineEntries: timeline,
  activeTimelineEntryId: props.query.execution?.id || "",
  state: { inQuery: executionActive(props.query.execution), loading: props.query.busy },
  logs: [],
  message: null,
  historyEntries: history,
  socket: null,
  connectionGeneration: generation
}));
const context = computed(() => props.query.context.schema || props.query.context.database);
function snapshot() {
  const current = panel.value?.editorSnapshot();
  return {
    documentSql: props.query.sql,
    selectedSql: current?.selectedSql || "",
    selectionFrom: current?.selectionFrom || 0,
    selectionTo: current?.selectionTo || 0,
    revision: revision.value
  };
}
function run() {
  if (!props.disabled && props.query.sql.trim()) emit("run", props.query.sql, revision.value);
}
function resetTimeline() {
  clearedExecution = props.query.execution?.id || "";
  generation++;
  timeline.splice(0);
  sizes.clear();
  loadingResults.clear();
}
function clear() {
  if (!executionActive(props.query.execution) && !props.query.busy) resetTimeline();
}
async function loadResult(entry: ChenConsoleTimelineEntry, id: string) {
  const key = `${entry.id}:${id}`;
  if (loadingResults.has(key) || entry.results.some((result) => result.id === id)) return;
  loadingResults.add(key);
  const current = generation;
  try {
    const rows: GoRows = props.query.rows?.id === id ? props.query.rows : await props.api.rows(id, 0, 200);
    if (disposed || current !== generation || !timeline.includes(entry)) return;
    const fields = rows.columns.map((column, index) => ({
      name: `column_${index}`,
      label: column.name,
      type: column.data_type
    }));
    const data: Record<string, unknown>[] = [];
    let bytes = sizes.get(entry.id) || 0;
    for (const row of rows.rows.slice(0, 200)) {
      const size = new TextEncoder().encode(JSON.stringify(row)).length;
      if (bytes + size > MAX_BYTES) break;
      data.push(Object.fromEntries(fields.map((field, index) => [field.name, row[index]])));
      bytes += size;
    }
    sizes.set(entry.id, bytes);
    entry.results.push({
      id,
      data: { fields, data },
      state: {
        total: rows.total_rows,
        truncated: rows.truncated || rows.total_rows > data.length || rows.rows.length > data.length,
        rowLimit: data.length
      }
    });
    trimHistory();
  } catch (cause) {
    if (!disposed && current === generation && timeline.includes(entry)) {
      const message = chenErrorText(cause, t);
      if (!entry.logs.includes(message)) entry.logs.push(message);
    }
  } finally {
    if (current === generation) loadingResults.delete(key);
  }
}
watch(
  () => [props.query.console?.id, props.session.id],
  () => {
    resetTimeline();
    history.splice(0);
  }
);
watch(
  () => [props.query.execution, props.query.execution?.status, props.query.execution?.result_ids.join(",")],
  () => {
    const execution = props.query.execution;
    if (!execution || execution.id === clearedExecution || execution.console_id !== props.query.console?.id) return;
    let entry = timeline.find((item) => item.id === execution.id);
    if (!entry) {
      entry = reactive<ChenConsoleTimelineEntry>({
        id: execution.id,
        sql: props.query.executionSql,
        status: "running",
        startedAt: execution.started_at ? Date.parse(execution.started_at) : Date.now(),
        logs: [],
        results: [],
        planOnly: !!execution.plan
      });
      timeline.push(entry);
      sizes.set(entry.id, new TextEncoder().encode(entry.sql).length);
      if (!execution.plan) {
        history.push({ id: entry.id, sql: entry.sql });
        if (history.length > MAX_ENTRIES) history.shift();
        if (props.query.sql === entry.sql) emit("sql", "");
      }
      trimHistory();
    }
    entry.status =
      execution.status === "succeeded"
        ? "success"
        : execution.status === "canceled"
          ? "cancelled"
          : execution.status === "cancel_requested"
            ? "cancelling"
            : executionActive(execution)
              ? "running"
              : "error";
    if (!executionActive(execution))
      entry.completedAt = execution.finished_at ? Date.parse(execution.finished_at) : Date.now();
    const logs = execution.error ? [chenErrorText(execution.error, t)] : [];
    if (execution.status === "unknown") logs.push(t("Chen.GoV1DoNotRetry"));
    if (execution.audit_status === "failed") logs.push(`${t("Chen.GoV1Audit")}: ${t("Chen.GoV1Audit_failed")}`);
    for (const result of execution.statement_results) {
      if (result.rows_affected !== undefined) logs.push(`${t("Chen.GoV1RowsAffected")}: ${result.rows_affected}`);
    }
    for (const message of logs) if (!entry.logs.includes(message)) entry.logs.push(message);
    for (const id of execution.result_ids) void loadResult(entry, id);
  },
  { immediate: true }
);
watch(
  () => [props.query.plan, props.query.planAttempt, props.query.loadingPlan, props.query.planLoadError],
  () => {
    const entry = timeline.find((item) => item.id === props.query.execution?.id);
    if (!entry?.planOnly) return;
    entry.executionPlanLoading = props.query.loadingPlan || executionActive(props.query.execution);
    const plan = props.query.planAttempt || props.query.plan;
    if (plan?.executionId === entry.id) entry.executionPlan = plan;
    if (props.query.planLoadError && !entry.logs.includes(props.query.planLoadError))
      entry.logs.push(props.query.planLoadError);
  },
  { immediate: true }
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) nextTick(() => panel.value?.focus());
  }
);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
function replaceDocument(sql: string) {
  if (!props.session.permissions.can_paste || props.disabled) return false;
  emit("sql", sql);
  return true;
}
function insertText(text: string) {
  const current = snapshot();
  const from = current.selectedSql ? current.selectionFrom : current.documentSql.length;
  const to = current.selectedSql ? current.selectionTo : from;
  replaceDocument(current.documentSql.slice(0, from) + text + current.documentSql.slice(to));
}
defineExpose({
  snapshot,
  focus: () => panel.value?.focus(),
  replaceDocument,
  insertText,
  appendText: (text: string) => replaceDocument(`${props.query.sql}${text}`),
  run,
  runAll: run,
  explain: () => emit("explain", props.query.sql, revision.value),
  format: () => replaceDocument(formatChenSql(props.query.sql, props.session.dialect))
});
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-chen-prompt-console
    @copy.capture="
      (event) => {
        if (!session.permissions.can_copy) event.preventDefault();
      }
    "
    @paste.capture="
      (event) => {
        if (!session.permissions.can_paste) event.preventDefault();
      }
    "
  >
    <ConsolePanel
      ref="panel"
      :tab="tab"
      :context-label="context"
      :prompt-label="`${context || 'SQL'}>`"
      :can-copy="session.permissions.can_copy"
      :ai-enabled="!!aiAvailable"
      :disabled="disabled"
      :can-cancel="executionCanCancel(query.execution, session.can_cancel)"
      :can-explain="canExplain"
      @update-pending-sql="(_tab, sql) => emit('sql', sql)"
      @run="run"
      @clear="clear"
      @cancel="emit('cancel')"
      @explain-plan="(_tab, sql) => emit('explain', sql, revision)"
      @ai-generate="emit('ai', 'generate')"
      @ai-explain="emit('ai', 'explain')"
      @ai-repair="emit('ai', 'repair')"
    />
  </div>
</template>
