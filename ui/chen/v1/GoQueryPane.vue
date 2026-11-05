<script setup lang="ts">
import type {
  ChenGoApi,
  GoBrowseRequest,
  GoEditPlan,
  GoExecution,
  GoExportFormat,
  GoQueryPageRequest,
  GoRows,
  GoSession,
  GoTransactionRequest
} from "./api";
import type { GoSqlEditorSnapshot } from "./sqlAi";
import type { GoResultLoadingSettings, QueryPlanRun, QueryWorkspaceTab } from "./workspace";
import type { ChenSqlAiOperation } from "~/chen/composables/useChenSqlAiSessions";
import type { ChenSqlSnippet } from "~/chen/composables/useChenSqlSnippets";
import type { ChenSqlKeywordCase } from "~/chen/composables/useChenWorkspacePreferences";
import { createReusableTemplate, useElementSize, useIntervalFn, useLocalStorage } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import ExecutionPlanTree from "~/chen/components/ExecutionPlanTree.vue";
import SqlSnippetSaveDialog from "~/chen/components/SqlSnippetSaveDialog.vue";
import SqlSnippetSelectDialog from "~/chen/components/SqlSnippetSelectDialog.vue";
import { useChenSqlSnippets } from "~/chen/composables/useChenSqlSnippets";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { chenSqlDialect } from "~/chen/utils/sqlDialect";
import { chenUnrestrictedMutations } from "~/chen/utils/sqlSafety";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { executionActive, executionCanCancel } from "./api";
import { editDirty } from "./dataEditing";
import GoBrowseFooter from "./GoBrowseFooter.vue";
import GoBrowsePanel from "./GoBrowsePanel.vue";
import GoConsolePane from "./GoConsolePane.vue";
import GoExportPanel from "./GoExportPanel.vue";
import GoQueryPagePanel from "./GoQueryPagePanel.vue";
import GoResultGrid from "./GoResultGrid.client.vue";
import GoResultSql from "./GoResultSql.vue";
import GoTransactionControls from "./GoTransactionControls.vue";
import GoWritePanel from "./GoWritePanel.vue";
import MonacoSqlEditor from "./MonacoSqlEditor.client.vue";
import { queryResultTitle } from "./resultPresentation";
import { reviewTicketUrl } from "./review";
import { usePaneResize } from "./usePaneResize";
import { hasMoreResultRows, loadQueryPlan, resultLoadingLocked } from "./workspace";

const props = defineProps<{
  query: QueryWorkspaceTab;
  session: GoSession;
  api: ChenGoApi;
  single: boolean;
  visible: boolean;
  dataOnly?: boolean;
  reviewCoreSite?: string;
  aiAvailable?: boolean;
  sqlKeywordCase?: ChenSqlKeywordCase;
}>();
const emit = defineEmits<{
  sql: [value: string];
  applyEdits: [plan: GoEditPlan];
  uploadSql: [sql: string];
  refreshData: [];
  browse: [request: GoBrowseRequest];
  queryPage: [request: GoQueryPageRequest];
  cachedResult: [];
  loadingSettings: [settings: GoResultLoadingSettings];
  loadMore: [automatic: boolean];
  run: [sql: string, version: number];
  explain: [sql: string, version: number];
  cancel: [];
  review: [];
  confirmWarning: [executionId: string];
  transaction: [request: GoTransactionRequest];
  confirmImplicit: [executionId: string];
  export: [
    mode: "cached" | "query",
    format: GoExportFormat,
    snapshot: { sql: string; resultId: string; version: number; rows?: number }
  ];
  exportSync: [];
  exportCancel: [];
  exportDelete: [];
  ai: [operation: ChenSqlAiOperation];
  recover: [];
  reconnect: [];
  newContext: [context: { database: string; schema: string }];
  rows: [id: string, offset?: number];
  retryRows: [];
  pane: [value: QueryWorkspaceTab["resultPane"]];
  closePlan: [number: number];
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
  appendText: (text: string) => boolean;
  snapshot: () => GoSqlEditorSnapshot;
  replaceDocument: (sql: string) => boolean;
} | null>(null);
const coreUser = useUserInfoStore();
const toast = useToast();
const coreIdentity = () =>
  JSON.stringify([coreUser.currentAccountId, coreUser.currentSite, coreUser.currentUser?.userId, coreUser.orgId]);
// Bind this query to its original Core account/organization; Chen credentials are never used here.
const originalCoreIdentity = coreIdentity();
const snippetUnavailable = computed(() => {
  if (!coreUser.loggedIn) return t("Chen.GoSnippetNoCore");
  if (
    coreIdentity() !== originalCoreIdentity ||
    (props.reviewCoreSite && props.reviewCoreSite !== coreUser.currentSite)
  )
    return t("Chen.GoSnippetCoreChanged");
  // Core AdHocModules has no aliases for other Chen dialects.
  if (!["mysql", "mariadb", "postgresql", "sqlserver", "oracle"].includes(props.session.dialect))
    return t("Chen.GoSnippetUnsupported", { dialect: props.session.dialect });
  return "";
});
const snippetsAvailable = computed(() => !snippetUnavailable.value && props.visible && props.session.state === "ready");
const canSaveSnippet = computed(() => snippetsAvailable.value && props.session.permissions.can_copy);
const canInsertSnippet = computed(
  () => snippetsAvailable.value && props.session.permissions.can_paste && props.query.kind !== "preview"
);
const sqlSnippets = useChenSqlSnippets(() => props.session.dialect);
const saveSnippetOpen = ref(false);
const selectSnippetOpen = ref(false);
const snippetError = ref("");
let snippetGeneration = 0;
function resetSnippets() {
  snippetGeneration += 1;
  saveSnippetOpen.value = false;
  selectSnippetOpen.value = false;
  snippetError.value = "";
  sqlSnippets.reset();
}
watch(
  () => [
    props.query.id,
    props.query.kind,
    props.session.id,
    props.session.dialect,
    props.session.state,
    props.visible,
    coreIdentity(),
    coreUser.loggedIn,
    props.session.permissions.can_copy,
    props.session.permissions.can_paste
  ],
  resetSnippets,
  { flush: "sync" }
);
onBeforeUnmount(resetSnippets);

