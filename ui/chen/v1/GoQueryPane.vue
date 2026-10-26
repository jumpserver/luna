<script setup lang="ts">
import type { ChenGoApi, GoEditPlan, GoExecution, GoExportFormat, GoSession } from "./api";
import type { GoSqlEditorSnapshot } from "./sqlAi";
import type { QueryWorkspaceTab } from "./workspace";
import type { ChenSqlAiOperation } from "~/chen/composables/useChenSqlAiSessions";
import { useElementSize, useIntervalFn, useLocalStorage } from "@vueuse/core";
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenUnrestrictedMutations } from "~/chen/utils/sqlSafety";
import { executionActive, executionCanCancel } from "./api";
import { editDirty } from "./dataEditing";
import GoExportPanel from "./GoExportPanel.vue";
import GoWritePanel from "./GoWritePanel.vue";
import MonacoSqlEditor from "./MonacoSqlEditor.client.vue";
import { reviewTicketUrl } from "./review";
import { usePaneResize } from "./usePaneResize";

const props = defineProps<{
  query: QueryWorkspaceTab;
  session: GoSession;
  api: ChenGoApi;
  single: boolean;
  visible: boolean;
  reviewCoreSite?: string;
  aiAvailable?: boolean;
}>();
const emit = defineEmits<{
  sql: [value: string];
  applyEdits: [plan: GoEditPlan];
  uploadSql: [sql: string];
  refreshData: [];
  run: [sql: string, version: number];
  explain: [sql: string, version: number];
  cancel: [];
  review: [];
  confirmWarning: [executionId: string];
  export: [
    mode: "cached" | "query",
    format: GoExportFormat,
    snapshot: { sql: string; resultId: string; version: number }
  ];
  exportSync: [];
  exportCancel: [];
  exportDelete: [];
  ai: [operation: ChenSqlAiOperation];
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
  explain: () => void;
  format: () => void;
  insertText: (text: string) => void;
  snapshot: () => GoSqlEditorSnapshot;
  replaceDocument: (sql: string) => boolean;
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
const canExplain = computed(() =>
  ["mysql", "mariadb", "postgresql", "clickhouse", "oceanbase-mysql"].includes(props.session.dialect)
);
const ready = computed(() => props.session.state === "ready" && props.query.console?.state === "ready");
const active = computed(() => executionActive(props.query.execution));
const displayExecution = computed(() => props.query.resultExecution || props.query.execution);
const canSubmit = computed(
  () => ready.value && !active.value && !props.query.busy && !props.query.pending && !props.query.edit.busy
);
const canPolicySubmit = computed(
  () =>
    canSubmit.value &&
    (!props.query.executionEditPlan || props.query.edit.plan?.plan_id === props.query.executionEditPlan)
);
const analysisBusy = ref(false);
const writeConfirmation = ref<{ sql: string; version: number; consoleId: string } | null>(null);
const canRun = computed(() => canSubmit.value && !editDirty(props.query.edit) && !analysisBusy.value);
const waitingReview = computed(() => props.query.execution?.status === "waiting_review");
const reviewRequired = computed(
  () => props.query.execution?.status === "failed" && props.query.execution.error?.code === "command_review_required"
);
const warningRequired = computed(
  () =>
    props.query.execution?.status === "failed" &&
    props.query.execution.error?.code === "command_warning_confirmation_required"
);
const warningDialog = ref<{ id: string; sql: string } | null>(null);
function openWarning() {
  if (!canPolicySubmit.value || !warningRequired.value || !props.query.execution) return;
  warningDialog.value = { id: props.query.execution.id, sql: props.query.executionSql };
}
function confirmWarning() {
  const pending = warningDialog.value;
  warningDialog.value = null;
  if (pending && canPolicySubmit.value && warningRequired.value && props.query.execution?.id === pending.id)
    emit("confirmWarning", pending.id);
}
watch(
  () => props.query.execution?.id,
  () => {
    warningDialog.value = null;
  }
);
const cancellationUnsupported = computed(() => props.session.can_cancel === false && !waitingReview.value);
const ticketUrl = computed(() => reviewTicketUrl(props.query.execution?.review?.ticket_url, props.reviewCoreSite));
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
async function run(sql: string, version: number) {
  if (!canRun.value || !props.query.console) return;
  if (props.query.browseObject) {
    emit("refreshData");
    return;
  }
  const consoleId = props.query.console.id;
  analysisBusy.value = true;
  editorError.value = "";
  try {
    const analysis = await props.api.analyze(consoleId, sql, version);
    if (!canSubmit.value || editDirty(props.query.edit) || props.query.console?.id !== consoleId) return;
    // Parser classification informs confirmation; authorization is always enforced by Chen.
    if (analysis.statements.some((statement) => statement.may_write !== false))
      writeConfirmation.value = { sql, version, consoleId };
    else emit("run", sql, version);
  } catch (cause) {
    editorError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    analysisBusy.value = false;
  }
}
function confirmSql() {
  const snapshot = writeConfirmation.value;
  if (!snapshot || !canRun.value || props.query.console?.id !== snapshot.consoleId) return;
  writeConfirmation.value = null;
  emit("run", snapshot.sql, snapshot.version);
}
function explain(sql: string, version: number) {
  if (canRun.value && canExplain.value) emit("explain", sql, version);
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
const sqlFile = ref<HTMLInputElement>();
async function loadSqlFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !props.session.permissions.can_upload || !ready.value) return;
  if (file.size > 1024 * 1024) {
    editorError.value = t("Chen.GoWriteSqlFileLimit");
    return;
  }
  try {
    const sql = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!sql.trim() || sql.includes("\0")) throw new Error(t("Chen.GoWriteSqlFileInvalid"));
    if (props.session.permissions.can_upload && ready.value) emit("uploadSql", sql);
  } catch (cause) {
    editorError.value = cause instanceof Error ? cause.message : String(cause);
  }
}
function preventCopy(event: ClipboardEvent) {
  if (!props.session.permissions.can_copy) event.preventDefault();
}
defineExpose({
  snapshot: () => editor.value?.snapshot(),
  replaceDocument: (sql: string) => editor.value?.replaceDocument(sql) ?? false,
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
  <div
    class="flex h-full min-h-0 min-w-0 flex-col"
    data-chen-query
    :data-chen-execution-state="query.execution?.status || 'idle'"
  >
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <UButton
        v-if="session.state === 'ready' && !ready"
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
      <UTooltip :text="t(canExplain ? 'Chen.GoV1EstimatedPlanHint' : 'Chen.NotSupported')">
        <span class="inline-flex" :tabindex="canExplain ? undefined : 0">
          <UButton
            icon="i-lucide-workflow"
            :label="t('ExecutionPlan.explain')"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!canRun || !canExplain || !query.sql.trim()"
            @click="editor?.explain()"
          />
        </span>
      </UTooltip>
      <UTooltip :text="t(cancellationUnsupported ? 'Chen.GoV1CancelUnsupported' : 'Chen.GoV1CancelHint')">
        <span class="inline-flex" :tabindex="cancellationUnsupported ? 0 : undefined">
          <UButton
            icon="i-lucide-square"
            :label="t(waitingReview ? 'Chen.GoV1CancelReview' : 'Chen.GoV1Cancel')"
            size="xs"
            color="neutral"
            variant="soft"
            :title="t(cancellationUnsupported ? 'Chen.GoV1CancelUnsupported' : 'Chen.GoV1CancelHint')"
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
      <input ref="sqlFile" type="file" accept=".sql,text/plain,application/sql" class="hidden" @change="loadSqlFile" />
      <UButton
        v-if="session.permissions.can_upload"
        icon="i-lucide-file-up"
        :label="t('Chen.GoWriteOpenSql')"
        :title="t('Chen.GoWriteSqlFileLimit')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!ready"
        @click="sqlFile?.click()"
      />
      <UDropdownMenu
        v-if="!single && query.kind === 'query'"
        :items="[
          { label: t('RightPanel.SQLAIGenerate'), icon: 'i-lucide-sparkles', onSelect: () => emit('ai', 'generate') },
          {
            label: t('RightPanel.SQLAIExplain'),
            icon: 'i-lucide-message-square-text',
            onSelect: () => emit('ai', 'explain')
          },
          { label: t('RightPanel.SQLAIRepair'), icon: 'i-lucide-wrench', onSelect: () => emit('ai', 'repair') }
        ]"
      >
        <UButton
          label="SQL AI"
          icon="i-lucide-sparkles"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready"
          :title="aiAvailable ? undefined : t('RightPanel.SQLAIUnavailableDescription')"
        />
      </UDropdownMenu>
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
    <div
      v-if="!ready && session.state !== 'locked'"
      role="status"
      class="shrink-0 border-b border-default px-3 py-1.5 text-xs text-warning"
    >
      {{
        t(
          session.state === "closed"
            ? "Chen.GoV1SessionClosedDraft"
            : query.busy
              ? "Chen.GoV1Connecting"
              : "Chen.GoV1OfflineEditing"
        )
      }}
    </div>
    <div
      v-if="warningRequired"
      role="status"
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default bg-warning/5 px-3 py-2 text-xs"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" />
      <span>{{ t("Chen.GoV1WarningRequired") }}</span>
      <UButton
        :label="t('Chen.GoV1WarningReview')"
        icon="i-lucide-shield-alert"
        size="xs"
        color="warning"
        variant="soft"
        :disabled="!canPolicySubmit"
        @click="openWarning"
      />
    </div>
    <UModal
      :open="!!warningDialog"
      :title="t('Chen.GoV1WarningReview')"
      :description="t('Chen.GoV1WarningDescription')"
      @update:open="
        (value) => {
          if (!value) warningDialog = null;
        }
      "
    >
      <template #body>
        <pre
          class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs font-mono"
          :class="{ 'select-none': !session.permissions.can_copy }"
          @copy="preventCopy"
          >{{ warningDialog?.sql }}</pre>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Common.Cancel')" color="neutral" variant="soft" @click="warningDialog = null" />
          <UButton
            :label="t('Chen.GoV1WarningConfirm')"
            color="warning"
            :disabled="!canPolicySubmit || !warningRequired"
            @click="confirmWarning"
          />
        </div>
      </template>
    </UModal>
    <div
      v-if="reviewRequired || query.execution?.review"
      role="status"
      class="shrink-0 space-y-2 border-b border-default bg-warning/5 px-3 py-2 text-xs"
    >
      <div class="flex flex-wrap items-center gap-2">
        <UIcon name="i-lucide-shield-question" class="size-4 shrink-0 text-warning" />
        <span>
          {{ t(reviewRequired ? "Chen.GoV1ReviewRequired" : `Chen.GoV1Review_${query.execution!.review!.state}`) }}
        </span>
        <UButton
          v-if="reviewRequired"
          :label="t('Chen.GoV1SubmitReview')"
          icon="i-lucide-send"
          size="xs"
          color="warning"
          variant="soft"
          :disabled="!canPolicySubmit"
          @click="emit('review')"
        />
        <UButton
          v-if="ticketUrl"
          :to="ticketUrl"
          target="_blank"
          rel="noopener noreferrer"
          :label="t('Chen.GoV1ViewReview')"
          icon="i-lucide-external-link"
          size="xs"
          color="neutral"
          variant="link"
        />
      </div>
      <p v-if="reviewRequired || waitingReview" class="text-muted">{{ t("Chen.GoV1ReviewImmutable") }}</p>
      <p v-if="query.execution?.review?.reviewers?.length" class="text-muted">
        {{ t("Chen.GoV1Reviewers") }}: {{ query.execution.review.reviewers.join(", ") }}
      </p>
      <p v-if="query.execution?.review?.processor" class="text-muted">
        {{ t("Chen.GoV1ReviewProcessor") }}: {{ query.execution.review.processor }}
      </p>
      <details>
        <summary class="cursor-pointer text-muted">{{ t("Chen.GoV1ReviewSql") }}</summary>
        <pre class="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono">{{
          query.executionSql
        }}</pre>
      </details>
    </div>
    <p v-if="query.executionPlan" role="status" class="shrink-0 border-b border-default px-3 py-1.5 text-xs text-muted">
      {{ t("Chen.GoV1EstimatedPlanHint") }}
    </p>
    <UModal
      :open="!!writeConfirmation"
      :title="t('Chen.GoWriteSqlConfirm')"
      :ui="{ content: 'sm:max-w-4xl' }"
      @update:open="
        (value) => {
          if (!value) writeConfirmation = null;
        }
      "
    >
      <template #body>
        <div class="space-y-3" @copy.capture="preventCopy">
          <p class="text-sm">{{ t("Chen.GoWriteSqlConfirmHint") }}</p>
          <p
            v-if="writeConfirmation && chenUnrestrictedMutations(writeConfirmation.sql).length"
            class="text-sm text-error"
          >
            {{ t("Chen.ExecuteWithoutWhereDescription") }}
          </p>
          <pre class="max-h-[55vh] overflow-auto rounded bg-elevated p-3 font-ui-mono text-xs">{{
            writeConfirmation?.sql
          }}</pre>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="writeConfirmation = null" />
          <UButton :label="t('Chen.ApplyChanges')" :disabled="!canRun" @click="confirmSql" />
        </div>
      </template>
    </UModal>
    <div v-if="query.kind === 'preview'" class="shrink-0 border-b border-default px-3 py-1.5 text-xs text-muted">
      {{ t(query.browseObject ? "Chen.GoWriteBrowseHint" : "Chen.GoV1PreviewHint") }}
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
          @explain="explain"
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
              'text-error': query.execution?.status === 'failed' && !reviewRequired,
              'text-warning': query.execution?.status === 'unknown' || query.execution?.status === 'cancel_requested'
            }"
          >
            {{
              reviewRequired
                ? t("Chen.GoV1ReviewRequired")
                : query.execution
                  ? t(`Chen.GoV1Status_${query.execution.status}`)
                  : t("Chen.GoV1Ready")
            }}
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
            :disabled="query.loadingRows || editDirty(query.edit) || query.edit.busy"
            @click="emit('rows', query.resultId, Math.max(0, query.rows.offset - 200))"
          />
          <UButton
            v-if="query.rows?.next_offset !== undefined"
            icon="i-lucide-chevron-right"
            :aria-label="t('Chen.GoV1Next')"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="query.loadingRows || editDirty(query.edit) || query.edit.busy"
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
              :disabled="editDirty(query.edit) || query.edit.busy"
              @click="emit('rows', id)"
            />
          </div>
          <GoExportPanel
            v-if="query.resultId || query.exportJob"
            :query="query"
            :session="session"
            :api="api"
            :ready="ready && !editDirty(query.edit) && !query.edit.busy"
            @start="(mode, format, snapshot) => emit('export', mode, format, snapshot)"
            @sync="emit('exportSync')"
            @cancel="emit('exportCancel')"
            @remove="emit('exportDelete')"
          />
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
          v-if="query.execution?.error && !reviewRequired"
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
        <GoWritePanel
          v-if="query.rows"
          :key="query.rows.id"
          :query="query"
          :session="session"
          :api="api"
          class="min-h-0 flex-1"
          @apply="emit('applyEdits', $event)"
          @refresh="emit('refreshData')"
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