async function loadSnippetPage(page: number) {
  if (!snippetsAvailable.value || sqlSnippets.deletingId.value) return;
  const generation = snippetGeneration;
  snippetError.value = "";
  try {
    await sqlSnippets.load(page);
  } catch (cause) {
    if (generation === snippetGeneration) snippetError.value = `${t("Chen.LoadSqlFailed")}: ${chenErrorText(cause, t)}`;
  }
}
function openSnippets() {
  if (!snippetsAvailable.value) return;
  selectSnippetOpen.value = true;
  void loadSnippetPage(1);
}
function openSaveSnippet() {
  if (!canSaveSnippet.value || sqlSnippets.saving.value) return;
  snippetError.value = "";
  saveSnippetOpen.value = true;
}
async function saveSnippet(name: string) {
  if (!saveSnippetOpen.value || !canSaveSnippet.value || sqlSnippets.saving.value) return;
  const sql = editor.value?.snapshot().documentSql ?? props.query.sql;
  if (!name.trim() || !sql.trim()) {
    snippetError.value = t("Chen.GoSnippetRequired");
    return;
  }
  if ([...name.trim()].length > 128 || [...sql].length > 65536) {
    snippetError.value = t("Chen.GoSnippetLimit");
    return;
  }
  const generation = snippetGeneration;
  snippetError.value = "";
  try {
    await sqlSnippets.save(name.trim(), sql);
    if (generation !== snippetGeneration) return;
    saveSnippetOpen.value = false;
    toast.add({ title: t("Chen.SaveSucceeded"), color: "success" });
  } catch (cause) {
    if (generation === snippetGeneration) snippetError.value = `${t("Chen.SaveSqlFailed")}: ${chenErrorText(cause, t)}`;
  }
}
function insertSnippet(snippet: ChenSqlSnippet) {
  if (
    !selectSnippetOpen.value ||
    !canInsertSnippet.value ||
    sqlSnippets.loading.value ||
    sqlSnippets.deletingId.value ||
    !sqlSnippets.snippets.value.includes(snippet) ||
    snippet.module !== props.session.dialect
  )
    return;
  if (editor.value?.appendText(snippet.args)) {
    selectSnippetOpen.value = false;
  }
}
async function deleteSnippet(snippet: ChenSqlSnippet) {
  if (
    !selectSnippetOpen.value ||
    !snippetsAvailable.value ||
    sqlSnippets.loading.value ||
    sqlSnippets.deletingId.value ||
    !sqlSnippets.snippets.value.includes(snippet)
  )
    return;
  const generation = snippetGeneration;
  snippetError.value = "";
  try {
    // Core enforces AdHoc RBAC and IsOwnerOrAdminWritable; paste permission does not grant deletion.
    await sqlSnippets.remove(snippet.id);
    if (generation === snippetGeneration) toast.add({ title: t("Chen.DeleteSucceeded"), color: "success" });
  } catch (cause) {
    if (generation === snippetGeneration)
      snippetError.value = `${t("Chen.DeleteSqlFailed")}: ${chenErrorText(cause, t)}`;
  }
}
const ready = computed(() => props.session.state === "ready" && props.query.console?.state === "ready");
const editorError = ref("");
const contextOpen = ref(false);
const contextSchemas = ref<string[]>([]);
const contextSchema = ref(props.query.context.schema);
const contextCursor = ref<string>();
const contextMore = ref(false);
const contextBusy = ref(false);
const contextError = ref("");
let contextController: AbortController | undefined;
async function loadContexts(append = false) {
  if (!ready.value || contextBusy.value || chenSqlDialect(props.session.dialect).databaseNamespace) return;
  const sessionId = props.session.id;
  const controller = new AbortController();
  contextController?.abort();
  contextController = controller;
  contextBusy.value = true;
  contextError.value = "";
  try {
    const page = await props.api.catalogSchemas(sessionId, append ? contextCursor.value : undefined, controller.signal);
    if (controller.signal.aborted || props.session.id !== sessionId) return;
    contextSchemas.value = [
      ...new Set(
        [
          props.query.context.schema,
          ...(append ? contextSchemas.value : []),
          ...page.items.map((schema) => schema.name)
        ].filter(Boolean)
      )
    ];
    contextCursor.value = page.next_cursor;
    contextMore.value = page.has_more;
  } catch (cause) {
    if (!controller.signal.aborted) contextError.value = chenErrorText(cause, t);
  } finally {
    if (!controller.signal.aborted) contextBusy.value = false;
  }
}
watch(contextOpen, (open) => {
  if (!open) return;
  contextSchema.value = props.query.context.schema;
  if (!contextSchemas.value.length) void loadContexts();
});
function newContext() {
  if (!ready.value || !contextSchemas.value.includes(contextSchema.value)) return;
  contextOpen.value = false;
  emit("newContext", { database: props.query.context.database, schema: contextSchema.value });
}
onBeforeUnmount(() => contextController?.abort());
const pinned = ref<
  { id: number; rows: GoRows; sql: string; title: string; source: string; startedAt?: string; resultId: string }[]
>([]);
const pinnedId = ref<number | null>(null);
let pinSequence = 0;
const pinnedResult = computed(() => pinned.value.find((item) => item.id === pinnedId.value));
const showingPin = computed(() => !!pinnedResult.value && props.query.resultPane === "results");
// The editor may already contain another statement. Only use the execution that owns these rows.
const loadedResultSql = computed(
  () =>
    props.query.rows?.source_sql ||
    props.query.resultExecution?.statement_results.find((item) => item.result_id === props.query.rows?.id)
      ?.source_sql ||
    props.query.resultSql
);
function pinResult() {
  if (!props.query.rows || editDirty(props.query.edit) || props.query.edit.busy || props.query.loadingRows) return;
  // A pin is a read-only in-memory copy of loaded rows, never an execution or edit context.
  const json = JSON.stringify(props.query.rows);
  if (pinned.value.length >= 3 || new TextEncoder().encode(json).byteLength > 2 * 1024 * 1024) {
    editorError.value = t("Chen.GoPinnedLimit");
    return;
  }
  const id = ++pinSequence;
  pinned.value.push({
    id,
    resultId: props.query.resultId,
    rows: JSON.parse(json),
    sql: loadedResultSql.value,
    title: queryResultTitle(loadedResultSql.value),
    startedAt: props.query.resultExecution?.started_at,
    source: props.query.resultExecution?.id || ""
  });
  pinnedId.value = id;
}
function closePin(id: number) {
  pinned.value = pinned.value.filter((item) => item.id !== id);
  if (pinnedId.value === id) pinnedId.value = null;
}
watch(
  () => props.session.id,
  () => {
    pinned.value = [];
    pinnedId.value = null;
  }
);
const historyOpen = ref(false);
const history = ref<{ execution: GoExecution; sql: string }[]>([]);
watch(
  () => props.query.execution,
  (execution) => {
    if (!execution || props.query.executionQueryPage) return;
    const item = { execution: { ...execution }, sql: props.query.executionSql };
    const index = history.value.findIndex((entry) => entry.execution.id === execution.id);
    if (index < 0) history.value.unshift(item);
    else history.value[index] = item;
    history.value = history.value.slice(0, 50);
  },
  { deep: true }
);
const splitArea = useTemplateRef<HTMLElement>("splitArea");
const { height: splitHeight } = useElementSize(splitArea);
const queryToolbar = useTemplateRef<HTMLElement>("queryToolbar");
const { height: toolbarHeight } = useElementSize(queryToolbar, { width: 0, height: 0 }, { box: "border-box" });
const editorId = useId();
const savedEditorPreference = useLocalStorage("jumpserver-client:chen-v1-editor-ratio", 58, { writeDefaults: false });
const editorPreference = ref(Number.isFinite(savedEditorPreference.value) ? savedEditorPreference.value : 58);
// V5.1.1's upper-pane ratio includes the SQL toolbar above the editor.
const availableHeight = computed(() => Math.max(0, splitHeight.value + toolbarHeight.value - 1));
const minEditorPercent = computed(() =>
  availableHeight.value ? Math.min(50, Math.max(15, ((160 + toolbarHeight.value) * 100) / availableHeight.value)) : 15
);
const maxEditorPercent = computed(
  () => 100 - (availableHeight.value ? Math.min(50, Math.max(15, 16000 / availableHeight.value)) : 15)
);
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
  defaultValue: 58,
  step: 2,
  pixelsPerUnit: () => availableHeight.value / 100,
  enabled: () => props.visible && props.query.kind !== "console"
});
const canExplain = computed(() =>
  [
    "mysql",
    "mariadb",
    "postgresql",
    "clickhouse",
    "oceanbase-mysql",
    "sqlserver",
    "oracle",
    "dameng",
    "oceanbase-oracle",
    "db2"
  ].includes(props.session.dialect)
);
const active = computed(() => executionActive(props.query.execution));
const planTabId = useId();
const selectedPlan = computed(() => props.query.planRuns.find((run) => run.number === props.query.resultPane));
const planLoading = (run: QueryPlanRun) => run.state === "pending" || run.state === "loading";
const shownPlan = computed(() => selectedPlan.value?.plan ?? null);
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
const completedWithoutRows = computed(
  () =>
    !props.dataOnly &&
    !!props.query.rows &&
    props.query.execution?.status === "succeeded" &&
    !props.query.execution.result_ids.length &&
    !props.query.executionPlanNumber &&
    !props.query.execution.export_id
);
const showExecutionStatus = computed(
  () =>
    active.value ||
    completedWithoutRows.value ||
    props.query.busy ||
    (props.query.execution && props.query.execution.status !== "succeeded") ||
    props.query.execution?.audit_status === "failed"
);
const waitingReview = computed(() => props.query.execution?.status === "waiting_review");
const reviewRequired = computed(
  () => props.query.execution?.status === "failed" && props.query.execution.error?.code === "command_review_required"
);
const warningRequired = computed(
  () =>
    props.query.execution?.status === "failed" &&
    props.query.execution.error?.code === "command_warning_confirmation_required"
);
const implicitDialog = ref<{ id: string; sql: string; revision: number } | null>(null);
const implicitRequired = computed(() => props.query.execution?.error?.code === "implicit_commit_confirmation_required");
watch(
  () => [props.query.execution?.id, props.query.execution?.error?.code],
  () => {
    const execution = props.query.execution;
    implicitDialog.value =
      execution?.error?.code === "implicit_commit_confirmation_required" && execution.transaction
        ? { id: execution.id, sql: props.query.executionSql, revision: execution.transaction.revision }
        : null;
  }
);
const canConfirmImplicit = computed(
  () =>
    canPolicySubmit.value &&
    !editDirty(props.query.edit) &&
    implicitDialog.value?.revision === props.query.console?.transaction?.revision &&
    implicitDialog.value?.id === props.query.execution?.id
);
function confirmImplicit() {
  if (!implicitDialog.value || !canConfirmImplicit.value) return;
  const id = implicitDialog.value.id;
  implicitDialog.value = null;
  emit("confirmImplicit", id);
}
const dismissedIdleNotice = ref("");
const idleNotice = computed(() => {
  const notice = props.query.console?.transaction?.notice;
  const started = props.query.execution?.started_at;
  if (notice && started && Date.parse(started) > Date.parse(notice.at)) return null;
  return notice?.reason === "idle_timeout" && notice.id !== dismissedIdleNotice.value ? notice : null;
});
function idleDuration(seconds: number) {
  return seconds % 60 === 0
    ? t("Chen.Transaction.IdleMinutes", { count: seconds / 60 })
    : t("Chen.Transaction.IdleSeconds", { count: seconds });
}
const transactionNotice = computed(() => {
  const tx = props.query.execution?.transaction;
  if (!tx?.outcome) return "";
  if (tx.outcome === "rolled_back")
    return t(
      props.query.execution?.status === "succeeded" ? "Chen.Transaction.RolledBack" : "Chen.Transaction.AutoRolledBack"
    );
  if (tx.outcome === "unknown") return t("Chen.Transaction.OutcomeUnknown");
  if (tx.outcome === "implicit_commit")
    return t(
      props.query.execution?.status === "succeeded"
        ? "Chen.Transaction.ImplicitCommitted"
        : "Chen.Transaction.ImplicitFailed"
    );
  return t("Chen.Transaction.Committed");
});
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
const liveResults = computed(() =>
  (displayExecution.value?.result_ids || []).filter(
    (id) => !pinned.value.some((item) => item.resultId === id && item.source === displayExecution.value?.id)
  )
);
function resultSql(id: string) {
  return (
    displayExecution.value?.statement_results.find((item) => item.result_id === id)?.source_sql ||
    (id === props.query.resultId ? props.query.rows?.source_sql || props.query.resultSql : "") ||
    displayExecution.value?.sql ||
    (displayExecution.value?.id === props.query.execution?.id ? props.query.executionSql : "")
  );
}
const resultNames = computed(
  () => new Map((displayExecution.value?.result_ids || []).map((id) => [id, queryResultTitle(resultSql(id))]))
);
function selectResult(id: string) {
  if (editDirty(props.query.edit) || props.query.edit.busy) return;
  pinnedId.value = null;
  emit("pane", "results");
  if (id === props.query.resultId && props.query.rows?.id === id && !props.query.loadingRows) return;
  emit("rows", id);
}
function selectPin(id: number) {
  if (editDirty(props.query.edit) || props.query.edit.busy) return;
  pinnedId.value = id;
  emit("pane", "results");
}
const resultsCollapsed = ref(false);
const hasOutput = computed(
  () =>
    !!(
      props.dataOnly ||
      props.query.execution ||
      props.query.pending ||
      props.query.rows ||
      props.query.resultLoadError ||
      props.query.planRuns.length ||
      pinned.value.length
    )
);
const showResults = computed(() => hasOutput.value && (props.dataOnly || !resultsCollapsed.value));
watch(
  () => props.query.pending?.id,
  (id) => {
    if (!id) return;
    resultsCollapsed.value = false;
    if (!props.query.pending?.planNumber) pinnedId.value = null;
  }
);
const [DefineExportAction, ExportAction] = createReusableTemplate();
const showExportJobStatus = computed(
  () =>
    !props.dataOnly &&
    !pinnedResult.value &&
    !!props.query.exportJob &&
    (props.query.resultPane !== "results" || !props.query.rows)
);
const resultTabList = useTemplateRef<HTMLElement>("resultTabList");
watch(
  () => [props.query.resultId, pinnedId.value, props.query.resultPane],
  () =>
    nextTick(() => {
      const strip = resultTabList.value;
      const tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!strip || !tab) return;
      // Reveal only horizontally; scrollIntoView can move the surrounding result pane.
      const viewport = strip.getBoundingClientRect();
      const bounds = tab.getBoundingClientRect();
      if (bounds.left < viewport.left) strip.scrollLeft -= viewport.left - bounds.left;
      else if (bounds.right > viewport.right) strip.scrollLeft += bounds.right - viewport.right;
    }),
  { flush: "post" }
);
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
    if (
      props.query.console.transaction?.manual &&
      analysis.statements.some((statement) => statement.implicit_commit || statement.transaction_control)
    )
      emit("run", sql, version);
    else if (analysis.statements.some((statement) => statement.may_write !== false))
      writeConfirmation.value = { sql, version, consoleId };
    else emit("run", sql, version);
  } catch (cause) {
    editorError.value = chenErrorText(cause, t);
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
const gridRows = computed(() =>
  props.dataOnly || !showResults.value
    ? "minmax(0, 1fr)"
    : `minmax(0, ${Math.max(0, (availableHeight.value * editorPercent.value) / 100 - toolbarHeight.value)}px) 1px minmax(0, 1fr)`
);
const sqlFile = ref<HTMLInputElement>();
let fileGeneration = 0;
onBeforeUnmount(() => fileGeneration++);
const sqlItems = computed(() => [
  {
    label: t("Chen.SqlFavorites"),
    icon: "i-lucide-book-open",
    disabled: !snippetsAvailable.value,
    onSelect: openSnippets
  },
  {
    label: t("Chen.SaveSql"),
    icon: "i-lucide-bookmark-plus",
    disabled: !canSaveSnippet.value || sqlSnippets.saving.value,
    onSelect: openSaveSnippet
  },
  ...(props.session.permissions.can_upload
    ? [
        {
          label: t("Chen.GoWriteOpenSql"),
          icon: "i-lucide-file-up",
          disabled: !ready.value,
          onSelect: () => sqlFile.value?.click()
        }
      ]
    : [])
]);
async function loadSqlFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !props.session.permissions.can_upload || !ready.value) return;
  if (!file.name.toLowerCase().endsWith(".sql")) {
    editorError.value = t("Chen.ChooseSqlFile");
    return;
  }
  const generation = ++fileGeneration;
  const sourceSession = props.session.id;
  const sourceQuery = props.query.id;
  editorError.value = "";
  if (file.size > 1024 * 1024) {
    editorError.value = t("Chen.GoWriteSqlFileLimit");
    return;
  }
  try {
    const sql = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!sql.trim() || sql.includes("\0")) throw new Error(t("Chen.GoWriteSqlFileInvalid"));
    if (
      generation === fileGeneration &&
      props.session.id === sourceSession &&
      props.query.id === sourceQuery &&
      props.session.permissions.can_upload &&
      ready.value
    )
      emit("uploadSql", sql);
  } catch (cause) {
    if (generation === fileGeneration && props.session.id === sourceSession && props.query.id === sourceQuery)
      editorError.value = chenErrorText(cause, t);
  }
}
function preventCopy(event: ClipboardEvent) {
  if (!props.session.permissions.can_copy) event.preventDefault();
}
defineExpose({
  snapshot: () => editor.value?.snapshot(),
  replaceDocument: (sql: string) => editor.value?.replaceDocument(sql) ?? false,
  focus: () => {
    if (props.visible && !props.dataOnly) editor.value?.focus();
  },
  run: () => editor.value?.run(),
  insertText: (text: string) => {
    if (!props.session.permissions.can_paste || props.query.kind === "preview") return;
    editor.value?.insertText(text);
  }
});
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col"
    data-chen-query
    :data-chen-execution-state="query.execution?.status || 'idle'"
  >
    <div
      v-if="dataOnly && ((!ready && !query.busy) || (query.pending && !query.busy) || (!query.rows && !!query.error))"
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2"
    >
      <UButton
        v-if="!query.rows && !active && !query.busy"
        :label="t('Chen.GoV1Refresh')"
        icon="i-lucide-refresh-cw"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!canRun"
        @click="emit('refreshData')"
      />
      <UButton
        v-if="session.state === 'ready' && !ready"
        :label="t('Chen.GoV1NewConnection')"
        size="xs"
        color="warning"
        variant="soft"
        :disabled="query.busy"
        @click="emit('reconnect')"
      />
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
        v-if="executionActive(query.execution)"
        :label="t('Chen.GoV1Cancel')"
        icon="i-lucide-square"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="!executionCanCancel(query.execution, session.can_cancel)"
        @click="emit('cancel')"
      />
    </div>
    <div
      v-if="!dataOnly && query.kind !== 'console'"
      ref="queryToolbar"
      data-chen-query-toolbar
      class="flex h-[var(--workspace-action-bar-height)] shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-default px-3 [&>*]:shrink-0"
    >
      <UButton
        v-if="session.state === 'ready' && !ready"
        :label="t('Chen.GoV1NewConnection')"
        size="sm"
        color="warning"
        variant="soft"
        :disabled="session.state !== 'ready' || query.busy"
        @click="emit('reconnect')"
      />
      <UTooltip
        :text="
          active
            ? t(
                cancellationUnsupported
                  ? 'Chen.GoV1CancelUnsupported'
                  : session.cancellation_mode === 'connection'
                    ? 'Chen.GoV1InterruptConnectionHint'
                    : session.cancellation_mode === 'statement_reconnect'
                      ? 'Chen.GoV1CancelReconnectHint'
                      : 'Chen.GoV1CancelHint'
              )
            : `${t('Chen.RunSelectedOrAll')} (Ctrl/⌘ Enter)`
        "
      >
        <UButton
          :icon="active ? 'i-lucide-square' : 'i-lucide-play'"
          :aria-label="
            active
              ? t(
                  waitingReview
                    ? 'Chen.GoV1CancelReview'
                    : session.cancellation_mode === 'connection'
                      ? 'Chen.GoV1InterruptConnection'
                      : 'Chen.GoV1Cancel'
                )
              : t('Chen.RunSelectedOrAll')
          "
          size="sm"
          :color="active ? 'neutral' : 'primary'"
          variant="soft"
          :disabled="active ? !executionCanCancel(query.execution, session.can_cancel) : !canRun || !query.sql.trim()"
          @click="active ? emit('cancel') : editor?.run()"
        />
      </UTooltip>
      <GoTransactionControls
        :transaction="query.console?.transaction"
        :disabled="!canRun"
        @action="emit('transaction', $event)"
      />
      <span v-if="query.console?.transaction?.supported" class="h-5 w-px shrink-0 bg-[var(--app-border)]" />
      <UTooltip :text="t(canExplain ? 'Chen.GoV1EstimatedPlanHint' : 'Chen.GoPlanUnsupported')">
        <span class="inline-flex" :tabindex="canExplain ? undefined : 0">
          <UButton
            icon="i-lucide-workflow"
            :label="t('ExecutionPlan.explain')"
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="!canRun || !canExplain || !query.sql.trim()"
            @click="editor?.explain()"
          />
        </span>
      </UTooltip>
      <UButton
        v-if="query.pending && !query.busy"
        :label="t('Chen.GoV1RecoverSubmission')"
        size="sm"
        color="warning"
        variant="soft"
        :disabled="!ready"
        @click="emit('recover')"
      />
      <UButton
        icon="i-lucide-align-left"
        :label="t('Chen.Format')"
        size="sm"
        color="neutral"
        variant="soft"
        :disabled="query.kind === 'preview' || !query.sql.trim()"
        title="Alt Shift F"
        @click="editor?.format()"
      />
      <UDropdownMenu :items="sqlItems">
        <UButton
          label="SQL"
          icon="i-lucide-file-text"
          trailing-icon="i-lucide-chevron-down"
          size="sm"
          color="neutral"
          variant="soft"
          :title="snippetUnavailable || t('Chen.GoWriteSqlFileLimit')"
        />
      </UDropdownMenu>
      <input ref="sqlFile" type="file" accept=".sql,text/plain,application/sql" class="hidden" @change="loadSqlFile" />
      <UDropdownMenu
        v-if="query.kind === 'query'"
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
          label="AI"
          trailing-icon="i-lucide-chevron-down"
          icon="i-lucide-sparkles"
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="!ready || !aiAvailable"
          :title="aiAvailable ? undefined : t('RightPanel.SQLAIUnavailableDescription')"
        />
      </UDropdownMenu>
      <UPopover v-model:open="contextOpen">
        <UButton
          class="ml-auto max-w-64 min-w-24"
          trailing-icon="i-lucide-chevron-down"
          icon="i-lucide-database"
          :label="[query.context.database || t('Chen.GoV1Database'), query.context.schema].filter(Boolean).join(' / ')"
          :aria-label="t('Chen.GoV1ConnectionDetails')"
          :title="`${query.context.database} / ${query.context.schema}`"
          :ui="{ label: 'truncate' }"
          size="sm"
          color="neutral"
          variant="soft"
        />
        <template #content>
          <div class="max-w-sm space-y-2 p-3 text-xs">
            <p class="font-medium">
              {{ query.context.database }}
              <template v-if="query.context.schema">/ {{ query.context.schema }}</template>
            </p>
            <p>{{ session.asset }} · {{ session.account }}</p>
            <p class="text-muted">{{ t("Chen.GoV1DedicatedConnection") }}</p>
            <div v-if="!chenSqlDialect(session.dialect).databaseNamespace" class="space-y-2">
              <USelect
                v-model="contextSchema"
                :items="contextSchemas"
                :aria-label="t('Chen.Schema')"
                size="sm"
                class="w-full"
                :disabled="!ready || contextBusy"
              />
              <p v-if="contextError" role="alert" class="text-error">{{ contextError }}</p>
              <UButton
                v-if="contextMore || contextError"
                :label="t(contextError ? 'Chen.GoV1Retry' : 'Chen.GoV1LoadMore')"
                size="sm"
                color="neutral"
                variant="soft"
                :disabled="!ready || contextBusy"
                @click="loadContexts(contextMore && !contextError)"
              />
              <UButton
                :label="t('Chen.GoV1NewQueryHere')"
                size="sm"
                :disabled="!ready || !contextSchemas.includes(contextSchema)"
                @click="newContext"
              />
            </div>
            <p>
              {{
                query.console?.transaction?.manual
                  ? t(
                      query.console.transaction.state === "active"
                        ? "Chen.Transaction.Active"
                        : query.console.transaction.state === "unknown"
                          ? "Chen.Transaction.OutcomeUnknown"
                          : "Chen.Transaction.Idle"
                    )
                  : t("Chen.Transaction.Auto")
              }}
            </p>
            <p class="text-muted">{{ t("Chen.GoV1TransactionHint") }}</p>
          </div>
        </template>
      </UPopover>
      <UPopover v-model:open="historyOpen">
        <UButton
          icon="i-lucide-history"
          :aria-label="t('Chen.GoV1QueryHistory')"
          :title="t('Chen.GoV1QueryHistory')"
          size="sm"
          color="neutral"
          variant="soft"
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
                <span v-if="item.execution.plan" class="text-xs text-muted">
                  {{ t("ExecutionPlan.modeEstimated") }}
                </span>
                <div class="flex items-center gap-2 text-xs text-muted">
                  <span>
                    {{
                      t(
                        item.execution.error?.code === "implicit_commit_confirmation_required"
                          ? "Chen.Transaction.NotExecuted"
                          : `Chen.GoV1Status_${item.execution.status}`
                      )
                    }}
                  </span>
                  <span>{{ duration(item.execution) }}</span>
                  <time v-if="item.execution.started_at" class="ml-auto">
                    {{ new Date(item.execution.started_at).toLocaleTimeString() }}
                  </time>
                </div>
                <pre class="my-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs">{{ item.sql }}</pre>
                <UButton
                  :label="t('Chen.GoV1RestoreQuery')"
                  icon="i-lucide-file-plus"
                  size="sm"
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
    </div>
    <UModal
      :open="!!implicitDialog && visible"
      :title="t('Chen.Transaction.ImplicitTitle')"
      :description="t('Chen.Transaction.ImplicitDescription')"
      :ui="{ content: 'sm:max-w-lg' }"
      @update:open="
        (value) => {
          if (!value) implicitDialog = null;
        }
      "
    >
      <template #body>
        <pre
          class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-default bg-muted p-3 text-xs"
          :class="{ 'select-none': !session.permissions.can_copy }"
          @copy="preventCopy"
          >{{ implicitDialog?.sql }}</pre>
        <p class="mt-3 flex gap-2 text-sm text-default">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
          {{ t("Chen.Transaction.ImplicitWarning") }}
        </p>
        <p class="mt-2 text-sm text-muted">{{ t("Chen.Transaction.KeepManual") }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            class="mr-auto"
            :label="t('Common.Cancel')"
            color="neutral"
            variant="ghost"
            autofocus
            @click="implicitDialog = null"
          />
          <UButton
            :label="t('Chen.Transaction.ConfirmExecute')"
            color="neutral"
            variant="solid"
            :disabled="!canConfirmImplicit"
            @click="confirmImplicit"
          />
        </div>
      </template>
    </UModal>
    <div
      v-if="idleNotice"
      data-transaction-idle-notice
      role="status"
      class="flex shrink-0 items-center gap-2 border-b border-default px-3 py-1 text-xs"
      :class="idleNotice.outcome === 'unknown' ? 'bg-error/5 text-error' : 'bg-warning/5'"
    >
      <UIcon name="i-lucide-timer-reset" class="size-4 shrink-0 text-warning" />
      <span class="min-w-0">
        {{
          idleNotice.outcome === "unknown"
            ? t("Chen.Transaction.OutcomeUnknown")
            : t("Chen.Transaction.IdleRolledBack", { duration: idleDuration(idleNotice.timeout_seconds) })
        }}
        <span v-if="idleNotice.audit_status === 'failed'">· {{ t("Chen.GoV1Audit_failed") }}</span>
      </span>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        class="ml-auto shrink-0"
        :aria-label="t('Common.Close')"
        @click="dismissedIdleNotice = idleNotice.id"
      />
    </div>
    <div
      v-else-if="transactionNotice"
      role="status"
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-1.5 text-xs"
      :class="
        query.execution?.transaction?.outcome === 'unknown' ? 'bg-error/5 text-default' : 'bg-warning/5 text-default'
      "
    >
      <UIcon
        :name="query.execution?.transaction?.outcome === 'committed' ? 'i-lucide-check' : 'i-lucide-info'"
        class="size-3.5 shrink-0"
      />
      <span>{{ transactionNotice }}</span>
      <span v-if="query.execution?.transaction?.prior_committed">{{ t("Chen.Transaction.PriorCommitted") }}</span>
    </div>
    <SqlSnippetSaveDialog
      v-if="saveSnippetOpen"
      v-model:open="saveSnippetOpen"
      :saving="sqlSnippets.saving.value"
      :error="snippetError"
      @confirm="saveSnippet"
    />
    <SqlSnippetSelectDialog
      v-if="selectSnippetOpen"
      v-model:open="selectSnippetOpen"
      :snippets="sqlSnippets.snippets.value"
      :loading="sqlSnippets.loading.value"
      :deleting-id="sqlSnippets.deletingId.value"
      :page="sqlSnippets.page.value"
      :page-size="sqlSnippets.pageSize"
      :total="sqlSnippets.total.value"
      :insert-disabled="!canInsertSnippet"
      :insert-hint="!canInsertSnippet ? t('Chen.GoSnippetPasteDenied') : ''"
      :error="snippetError"
      @insert="insertSnippet"
      @delete="deleteSnippet"
      @page-change="loadSnippetPage"
    />
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
    <GoBrowsePanel
      v-if="query.browseObject && !pinnedResult"
      :query="query"
      :session="session"
      @submit="emit('browse', $event)"
    />
    <GoConsolePane
      v-if="query.kind === 'console'"
      ref="editor"
      :query="query"
      :session="session"
      :api="api"
      :disabled="!canRun"
      :visible="visible"
      :ai-available="aiAvailable"
      :can-explain="canExplain"
      @sql="emit('sql', $event)"
      @run="run"
      @explain="explain"
      @cancel="emit('cancel')"
      @ai="emit('ai', $event)"
    />
    <div v-else ref="splitArea" class="grid min-h-0 min-w-0 flex-1" :style="{ gridTemplateRows: gridRows }">
      <div v-if="!dataOnly" :id="editorId" class="flex min-h-0 min-w-0 flex-col overflow-hidden px-3">
        <MonacoSqlEditor
          ref="editor"
          class="min-h-0 flex-1"
          :model-value="query.sql"
          :dialect="session.dialect"
          :sql-keyword-case="sqlKeywordCase"
          :console-id="query.console?.id || ''"
          :api="api"
          :can-copy="session.permissions.can_copy"
          :can-paste="session.permissions.can_paste"
          :can-cancel="executionCanCancel(query.execution, session.can_cancel)"
          :read-only="query.kind === 'preview'"
          :online="canRun"
          :visible="visible"
          @update:model-value="emit('sql', $event)"
          @run="run"
          @explain="explain"
          @editor-error="editorError = $event"
          @cancel="emit('cancel')"
          @open-snippets="openSnippets"
          @save-snippet="openSaveSnippet"
        />
      </div>
      <div
        v-if="!dataOnly && showResults"
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
        class="group relative z-10 cursor-row-resize touch-none bg-[var(--workspace-surface-border)] outline-none hover:bg-primary/40 focus-visible:bg-primary/60"
        :class="{ 'bg-primary/20': editorResize.dragging.value }"
        @pointerdown="editorResize.begin"
        @pointermove="editorResize.move"
        @pointerup="editorResize.end"
        @pointercancel="editorResize.end"
        @lostpointercapture="editorResize.end"
        @keydown="editorResize.keydown"
        @dblclick="editorResize.reset"
      >
        <span class="absolute -inset-y-1.5 inset-x-0" />
      </div>
      <div v-if="showResults" class="flex min-h-0 min-w-0 flex-col overflow-hidden" data-chen-results>
        <div
          v-if="!dataOnly || pinned.length"
          class="flex h-8 min-w-0 shrink-0 items-center gap-1 border-b border-default px-2 text-xs"
          data-chen-result-tabs
        >
          <UButton
            v-if="!dataOnly"
            icon="i-lucide-pin"
            size="xs"
            :color="showingPin ? 'primary' : 'neutral'"
            :variant="showingPin ? 'soft' : 'ghost'"
            class="!size-6 shrink-0 justify-center !p-0"
            :aria-label="t(showingPin ? 'Chen.UnpinResult' : 'Chen.PinResult')"
            :aria-pressed="showingPin"
            :title="t('Chen.GoPinnedHint')"
            :disabled="
              query.resultPane !== 'results' ||
              !query.rows ||
              query.loadingRows ||
              editDirty(query.edit) ||
              query.edit.busy
            "
            @click="pinnedResult ? closePin(pinnedResult.id) : pinResult()"
          />
          <div
            ref="resultTabList"
            role="tablist"
            :aria-label="t('Chen.GoV1Result')"
            class="chen-result-tab-list flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
          >
            <div
              v-for="id in dataOnly ? [] : liveResults"
              :key="`result:${id}`"
              class="group flex h-full min-w-0 shrink-0 items-center border-b-2"
              :class="
                !pinnedResult && query.resultPane === 'results' && id === query.resultId
                  ? 'border-primary bg-[var(--workspace-surface-sub-tab-active)] text-primary'
                  : 'border-transparent'
              "
            >
              <button
                type="button"
                role="tab"
                class="h-full max-w-56 min-w-16 truncate px-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                :aria-selected="!pinnedResult && query.resultPane === 'results' && id === query.resultId"
                :title="resultSql(id)"
                :disabled="editDirty(query.edit) || query.edit.busy"
                @click="selectResult(id)"
              >
                {{ resultNames.get(id) }}
              </button>
            </div>
            <button
              v-if="dataOnly"
              type="button"
              role="tab"
              class="h-full shrink-0 border-b-2 px-2"
              :class="pinnedId === null ? 'border-primary text-primary' : 'border-transparent'"
              :aria-selected="pinnedId === null"
              :disabled="editDirty(query.edit) || query.edit.busy"
              @click="pinnedId = null"
            >
              {{ t("Chen.GoTableWorkspaceData") }}
            </button>
            <div
              v-for="item in pinned"
              :key="`pin:${item.id}`"
              class="flex h-full shrink-0 items-center border-b-2"
              :class="
                pinnedId === item.id && query.resultPane === 'results'
                  ? 'border-primary bg-[var(--workspace-surface-sub-tab-active)] text-primary'
                  : 'border-transparent'
              "
            >
              <button
                type="button"
                role="tab"
                class="flex h-full max-w-56 min-w-0 items-center gap-1 px-2 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                :aria-selected="pinnedId === item.id && query.resultPane === 'results'"
                :title="item.sql"
                :disabled="editDirty(query.edit) || query.edit.busy"
                @click="selectPin(item.id)"
              >
                <UIcon name="i-lucide-pin" class="size-3 shrink-0" :aria-label="t('Chen.PinResult')" />
                <span class="truncate">{{ item.title }}</span>
              </button>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                class="!size-5 shrink-0 justify-center !p-0"
                :aria-label="`${t('Chen.UnpinResult')} ${item.title}`"
                @click="closePin(item.id)"
              />
            </div>
            <div
              v-for="planRun in dataOnly ? [] : query.planRuns"
              :key="`plan:${planRun.number}`"
              class="group flex h-full shrink-0 items-center border-b-2"
              :class="
                query.resultPane === planRun.number
                  ? 'border-primary bg-[var(--workspace-surface-sub-tab-active)] text-primary'
                  : 'border-transparent'
              "
            >
              <button
                :id="`${planTabId}-${planRun.number}`"
                type="button"
                role="tab"
                :aria-controls="query.resultPane === planRun.number ? `${planTabId}-panel` : undefined"
                :aria-selected="query.resultPane === planRun.number"
                :disabled="editDirty(query.edit) || query.edit.busy"
                :title="planRun.sql"
                class="flex h-full items-center gap-1 px-2 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                @click="emit('pane', planRun.number)"
              >
                <UIcon
                  :name="planLoading(planRun) ? 'i-lucide-loader-circle' : 'i-lucide-workflow'"
                  class="size-3.5"
                  :class="{ 'animate-spin': planLoading(planRun) }"
                />
                {{ t("ExecutionPlan.title") }} {{ planRun.number }}
              </button>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                class="!size-5 shrink-0 justify-center !p-0"
                :aria-label="`${t('Common.Close')} ${t('ExecutionPlan.title')} ${planRun.number}`"
                @click="emit('closePlan', planRun.number)"
              />
            </div>
          </div>
          <span
            class="flex size-4 shrink-0 items-center justify-center"
            role="status"
            :aria-label="query.loadingRows ? t('Chen.GoV1FetchingRows') : undefined"
          >
            <UIcon v-if="query.loadingRows" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
          </span>
          <UButton
            v-if="!dataOnly"
            icon="i-lucide-chevron-down"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="t('Chen.GoHideResults')"
            :title="t('Chen.GoHideResults')"
            @click="resultsCollapsed = true"
          />
        </div>
        <DefineExportAction>
          <GoExportPanel
            icon-only
            :query="query"
            :session="session"
            :api="api"
            :ready="ready && !editDirty(query.edit) && !query.edit.busy"
            @start="(mode, format, snapshot) => emit('export', mode, format, snapshot)"
            @sync="emit('exportSync')"
            @cancel="emit('exportCancel')"
            @remove="emit('exportDelete')"
          />
        </DefineExportAction>
        <div
          v-if="showExecutionStatus || showExportJobStatus"
          class="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 text-xs"
        >
          <UIcon
            v-if="active || query.busy || query.loadingRows"
            name="i-lucide-loader-circle"
            class="size-3.5 animate-spin"
          />
          <span
            v-if="showExecutionStatus"
            :class="{
              'text-error': query.execution?.status === 'failed' && !reviewRequired && !implicitRequired,
              'text-warning': query.execution?.status === 'unknown' || query.execution?.status === 'cancel_requested'
            }"
          >
            {{
              implicitRequired
                ? t(implicitDialog ? "Chen.Transaction.AwaitingConfirmation" : "Chen.Transaction.NotExecuted")
                : reviewRequired
                  ? t("Chen.GoV1ReviewRequired")
                  : query.execution
                    ? t(`Chen.GoV1Status_${query.execution.status}`)
                    : t("Chen.GoV1Ready")
            }}
          </span>
          <template v-if="completedWithoutRows">
            <span v-for="(statement, index) in query.execution?.statement_results" :key="index" class="tabular-nums">
              {{
                statement.rows_affected !== undefined ? `${t("Chen.GoV1RowsAffected")}: ${statement.rows_affected}` : ""
              }}
            </span>
          </template>
          <span v-if="query.loadingRows" class="text-muted">{{ t("Chen.GoV1FetchingRows") }}</span>
          <span
            v-if="query.execution?.audit_status === 'failed'"
            :title="t(single ? 'Chen.GoV1SingleAuditExplanation' : 'Chen.GoV1AuditExplanation')"
            :class="query.execution.audit_status === 'failed' ? 'text-error' : 'text-muted'"
          >
            {{ t("Chen.GoV1Audit") }}: {{ t(`Chen.GoV1Audit_${query.execution.audit_status}`) }}
          </span>
          <span v-if="query.execution?.status === 'unknown'" class="text-warning">{{ t("Chen.GoV1DoNotRetry") }}</span>
          <span
            v-if="
              query.resultPane === 'results' &&
              query.resultExecution &&
              query.resultExecution.id !== query.execution?.id &&
              query.rows?.id !== query.cachedResult?.id &&
              !(query.executionQueryPage?.action === 'count' && query.execution?.status === 'succeeded')
            "
            :class="implicitRequired ? 'text-muted' : 'text-warning'"
          >
            {{ t("Chen.GoV1PreviousResult") }}
          </span>
          <div v-if="showExportJobStatus" class="ml-auto flex items-center gap-1">
            <span class="text-muted">{{ t("Chen.GoV1ExportTask") }}</span>
            <ExportAction />
          </div>
        </div>
        <div
          v-if="query.execution?.error && !reviewRequired && !implicitRequired && !query.error"
          role="alert"
          class="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-ui-mono text-xs text-error"
        >
          {{ chenErrorText(query.execution.error, t) }}
        </div>
        <div
          v-if="query.resultPane === 'results' && query.resultLoadError"
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
        <div
          v-if="selectedPlan"
          :id="`${planTabId}-panel`"
          :key="selectedPlan.number"
          role="tabpanel"
          :aria-labelledby="`${planTabId}-${selectedPlan.number}`"
          class="flex min-h-0 flex-1 flex-col"
          :class="{ 'select-none': !session.permissions.can_copy }"
          @copy.capture="preventCopy"
          @cut.capture="preventCopy"
        >
          <p v-if="!canExplain" class="px-3 py-2 text-xs text-warning">{{ t("Chen.GoPlanUnsupported") }}</p>
          <GoResultSql v-if="!shownPlan" :sql="selectedPlan.sql" :can-copy="session.permissions.can_copy" />
          <div
            v-if="selectedPlan.error || selectedPlan.state === 'interrupted'"
            role="alert"
            class="flex gap-2 px-3 py-2 text-xs text-warning"
          >
            {{ selectedPlan.error || t("Chen.GoV1ConnectionLost") }}
            <UButton
              v-if="selectedPlan.planRequestId"
              size="xs"
              color="neutral"
              :label="t('Chen.GoV1RetryResult')"
              :disabled="!ready"
              @click="loadQueryPlan(query, selectedPlan, api)"
            />
          </div>
          <ExecutionPlanTree
            v-if="shownPlan || planLoading(selectedPlan)"
            :plan="shownPlan"
            :loading="planLoading(selectedPlan)"
            :can-copy="session.permissions.can_copy"
            compact
            preserve-raw
          >
            <template #actions>
              <UPopover v-if="shownPlan" :content="{ align: 'end' }">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-code"
                  :label="t('Chen.GoPlanViewSQL')"
                />
                <template #content>
                  <div
                    class="max-h-[55vh] w-[min(42rem,calc(100vw-2rem))] space-y-3 overflow-auto p-3 text-xs"
                    :class="{ 'select-none': !session.permissions.can_copy }"
                    data-plan-sql
                    @copy.capture="preventCopy"
                    @cut.capture="preventCopy"
                  >
                    <div>
                      <p class="mb-1 text-muted">{{ t("Chen.GoPlanSourceSQL") }}</p>
                      <pre class="whitespace-pre-wrap break-words font-ui-mono">{{
                        shownPlan.sql || selectedPlan.sql
                      }}</pre>
                    </div>
                    <div>
                      <p class="mb-1 text-muted">{{ t("Chen.GoPlanGenerated") }}</p>
                      <pre class="whitespace-pre-wrap break-words font-ui-mono">{{
                        shownPlan.context.generated_sql || "—"
                      }}</pre>
                    </div>
                  </div>
                </template>
              </UPopover>
            </template>
          </ExecutionPlanTree>
        </div>
        <div v-show="query.resultPane === 'results'" class="flex min-h-0 min-w-0 flex-1 flex-col">
          <template v-if="pinnedResult">
            <GoResultGrid
              :rows="pinnedResult.rows"
              :can-copy="session.permissions.can_copy"
              :active="visible && query.resultPane === 'results'"
              class="min-h-0 flex-1"
            >
              <template #toolbar-start>
                <GoResultSql
                  :sql="pinnedResult.sql"
                  :can-copy="session.permissions.can_copy"
                  :started-at="pinnedResult.startedAt"
                  :execution-id="pinnedResult.source"
                />
              </template>
            </GoResultGrid>
          </template>
          <template v-else-if="query.rows">
            <GoWritePanel
              :key="`${query.rows.id}:${query.loadingSettings.mode}:${query.loadingSettings.batchSize}`"
              :visible="visible && query.resultPane === 'results'"
              :query="query"
              :session="session"
              :api="api"
              class="min-h-0 flex-1"
              @apply="emit('applyEdits', $event)"
              @refresh="emit('refreshData')"
              @loading-settings="emit('loadingSettings', $event)"
              @load-more="emit('loadMore', $event)"
            >
              <template v-if="!dataOnly" #source>
                <GoResultSql
                  :sql="loadedResultSql"
                  :can-copy="session.permissions.can_copy"
                  :started-at="query.resultExecution?.started_at"
                  :execution-id="query.resultExecution?.id"
                />
              </template>
              <template v-if="dataOnly" #settings-actions>
                <UButton
                  icon="i-lucide-pin"
                  :label="t('Chen.PinResult')"
                  :title="t('Chen.GoPinnedHint')"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="
                    !query.rows || query.loadingRows || editDirty(query.edit) || query.edit.busy || pinned.length >= 3
                  "
                  @click="pinResult"
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
              </template>
              <template #actions>
                <ExportAction v-if="query.resultId || query.exportJob" />
              </template>
            </GoWritePanel>
            <GoBrowseFooter
              v-if="query.browseObject"
              :query="query"
              :session="session"
              @submit="emit('browse', $event)"
              @rows="(id, offset) => emit('rows', id, offset)"
              @loading-settings="emit('loadingSettings', $event)"
              @load-more="emit('loadMore', false)"
            />
            <div
              v-if="!query.browseObject && query.loadingSettings.mode === 'continuous'"
              role="status"
              data-continuous-status
              class="flex shrink-0 flex-wrap items-center gap-2 border-t border-default px-3 py-1.5 text-xs"
            >
              <span class="tabular-nums">{{ t("Chen.GoBrowseLoaded", { rows: query.rows.rows.length }) }}</span>
              <span
                v-if="
                  query.loadingRows || (executionActive(query.execution) && query.executionBrowse?.action === 'append')
                "
                class="text-muted"
              >
                {{ t("Chen.GoBrowseLoadingMore") }}
              </span>
              <span v-else-if="editDirty(query.edit) || query.edit.refreshRequired" class="text-warning">
                {{ t("Chen.GoBrowseScrollDirty") }}
              </span>
              <span v-else-if="query.loadMoreFailed || query.resultLoadError" class="text-warning">
                {{ t("Chen.GoBrowseLoadMoreFailed") }}
              </span>
              <span v-else-if="query.rows.browse?.limit_reached === 'rows'" class="text-warning">
                {{ t("Chen.GoBrowseCacheLimit", { rows: query.rows.browse.max_loaded_rows }) }}
              </span>
              <span v-else-if="query.rows.truncated && !hasMoreResultRows(query)" class="text-warning">
                {{ t("Chen.GoBrowseCacheStopped") }}
              </span>
              <span v-else-if="!hasMoreResultRows(query)" class="text-muted">
                {{ t(query.rows.browse?.supported ? "Chen.GoBrowseEnd" : "Chen.GoBrowseCacheEnd") }}
              </span>
              <UButton
                v-if="hasMoreResultRows(query)"
                size="xs"
                color="neutral"
                variant="ghost"
                class="ml-auto"
                :label="
                  t(query.loadMoreFailed || query.resultLoadError ? 'Chen.GoBrowseRetryMore' : 'Chen.GoBrowseLoadMore')
                "
                :disabled="!ready || resultLoadingLocked(query)"
                @click="emit('loadMore', false)"
              />
            </div>
            <GoQueryPagePanel
              v-if="!query.browseObject"
              :query="query"
              :session="session"
              @submit="emit('queryPage', $event)"
              @cached="emit('cachedResult')"
              @rows="(id, offset) => emit('rows', id, offset)"
              @loading-settings="emit('loadingSettings', $event)"
            />
          </template>
          <div v-else class="min-h-0 flex-1 overflow-auto p-3 text-xs text-muted">
            <div
              v-if="!query.execution && !query.pending && !query.loadingRows"
              class="grid h-full min-h-0 place-items-center text-sm"
            >
              <div class="text-center">
                <UIcon name="i-lucide-table-properties" class="mx-auto mb-2 size-5" />
                <p>{{ t("Chen.RunQueryForResults") }}</p>
              </div>
            </div>
            <p v-for="(result, index) in query.execution?.statement_results || []" :key="index">
              {{ result.rows_affected !== undefined ? `${t("Chen.GoV1RowsAffected")}: ${result.rows_affected}` : "" }}
            </p>
            <p v-if="query.execution?.status === 'succeeded' && !query.execution.result_ids.length">
              {{ t("Chen.GoV1NoResultSet") }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="!dataOnly && hasOutput && resultsCollapsed"
      class="flex shrink-0 justify-end border-t border-default px-2 py-1"
    >
      <UButton
        icon="i-lucide-chevron-up"
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('Chen.GoShowResults')"
        @click="resultsCollapsed = false"
      />
    </div>
  </div>
</template>

<style scoped>
.chen-result-tab-list {
  scrollbar-width: none;
}
.chen-result-tab-list::-webkit-scrollbar {
  display: none;
}
</style>
