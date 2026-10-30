<script setup lang="ts">
import type {
  GoCatalogObject,
  GoConsole,
  GoEditPlan,
  GoEvent,
  GoExecution,
  GoExport,
  GoExportFormat,
  GoSession
} from "./api";
import type { GoSqlEditorSnapshot } from "./sqlAi";
import type { ChenWorkspaceTab, QueryContext, QueryWorkspaceTab } from "./workspace";
import type {
  ChenSqlAiFrameSender,
  ChenSqlAiOperation,
  ChenSqlEditorContext,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { useElementSize, useLocalStorage } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { parseKokoMcpFrame } from "#koko/composables/agent/types";
import {
  getChenSqlAiSession,
  handleChenSqlAiError,
  handleChenSqlAiWireMessage,
  invalidateChenSqlAiContext,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "~/chen/composables/useChenSqlAiSessions";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { chenSampleSql, chenSqlDialect } from "~/chen/utils/sqlDialect";
import { registerWorkspaceSessionCloseGuard } from "~/composables/useWorkspaceTabs";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { ChenGoError, createChenGoApi, executionActive, executionCanCancel } from "./api";
import { acceptEditExecution, createEditDraft, editDirty } from "./dataEditing";
import { readChenEvents } from "./events";
import GoCatalogTree from "./GoCatalogTree.vue";
import GoObjectPane from "./GoObjectPane.vue";
import GoQueryPane from "./GoQueryPane.vue";
import GoSchemaEditor from "./GoSchemaEditor.vue";
import { newChenRequestId } from "./requestId";
import { goSqlExecutionError, prepareGoSqlProposal } from "./sqlAi";
import { usePaneResize } from "./usePaneResize";
import {
  acceptQueryExecution,
  closeQuerySession,
  closeWarnings,
  createQueryTab,
  exportActive,
  loadQueryPlan,
  objectKey,
  objectSelect,
  queryDirty,
  reconcileExport,
  reviewSubmission,
  tabContext,
  warningSubmission
} from "./workspace";

const props = defineProps<{ tab?: WorkspaceSessionTab; selector?: string }>();
const { t } = useI18n();
const toast = useToast();
const aiPanel = props.tab ? useAiPanel() : null;
const workspace = props.tab ? useWorkspaceTabs() : null;
const userInfo = props.tab ? useUserInfoStore() : null;
// Freeze the authenticated Core site for this workspace; a Chen endpoint or renderer URL is not a Core site.
const reviewCoreSite = userInfo?.currentSite || undefined;
const single = props.selector !== undefined;
const endpoint = computed(
  () =>
    String(props.tab?.payload?.endpointUrl || "").trim() ||
    (props.tab?.payload?.webUrl ? new URL(String(props.tab.payload.webUrl), window.location.origin).origin : "") ||
    (isDesktopRuntime() ? userInfo?.currentSite : "") ||
    window.location.origin
);
const credential = computed(() => {
  const token = props.tab?.payload?.token as { id?: string } | undefined;
  return single ? props.selector || "" : String(token?.id || props.tab?.payload?.id || "");
});
interface SessionConnection {
  identity: string;
  credential: string;
  api: ReturnType<typeof createChenGoApi>;
  controller: AbortController;
  session: GoSession | null;
  connecting?: Promise<void>;
}
let api = createChenGoApi(endpoint.value, fetch, { mode: single ? "single" : "managed" });
let connection: SessionConnection | null = null;
let replacement = 0;
let replacementConfirmation: Promise<boolean> | null = null;
const session = ref<GoSession | null>(null);
const tabs = ref<ChenWorkspaceTab[]>([]);
const activeId = ref("");
const defaultContext = ref<QueryContext>({ database: "", schema: "" });
const error = ref("");
const busy = ref(true);
const authenticationUnknown = ref(false);
const eventConnected = ref(false);
const drawer = ref(false);
const workspaceBody = useTemplateRef<HTMLElement>("workspaceBody");
const { width: workspaceWidth } = useElementSize(workspaceBody);
const sidebarId = useId();
// Only presentation preferences are persisted; connection details and SQL stay in memory.
const sidebarPreference = useLocalStorage("jumpserver-client:chen-v1-sidebar-width", 300, {
  writeDefaults: false,
  initOnMounted: true
});
const sidebarHidden = useLocalStorage("jumpserver-client:chen-v1-sidebar-hidden", false, {
  writeDefaults: false,
  initOnMounted: true
});
const desktopTree = computed(() => workspaceWidth.value >= 720);
const treeVisible = computed(() => desktopTree.value && !sidebarHidden.value);
const sidebarMax = computed(() => Math.max(220, Math.min(800, workspaceWidth.value - 426)));
// Keep the user's preferred width while a smaller window temporarily clamps it.
const sidebarWidth = computed({
  get: () =>
    Math.max(220, Math.min(sidebarMax.value, Number.isFinite(sidebarPreference.value) ? sidebarPreference.value : 300)),
  set: (value: number) => {
    sidebarPreference.value = value;
  }
});
const sidebarResize = usePaneResize({
  axis: "x",
  value: sidebarWidth,
  min: 220,
  max: sidebarMax,
  defaultValue: 300,
  step: 16,
  pixelsPerUnit: () => 1,
  enabled: treeVisible
});
let eventController = new AbortController();
interface QueryPaneHandle {
  focus: () => void;
  run: () => void;
  insertText: (text: string) => void;
  snapshot: () => GoSqlEditorSnapshot | undefined;
  replaceDocument: (sql: string) => boolean;
}
const queryPanes = new Map<string, QueryPaneHandle>();
const tabStrip = ref<HTMLElement>();
const queries = computed(() => tabs.value.filter((tab): tab is QueryWorkspaceTab => tab.kind !== "object"));
const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value));
const sessionReady = computed(() => session.value?.state === "ready");
const insertTarget = computed(() => (activeTab.value?.kind === "query" ? activeTab.value : undefined));
let disposed = false;
let sequence = 0;
let queryNumber = 0;
const failureText = (cause: unknown) => chenErrorText(cause, t);
const aiAvailable = computed(() => !!props.tab && !!getChenSqlAiSession(props.tab.id)?.enabled);
let aiGeneration = 0;
function sqlAiContext(): ChenSqlEditorContext | null {
  const query = activeTab.value;
  if (
    !props.tab ||
    !sessionReady.value ||
    !session.value ||
    query?.kind !== "query" ||
    query.console?.state !== "ready"
  )
    return null;
  const snapshot = queryPanes.get(query.id)?.snapshot();
  if (!snapshot) return null;
  return {
    ...snapshot,
    dialect: session.value.dialect,
    database: query.context.database,
    schema: query.context.schema,
    nodeKey: query.console.id,
    consoleId: query.console.id,
    paneId: props.tab.id,
    tabId: query.id,
    workspaceTabId: query.id,
    workspaceTabKind: "query",
    currentContext: JSON.stringify(query.context),
    lastError: goSqlExecutionError(query, snapshot)
  };
}
function applySqlProposal(proposal: ChenSqlProposal) {
  const context = sqlAiContext();
  const prepared = session.value?.permissions.can_paste ? prepareGoSqlProposal(proposal, context) : null;
  if (!prepared || !context) return { applied: false, reason: t("RightPanel.SQLAIProposalStale") };
  if (prepared.target === "new_query") {
    void restoreQuery({ database: context.database || "", schema: context.schema || "" }, prepared.sql);
    return { applied: true };
  }
  const applied = queryPanes.get(context.tabId)?.replaceDocument(prepared.sql) ?? false;
  return applied ? { applied } : { applied, reason: t("RightPanel.SQLAIProposalStale") };
}
const sendSqlAiFrame: ChenSqlAiFrameSender = (frame) => {
  if (!props.tab || !sessionReady.value || disposed || !session.value) return false;
  const sessionId = session.value.id;
  const generation = aiGeneration;
  const paneId = props.tab.id;
  const requestContext = getChenSqlAiSession(paneId)?.requestContext;
  void api.aiMessage(sessionId, frame, eventController.signal).catch((cause) => {
    if (
      disposed ||
      generation !== aiGeneration ||
      session.value?.id !== sessionId ||
      !sessionReady.value ||
      !requestContext ||
      requestContext !== getChenSqlAiSession(paneId)?.requestContext
    )
      return;
    const request = parseKokoMcpFrame(frame);
    if (request?.type === "mcp.request") {
      handleChenSqlAiWireMessage(paneId, {
        type: "mcp.response",
        version: 1,
        resource_session_id: request.resource_session_id,
        data: { jsonrpc: "2.0", id: request.data.id, error: { code: -32000, message: failureText(cause) } }
      });
    } else handleChenSqlAiError(paneId, { code: "transport_failed", message: failureText(cause) });
  });
  return true;
};
function closeSqlAi() {
  aiGeneration++;
  if (props.tab) unregisterChenSqlAiSession(props.tab.id, sendSqlAiFrame);
}
async function connectSqlAi() {
  if (!props.tab || !session.value || !sessionReady.value || disposed) return;
  closeSqlAi();
  const generation = aiGeneration;
  const sessionId = session.value.id;
  const paneId = props.tab.id;
  registerChenSqlAiSession(paneId, sendSqlAiFrame, sqlAiContext, applySqlProposal);
  try {
    const manifest = await api.aiManifest(sessionId, eventController.signal);
    if (disposed || generation !== aiGeneration || session.value?.id !== sessionId || !sessionReady.value) return;
    if (!handleChenSqlAiWireMessage(paneId, manifest)) throw new Error(t("RightPanel.SQLAIUnavailableDescription"));
  } catch (cause) {
    if (disposed || generation !== aiGeneration) return;
    handleChenSqlAiError(paneId, { code: "unavailable", message: failureText(cause) });
  }
}
watch(
  () => `${session.value?.id}:${session.value?.state}`,
  () => {
    if (sessionReady.value) void connectSqlAi();
    else closeSqlAi();
  }
);
watch(
  () => {
    const query = activeTab.value;
    return [
      props.tab?.id,
      activeId.value,
      query?.kind,
      query?.kind === "query"
        ? [query.console?.id, query.console?.state, query.context.database, query.context.schema, query.sql]
        : null
    ];
  },
  () => {
    if (props.tab) invalidateChenSqlAiContext(props.tab.id);
  },
  { flush: "sync" }
);
function updateQuerySql(query: QueryWorkspaceTab, sql: string) {
  query.sql = sql;
  // Monaco may advance the model version without changing the final text.
  if (props.tab && activeId.value === query.id) invalidateChenSqlAiContext(props.tab.id);
}
function requestSqlAi(operation: ChenSqlAiOperation) {
  if (!props.tab || !sqlAiContext()) return;
  const current = getChenSqlAiSession(props.tab.id);
  current?.targetNextRequestToEditor();
  aiPanel?.openAi();
  if (operation === "generate" || !current?.enabled) return;
  const prompt = t(operation === "explain" ? "RightPanel.SQLAIExplainPrompt" : "RightPanel.SQLAIRepairPrompt");
  void current.request(operation, prompt, "editor").catch((cause) => {
    toast.add({ title: t("RightPanel.SQLAIUnavailableTitle"), description: failureText(cause), color: "warning" });
  });
}
function markDisconnected(reason: string) {
  if (props.tab) workspace?.markSessionDisconnected(props.tab.id, reason);
}
function setQueryPane(id: string, value: unknown) {
  if (value) queryPanes.set(id, value as QueryPaneHandle);
  else queryPanes.delete(id);
}
function selectTab(tab: ChenWorkspaceTab) {
  activeId.value = tab.id;
}
function insertName(text: string) {
  if (!session.value?.permissions.can_paste || !insertTarget.value) return;
  queryPanes.get(insertTarget.value.id)?.insertText(text);
  drawer.value = false;
}
function toggleTree() {
  if (desktopTree.value) sidebarHidden.value = !sidebarHidden.value;
  else drawer.value = !drawer.value;
}
async function tabKeydown(event: KeyboardEvent, tab: ChenWorkspaceTab) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectTab(tab);
    return;
  }
  const index = tabs.value.indexOf(tab);
  let target: ChenWorkspaceTab | undefined;
  if (event.key === "ArrowRight") target = tabs.value[(index + 1) % tabs.value.length];
  if (event.key === "ArrowLeft") target = tabs.value[(index + tabs.value.length - 1) % tabs.value.length];
  if (event.key === "Home") target = tabs.value[0];
  if (event.key === "End") target = tabs.value.at(-1);
  if (!target) return;
  event.preventDefault();
  selectTab(target);
  await nextTick();
  tabStrip.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
}
const renameTarget = ref<ChenWorkspaceTab | null>(null);
const renameTitle = ref("");
function renameTab(tab: ChenWorkspaceTab) {
  renameTitle.value = tab.title;
  renameTarget.value = tab;
}
function finishRename() {
  const title = renameTitle.value.trim();
  if (!title || !renameTarget.value) return;
  renameTarget.value.title = title.slice(0, 80);
  renameTarget.value = null;
}
function tabMenu(tab: ChenWorkspaceTab) {
  const index = tabs.value.indexOf(tab);
  const others = tabs.value.filter((item) => item.id !== tab.id);
  const right = tabs.value.slice(index + 1);
  const cannotClose = (list: ChenWorkspaceTab[]) =>
    !list.length || list.some((item) => item.kind !== "object" && item.busy);
  return [
    { label: t("Chen.GoV1RenameTab"), icon: "i-lucide-pencil", onSelect: () => renameTab(tab) },
    ...(tab.kind !== "object"
      ? [
          {
            label: t("Chen.GoV1DuplicateQuery"),
            icon: "i-lucide-copy-plus",
            disabled: !sessionReady.value || !session.value?.permissions.can_paste,
            onSelect: () => restoreQuery(tab.context, tab.sql)
          }
        ]
      : []),
    {
      label: t("Chen.GoV1CloseTab"),
      icon: "i-lucide-x",
      disabled: tab.kind !== "object" && tab.busy,
      onSelect: () => closeTab(tab)
    },
    {
      label: t("Chen.GoV1CloseOtherTabs"),
      icon: "i-lucide-panel-top-close",
      disabled: cannotClose(others),
      onSelect: () => closeTabs(others)
    },
    {
      label: t("Chen.GoV1CloseTabsRight"),
      icon: "i-lucide-arrow-right-to-line",
      disabled: cannotClose(right),
      onSelect: () => closeTabs(right)
    }
  ];
}
function isCurrent(query: QueryWorkspaceTab) {
  return !disposed && !query.closed;
}
function isConnectionCurrent(scope: SessionConnection) {
  return !disposed && connection === scope;
}
function retireConnection(scope: SessionConnection | null) {
  scope?.controller.abort();
  if (scope?.session && scope.session.state !== "closed") void scope.api.closeSession(scope.session.id).catch(() => {});
}

async function loadRows(
  query: QueryWorkspaceTab,
  id: string,
  offset = 0,
  execution = query.resultExecution || query.execution,
  sql = execution?.id === query.execution?.id ? query.executionSql : query.resultSql
) {
  if (!execution || editDirty(query.edit) || query.edit.busy) return;
  const generation = ++query.loadGeneration;
  query.loadingRows = true;
  query.resultLoadError = null;
  try {
    const page = await api.rows(id, offset);
    if (isCurrent(query) && generation === query.loadGeneration) {
      const changedResult = query.rows?.id !== page.id;
      query.rows = page;
      if (changedResult) query.edit = createEditDraft();
      query.resultId = id;
      // Row loading may finish after more statements or audit updates arrive.
      // Retain the latest snapshot for this execution without changing its SQL source.
      query.resultExecution = {
        ...(query.execution?.id === execution.id
          ? query.execution
          : query.resultExecution?.id === execution.id
            ? query.resultExecution
            : execution)
      };
      query.resultSql = sql;
    }
  } catch (cause) {
    if (isCurrent(query) && generation === query.loadGeneration)
      query.resultLoadError = { message: failureText(cause), id, offset, execution, sql };
  } finally {
    if (generation === query.loadGeneration) query.loadingRows = false;
  }
}
function retryRows(query: QueryWorkspaceTab) {
  const failed = query.resultLoadError;
  if (failed) void loadRows(query, failed.id, failed.offset, failed.execution, failed.sql);
}
function acceptExecution(query: QueryWorkspaceTab, value: GoExecution) {
  if (!isCurrent(query) || !acceptQueryExecution(query, value)) return;
  acceptEditExecution(query.edit, value);
  if (query.execution?.plan && !executionActive(query.execution) && query.planLoadedId !== value.id)
    void loadQueryPlan(query, api);
  if (
    !query.execution?.plan &&
    value.result_ids?.length &&
    query.resultExecution?.id !== value.id &&
    !query.loadingRows
  )
    void loadRows(query, value.result_ids[0]!, 0, query.execution, query.executionSql);
}
function acceptExport(query: QueryWorkspaceTab, value: GoExport) {
  if (!isCurrent(query) || query.exportJob?.id !== value.id) return;
  query.exportJob = reconcileExport(query.exportJob, value);
}
async function syncExport(query: QueryWorkspaceTab, id = query.exportJob?.id) {
  if (!id || session.value?.state === "closed") return;
  const expectedId = query.exportJob?.id;
  const current = await api.getExport(id);
  if (!isCurrent(query) || session.value?.state === "closed" || query.exportJob?.id !== expectedId) return;
  if (!query.exportJob && query.execution?.export_id === id) query.exportJob = current;
  else acceptExport(query, current);
}
function loseConsole(query: QueryWorkspaceTab) {
  if (query.console) query.console.state = "lost";
  if (query.execution && executionActive(query.execution)) query.execution = { ...query.execution, status: "unknown" };
  query.error = t("Chen.GoV1ConnectionLost");
}
function acceptEvent(event: GoEvent) {
  if (event.sequence <= sequence && event.type !== "reset") return;
  sequence = event.sequence;
  if (event.type === "ai.message" && props.tab && sessionReady.value)
    handleChenSqlAiWireMessage(props.tab.id, event.data);
  if (event.type === "execution.updated") {
    const value = event.data as GoExecution;
    const query = queries.value.find((query) => query.console?.id === value.console_id);
    if (query) acceptExecution(query, value);
  }
  if (event.type === "export.updated") {
    const value = event.data as GoExport;
    const query = queries.value.find((query) => query.exportJob?.id === value.id);
    if (query) acceptExport(query, value);
  }
  if (event.type === "session.updated") session.value = event.data as GoSession;
  if (event.type === "console.updated") {
    const value = event.data as GoConsole;
    const query = queries.value.find((query) => query.console?.id === value.id);
    if (query) {
      query.console = value;
      if (value.state === "lost") loseConsole(query);
    }
  }
  if (event.type === "session.closed") {
    if (session.value) session.value.state = "closed";
    eventController.abort();
    error.value = chenErrorText((event.data as { reason?: string }).reason, t, "session_closed");
    for (const query of queries.value) closeQuerySession(query);
    markDisconnected(error.value);
  }
  if (event.type === "reset") {
    const snapshot = event.data as { session: GoSession; consoles: GoConsole[]; executions: GoExecution[] };
    session.value = snapshot.session;
    if (sessionReady.value) void connectSqlAi();
    for (const query of queries.value) {
      if (!query.console) continue;
      const current = (snapshot.consoles || []).find((item) => item.id === query.console!.id);
      if (current) query.console = current;
      if (!current || current.state === "lost") loseConsole(query);
      const execution = (snapshot.executions || []).find((item) => item.id === query.execution?.id);
      if (execution) acceptExecution(query, execution);
    }
    if (snapshot.session.state === "closed") {
      eventController.abort();
      for (const query of queries.value) closeQuerySession(query);
      markDisconnected(t("Chen.GoV1SessionClosed"));
    }
  }
}
async function syncExecution(query: QueryWorkspaceTab) {
  if (!query.execution || query.execution.console_id !== query.console?.id) return;
  const sessionId = session.value?.id;
  const consoleId = query.console.id;
  const executionId = query.execution.id;
  const snapshot = await api.execution(executionId);
  if (
    !isCurrent(query) ||
    session.value?.id !== sessionId ||
    session.value?.state === "closed" ||
    query.console?.id !== consoleId ||
    query.execution?.id !== executionId
  )
    return;
  acceptExecution(query, snapshot);
}
async function watchEvents(scope: SessionConnection) {
  const { api, controller } = scope;
  let delay = 1000;
  while (isConnectionCurrent(scope) && !controller.signal.aborted && scope.session) {
    try {
      const stream = await api.events(scope.session.id, sequence, controller.signal);
      if (!isConnectionCurrent(scope) || controller.signal.aborted) break;
      eventConnected.value = true;
      // State reads must not delay lock/close events already available on the stream.
      void Promise.allSettled(queries.value.flatMap((query) => [syncExecution(query), syncExport(query)]));
      delay = 1000;
      await readChenEvents(
        stream,
        (event) => {
          if (isConnectionCurrent(scope) && !controller.signal.aborted) acceptEvent(event);
        },
        controller.signal
      );
    } catch (cause) {
      if (!isConnectionCurrent(scope) || controller.signal.aborted) break;
      if (cause instanceof ChenGoError && [401, 403, 404, 410].includes(cause.status)) {
        error.value = failureText(cause);
        if (session.value) session.value.state = "closed";
        for (const query of queries.value) closeQuerySession(query);
        markDisconnected(error.value);
        break;
      }
    } finally {
      if (isConnectionCurrent(scope)) eventConnected.value = false;
    }
    if (!isConnectionCurrent(scope) || controller.signal.aborted) break;
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", done);
        resolve();
      };
      timer = setTimeout(done, delay);
      controller.signal.addEventListener("abort", done, { once: true });
    });
    delay = Math.min(delay * 2, 10_000);
  }
}
async function connectQuery(query: QueryWorkspaceTab) {
  if (!sessionReady.value || !session.value || query.busy) return;
  const sessionId = session.value.id;
  const queryApi = api;
  query.busy = true;
  query.error = "";
  try {
    const console = await queryApi.openConsole(sessionId, {
      database: query.context.database || undefined,
      schema: query.context.schema || undefined
    });
    if (!isCurrent(query)) {
      await queryApi.closeConsole(console.id);
      return;
    }
    if (session.value?.id !== sessionId || session.value.state === "closed" || eventController.signal.aborted) {
      query.console = { ...console, state: "closed" };
      return;
    }
    query.console = console;
    query.context = { database: console.database, schema: console.schema };
    if (!defaultContext.value.database) defaultContext.value = { ...query.context };
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function newQuery(
  context = tabContext(activeTab.value, defaultContext.value),
  object?: GoCatalogObject,
  preview = false,
  browse = false
) {
  if (!sessionReady.value) return;
  if (object && !preview && !browse && !session.value?.permissions.can_paste) return;
  const sql = object ? objectSelect(object, session.value!.dialect, preview) : chenSampleSql(session.value!.dialect);
  const query = reactive(
    createQueryTab(
      `${t(preview ? "Chen.GoV1Preview" : "Chen.Query")} ${++queryNumber}`,
      context,
      sql,
      !!object && !preview
    )
  );
  if (preview || browse) query.kind = "preview";
  if (browse && object) {
    query.browseObject = object;
    query.title = object.name;
  }
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  await connectQuery(query);
  if (!isCurrent(query)) return;
  if (browse && object && query.console) await browseTable(query);
  else if (preview && query.console) await submit(query, sql, 1);
}
async function browseTable(query: QueryWorkspaceTab) {
  if (
    !query.browseObject ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    executionActive(query.execution) ||
    editDirty(query.edit)
  )
    return;
  query.pending = {
    sql: objectSelect(query.browseObject, session.value!.dialect, true),
    version: 1,
    id: newChenRequestId(),
    browse: query.browseObject
  };
  await recoverSubmission(query);
}
async function applyEdits(query: QueryWorkspaceTab, plan: GoEditPlan) {
  if (
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    executionActive(query.execution) ||
    query.edit.plan?.plan_id !== plan.plan_id
  )
    return;
  query.pending = { sql: plan.sql, version: 1, id: newChenRequestId(), editPlanId: plan.plan_id };
  await recoverSubmission(query);
}
async function refreshData(query: QueryWorkspaceTab) {
  if (editDirty(query.edit) || query.edit.busy) return;
  if (query.browseObject) await browseTable(query);
  else if (query.resultSql) await submit(query, query.resultSql, query.executionVersion);
}
interface SchemaEdit {
  id: string;
  sessionId: string;
  context: QueryContext;
  object?: GoCatalogObject;
  mode: "create" | "alter" | "index";
  transferSql: (sql: string, execute: boolean) => boolean;
  close: () => void;
}
const schemaEdit = ref<SchemaEdit | null>(null);
const schemaEditor = useTemplateRef<InstanceType<typeof GoSchemaEditor>>("schemaEditor");
async function confirmSchemaDiscard() {
  const target = schemaEdit.value;
  if (!target) return true;
  const confirmed = await schemaEditor.value?.confirmDiscard();
  return !!confirmed && !disposed && schemaEdit.value === target;
}
async function confirmSessionLeave(preserveSqlDrafts = false) {
  const target = schemaEdit.value;
  const scope = connection;
  if (!(await confirmSchemaDiscard()) || !(await confirmClose(queries.value, preserveSqlDrafts))) return false;
  return !disposed && connection === scope && schemaEdit.value === target;
}
async function openSchemaEditor(
  mode: "create" | "alter" | "index",
  object?: GoCatalogObject,
  context = tabContext(activeTab.value, defaultContext.value)
) {
  const sessionId = session.value?.id;
  if (!sessionReady.value || !(await confirmSchemaDiscard()) || !sessionReady.value || session.value?.id !== sessionId)
    return;
  const id = newChenRequestId();
  schemaEdit.value = {
    id,
    sessionId: sessionId!,
    mode,
    object,
    context: { ...(object ? { database: object.database, schema: object.schema } : context) },
    transferSql: (sql, execute) => applySchemaSql(id, sql, execute),
    close: () => {
      if (schemaEdit.value?.id === id) schemaEdit.value = null;
    }
  };
}
function applySchemaSql(id: string, sql: string, execute: boolean): boolean {
  const target = schemaEdit.value;
  if (
    disposed ||
    !target ||
    target.id !== id ||
    !sessionReady.value ||
    target.sessionId !== session.value?.id ||
    !sql.trim()
  )
    return false;
  const scope = connection;
  const query = reactive(createQueryTab(`${t("Chen.Query")} ${++queryNumber}`, target.context, sql, true));
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  // Acknowledge only after SQL is in a query draft. Connection/execution failures leave that draft available.
  schemaEdit.value = null;
  void (async () => {
    await connectQuery(query);
    if (execute && connection === scope && isCurrent(query) && query.console) await submit(query, sql, 1);
  })();
  return true;
}
// Forced server closure is authoritative, including while a discard confirmation is open.
watch(
  () => [session.value?.id, session.value?.state],
  () => {
    if (schemaEdit.value && (session.value?.id !== schemaEdit.value.sessionId || session.value?.state === "closed"))
      schemaEdit.value = null;
  },
  { flush: "sync" }
);
async function restoreQuery(context: QueryContext, sql: string, uploaded = false) {
  if (!sessionReady.value || !(uploaded ? session.value?.permissions.can_upload : session.value?.permissions.can_paste))
    return;
  const query = reactive(createQueryTab(`${t("Chen.Query")} ${++queryNumber}`, context, sql, true));
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  await connectQuery(query);
}
function openObject(object: GoCatalogObject) {
  const id = `object:${objectKey(object)}`;
  if (!tabs.value.some((tab) => tab.id === id)) tabs.value.push({ id, kind: "object", title: object.name, object });
  activeId.value = id;
  drawer.value = false;
}
async function submit(query: QueryWorkspaceTab, sql: string, version: number, plan = false) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    executionActive(query.execution) ||
    query.busy ||
    query.pending ||
    editDirty(query.edit) ||
    query.edit.busy ||
    !sql.trim()
  )
    return;
  query.loadGeneration++;
  query.loadingRows = false;
  query.resultLoadError = null;
  query.loadingPlan = false;
  query.planLoadError = "";
  query.resultPane = plan ? "plan" : "results";
  query.pending = { sql, version, id: newChenRequestId(), ...(plan ? { plan: true } : {}) };
  await recoverSubmission(query);
}
async function explainQuery(query: QueryWorkspaceTab, sql: string, version: number) {
  await submit(query, sql, version, true);
}
async function recoverSubmission(query: QueryWorkspaceTab) {
  const pending = query.pending;
  if (!pending || !sessionReady.value || query.console?.state !== "ready" || query.busy) return;
  query.busy = true;
  query.error = "";
  try {
    const value = pending.editPlanId
      ? await api.applyEdits(
          query.console.id,
          pending.editPlanId,
          pending.id,
          pending.submitReview,
          pending.confirmWarnings
        )
      : pending.browse
        ? await api.browse(
            query.console.id,
            pending.browse.schema,
            pending.browse.name,
            pending.id,
            pending.submitReview,
            pending.confirmWarnings
          )
        : pending.exportFormat
          ? await api.exportQuery(
              query.console.id,
              pending.sql,
              pending.version,
              pending.id,
              pending.exportFormat,
              pending.submitReview,
              pending.confirmWarnings
            )
          : await api.execute(
              query.console.id,
              pending.sql,
              pending.version,
              pending.id,
              pending.submitReview,
              pending.confirmWarnings,
              !!pending.plan
            );
    if (!isCurrent(query)) return;
    query.pending = null;
    query.execution = value;
    query.executionSql = value.sql || pending.sql;
    if (pending.browse && value.sql) {
      query.sql = value.sql;
      query.baselineSql = value.sql;
    }
    query.executionVersion = pending.version;
    query.executionPlan = !!value.plan;
    query.resultPane = value.plan ? "plan" : "results";
    query.executionConfirmWarnings = !!pending.confirmWarnings;
    query.executionSubmitReview = !!pending.submitReview;
    query.executionExportFormat = pending.exportFormat;
    query.executionEditPlan = pending.editPlanId;
    query.executionBrowse = pending.browse;
    if (value.export_id) query.exportJob = null;
    // A close event may precede the HTTP response. Do not revive a running spinner after SSE has ended.
    if (session.value?.state === "closed" || (query.console as GoConsole).state === "closed") {
      closeQuerySession(query);
      return;
    }
    acceptExecution(query, value);
    if (value.export_id)
      void syncExport(query, value.export_id).catch((cause) => {
        if (isCurrent(query)) query.error = failureText(cause);
      });
    await syncExecution(query);
  } catch (cause) {
    if (!isCurrent(query)) return;
    if (cause instanceof ChenGoError && cause.status >= 400 && cause.status < 500) query.pending = null;
    query.error = query.pending ? `${t("Chen.GoV1SubmissionUnknown")} ${failureText(cause)}` : failureText(cause);
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function startExport(
  query: QueryWorkspaceTab,
  mode: "query" | "cached",
  format: GoExportFormat,
  snapshot: { sql: string; resultId: string; version: number }
) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    !session.value?.permissions.can_download ||
    query.busy ||
    query.exportBusy ||
    editDirty(query.edit) ||
    query.edit.busy ||
    query.pending ||
    exportActive(query.exportJob)
  )
    return;
  if (mode === "query") {
    if (query.pendingCachedExport) return;
    if (query.console?.state !== "ready" || executionActive(query.execution) || !snapshot.sql.trim()) return;
    query.pending = { sql: snapshot.sql, version: snapshot.version, id: newChenRequestId(), exportFormat: format };
    await recoverSubmission(query);
    return;
  }
  if (!snapshot.resultId) return;
  // On an unknown HTTP outcome, recover exactly the same request before offering another export.
  query.pendingCachedExport ||= { resultId: snapshot.resultId, format, id: newChenRequestId() };
  const pending = query.pendingCachedExport;
  query.exportBusy = true;
  query.error = "";
  try {
    const value = await api.exportCached(pending.resultId, pending.format, pending.id);
    if (!isCurrent(query) || session.value?.state === "closed") return;
    query.pendingCachedExport = null;
    query.exportJob = value;
  } catch (cause) {
    if (isCurrent(query)) {
      if (cause instanceof ChenGoError && cause.status >= 400 && cause.status < 500) query.pendingCachedExport = null;
      query.error = query.pendingCachedExport
        ? `${t("Chen.GoV1SubmissionUnknown")} ${failureText(cause)}`
        : failureText(cause);
    }
  } finally {
    if (isCurrent(query)) query.exportBusy = false;
  }
}
async function cancelExport(query: QueryWorkspaceTab) {
  if (!sessionReady.value || !query.exportJob || !exportActive(query.exportJob)) return;
  try {
    acceptExport(query, await api.cancelExport(query.exportJob.id));
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  }
}
async function deleteExport(query: QueryWorkspaceTab) {
  const id = query.exportJob?.id;
  if (!id || !isCurrent(query) || query.exportBusy) return;
  if (session.value?.state === "closed") {
    query.exportJob = null;
    return;
  }
  if (exportActive(query.exportJob)) return;
  query.exportBusy = true;
  try {
    await api.deleteExport(id);
    if (isCurrent(query) && query.exportJob?.id === id) query.exportJob = null;
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  } finally {
    if (isCurrent(query)) query.exportBusy = false;
  }
}
async function requestReview(query: QueryWorkspaceTab) {
  if (!isCurrent(query) || !sessionReady.value || query.console?.state !== "ready" || query.busy || query.pending)
    return;
  const pending = reviewSubmission(query);
  if (!pending) return;
  query.pending = pending;
  await recoverSubmission(query);
}
async function confirmWarning(query: QueryWorkspaceTab, executionId: string) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    query.execution?.id !== executionId
  )
    return;
  const pending = warningSubmission(query);
  if (!pending) return;
  query.pending = pending;
  await recoverSubmission(query);
}
async function cancel(query: QueryWorkspaceTab) {
  if (!query.execution || !executionCanCancel(query.execution, session.value?.can_cancel)) return;
  try {
    acceptExecution(query, await api.cancel(query.execution.id));
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  }
}

const closeDialog = ref<ReturnType<typeof closeWarnings> | null>(null);
let closeResolver: ((value: boolean) => void) | undefined;
function confirmClose(list: QueryWorkspaceTab[], preserveSqlDrafts = false) {
  if (session.value?.can_cancel === false) {
    const running = list.filter(
      (query) => executionActive(query.execution) && query.execution?.status !== "waiting_review"
    );
    if (running.length) {
      for (const query of running) query.error = t("Chen.GoV1CloseCancelUnsupported");
      return Promise.resolve(false);
    }
  }
  const warnings = closeWarnings(list);
  if (preserveSqlDrafts) warnings.dirty = list.some((query) => editDirty(query.edit));
  if (!Object.values(warnings).some(Boolean)) return Promise.resolve(true);
  if (closeResolver) return Promise.resolve(false);
  closeDialog.value = warnings;
  return new Promise<boolean>((resolve) => {
    closeResolver = resolve;
  });
}
function finishClose(value: boolean) {
  closeDialog.value = null;
  closeResolver?.(value);
  closeResolver = undefined;
}
async function closeTabs(list: ChenWorkspaceTab[]) {
  const queries = list.filter((tab): tab is QueryWorkspaceTab => tab.kind !== "object");
  if (queries.some((query) => query.busy) || !(await confirmClose(queries))) return;
  for (const tab of list) await closeTab(tab, true);
}
async function closeTab(tab: ChenWorkspaceTab, confirmed = false) {
  if (tab.kind !== "object") {
    if (tab.busy || tab.exportBusy || (!confirmed && !(await confirmClose([tab]))) || !isCurrent(tab)) return;
    if (
      session.value?.can_cancel === false &&
      executionActive(tab.execution) &&
      tab.execution?.status !== "waiting_review"
    ) {
      tab.error = t("Chen.GoV1CloseCancelUnsupported");
      return;
    }
    tab.busy = true;
    const queryApi = api;
    try {
      if (tab.execution && executionActive(tab.execution)) await queryApi.cancel(tab.execution.id);
      if (exportActive(tab.exportJob)) await queryApi.cancelExport(tab.exportJob!.id);
      if (tab.console && tab.console.state !== "closed" && session.value?.state !== "closed")
        await queryApi.closeConsole(tab.console.id);
    } catch (cause) {
      tab.error = failureText(cause);
      tab.busy = false;
      return;
    }
    if (!isCurrent(tab)) return;
    tab.closed = true;
    tab.loadGeneration++;
  }
  const index = tabs.value.indexOf(tab);
  if (index < 0) return;
  tabs.value.splice(index, 1);
  if (activeId.value === tab.id) activeId.value = tabs.value[Math.max(0, index - 1)]?.id || "";
}
async function reconnect(query: QueryWorkspaceTab) {
  if (!sessionReady.value || query.busy || !(await confirmClose([query])) || !isCurrent(query)) return;
  try {
    if (query.console) await api.closeConsole(query.console.id);
  } catch (cause) {
    if (!(cause instanceof ChenGoError && [404, 410].includes(cause.status))) {
      query.error = failureText(cause);
      return;
    }
  }
  if (!isCurrent(query)) return;
  if (query.execution && executionActive(query.execution)) query.execution = { ...query.execution, status: "unknown" };
  query.pending = null;
  query.edit = createEditDraft();
  query.rows = null;
  query.resultId = "";
  query.resultExecution = null;
  query.resultSql = "";
  query.loadGeneration++;
  query.loadingPlan = false;
  query.plan = null;
  query.planAttempt = null;
  query.planLoadedId = "";
  query.planLoadError = "";
  query.executionPlan = false;
  query.resultPane = "results";
  await connectQuery(query);
}
async function replaceConnection(nextEndpoint: string, nextCredential: string) {
  const identity = JSON.stringify([nextEndpoint, nextCredential]);
  const request = ++replacement;
  if (!nextCredential || connection?.identity === identity) return;
  // SQL drafts survive reconnect. Server-bound edits, pending submissions and transactions do not.
  const confirmation = (replacementConfirmation ||= confirmSessionLeave(true));
  const confirmed = await confirmation;
  if (replacementConfirmation === confirmation) replacementConfirmation = null;
  if (!confirmed) {
    if (!disposed && request === replacement && props.tab) {
      if (session.value && session.value.state !== "closed") workspace?.markSessionConnected(props.tab.id);
      else markDisconnected(t("Chen.GoV1SessionClosed"));
    }
    return;
  }
  if (disposed || request !== replacement) return;
  retireConnection(connection);
  closeSqlAi();
  tabs.value = tabs.value.map((tab) => {
    if (tab.kind === "object") return { ...tab };
    tab.closed = true;
    tab.loadGeneration++;
    return {
      ...createQueryTab(tab.title, tab.context, tab.sql),
      id: tab.id,
      kind: tab.kind,
      baselineSql: tab.baselineSql,
      browseObject: tab.browseObject
    };
  });
  session.value = null;
  defaultContext.value = { database: "", schema: "" };
  schemaEdit.value = null;
  renameTarget.value = null;
  eventConnected.value = false;
  sequence = 0;
  api = createChenGoApi(nextEndpoint, fetch, { mode: single ? "single" : "managed" });
  eventController = new AbortController();
  connection = { identity, credential: nextCredential, api, controller: eventController, session: null };
  await startSession();
}
function startSession(): Promise<void> {
  const scope = connection;
  if (!scope || disposed || scope.session) return Promise.resolve();
  if (scope.connecting) return scope.connecting;
  busy.value = true;
  error.value = "";
  authenticationUnknown.value = false;
  // A retry after an unknown response must reuse this API's authentication request_id.
  scope.connecting = (async () => {
    try {
      const authenticated = single
        ? await scope.api.authenticateSelector(scope.credential)
        : await scope.api.authenticate(scope.credential);
      scope.session = authenticated;
      if (!isConnectionCurrent(scope)) {
        retireConnection(scope);
        return;
      }
      session.value = authenticated;
      if (queries.value.length) await Promise.all(queries.value.map(connectQuery));
      else await newQuery();
      if (!isConnectionCurrent(scope)) return;
      if (props.tab) workspace?.markSessionConnected(props.tab.id);
      void watchEvents(scope);
    } catch (cause) {
      if (isConnectionCurrent(scope)) {
        authenticationUnknown.value = !session.value && (!(cause instanceof ChenGoError) || cause.status >= 500);
        error.value = failureText(cause);
        markDisconnected(error.value);
      }
    } finally {
      scope.connecting = undefined;
      if (isConnectionCurrent(scope)) busy.value = false;
    }
  })();
  return scope.connecting;
}
async function closeSession() {
  const scope = connection;
  if (!scope?.session || busy.value || !(await confirmSessionLeave()) || !isConnectionCurrent(scope)) return;
  busy.value = true;
  try {
    await scope.api.closeSession(scope.session.id);
    if (!isConnectionCurrent(scope)) return;
    if (session.value) session.value.state = "closed";
    scope.controller.abort();
    for (const query of queries.value) closeQuerySession(query);
    markDisconnected(t("Chen.GoV1SessionClosed"));
  } catch (cause) {
    if (isConnectionCurrent(scope)) error.value = failureText(cause);
  } finally {
    if (isConnectionCurrent(scope)) busy.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (schemaEditor.value?.dirty || Object.values(closeWarnings(queries.value)).some(Boolean)) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function preventCopy(event: ClipboardEvent) {
  if (session.value && !session.value.permissions.can_copy) event.preventDefault();
}
const unregisterCloseGuard = props.tab
  ? registerWorkspaceSessionCloseGuard(props.tab.id, () => confirmSessionLeave())
  : undefined;
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
});
watch(
  [endpoint, credential],
  ([nextEndpoint, nextCredential]) => {
    void replaceConnection(nextEndpoint, nextCredential);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  closeSqlAi();
  finishClose(false);
  unregisterCloseGuard?.();
  window.removeEventListener("beforeunload", beforeUnload);
  eventController.abort();
  for (const query of queries.value) {
    query.closed = true;
    query.loadGeneration++;
  }
  retireConnection(connection);
});
defineExpose({ focus: () => queryPanes.get(activeId.value)?.focus() });
</script>

<template>
  <section
    :data-chen-session-state="session?.state || 'connecting'"
    class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-main)] text-[var(--app-fg)]"
    @copy.capture="preventCopy"
    @cut.capture="preventCopy"
  >
    <div
      class="flex min-h-[var(--workspace-toolbar-height)] shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-1.5"
    >
      <UButton
        :icon="treeVisible ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
        :label="t('Chen.GoV1Objects')"
        :aria-expanded="desktopTree ? treeVisible : drawer"
        :aria-controls="sidebarId"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="toggleTree"
      />
      <UIcon name="i-lucide-database" class="size-4 shrink-0" />
      <span class="max-w-80 truncate text-xs" :title="session?.asset || tab?.assetName || selector">
        {{ session?.asset || tab?.assetName || selector }}
      </span>
      <UBadge color="neutral" variant="soft" size="xs">
        {{ chenSqlDialect(session?.dialect || tab?.protocol || "").label }}
      </UBadge>
      <span
        v-if="sessionReady"
        class="flex items-center gap-1.5 text-xs"
        :class="eventConnected ? 'text-muted' : 'text-warning'"
        :title="t(eventConnected ? 'Chen.GoV1EventsConnected' : 'Chen.GoV1EventsReconnecting')"
      >
        <UIcon
          :name="eventConnected ? 'i-lucide-check' : 'i-lucide-loader-circle'"
          class="size-3"
          :class="{ 'animate-spin': !eventConnected }"
        />
        {{ t(eventConnected ? "Chen.GoV1Connected" : "Chen.GoV1StatusSyncing") }}
      </span>
      <UButton
        v-if="session"
        class="ml-auto"
        :label="t('Chen.CreateTable')"
        icon="i-lucide-table-2"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!sessionReady"
        @click="openSchemaEditor('create')"
      />
      <UButton
        icon="i-lucide-unplug"
        :label="t('Chen.GoV1Close')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!session || session.state === 'closed' || busy"
        @click="closeSession"
      />
    </div>
    <div v-if="error" role="alert" class="shrink-0 border-b border-error/25 bg-error/10 px-3 py-2 text-xs text-error">
      {{ error }}
    </div>
    <div
      v-if="session && session.state !== 'ready'"
      role="status"
      class="shrink-0 border-b border-default px-3 py-2 text-xs text-warning"
    >
      {{
        t(
          session.state === "locked"
            ? session.state_reason === "session_control_unavailable"
              ? "Chen.GoV1ControlUnavailable"
              : session.state_reason === "session_locked"
                ? "Chen.GoV1SessionPausedByAdmin"
                : "Chen.GoV1SessionPaused"
            : session.state === "closed"
              ? "Chen.GoV1SessionClosed"
              : "Chen.GoV1SessionUnavailable"
        )
      }}
    </div>
    <div v-if="!session" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
      <UIcon v-if="busy" name="i-lucide-loader-circle" class="size-4 animate-spin" />
      {{ busy ? t("Chen.GoV1Connecting") : t("Chen.GoV1ConnectionFailed") }}
      <UButton
        v-if="authenticationUnknown && !busy"
        :label="t('Chen.GoV1RecoverAuthentication')"
        :title="t('Chen.GoV1RecoverAuthenticationHint')"
        color="warning"
        variant="soft"
        size="xs"
        @click="startSession"
      />
    </div>
    <div v-else :key="session.id" ref="workspaceBody" class="relative flex min-h-0 flex-1">
      <button
        v-if="drawer && !desktopTree"
        class="absolute inset-0 z-10 bg-[var(--workspace-surface-main)] opacity-60"
        :aria-label="t('Chen.GoV1CloseObjects')"
        @click="drawer = false"
      />
      <aside
        :id="sidebarId"
        class="shrink-0 flex-col bg-[var(--workspace-surface-sidebar)]"
        :class="
          desktopTree
            ? treeVisible
              ? 'relative flex'
              : 'hidden'
            : drawer
              ? 'absolute inset-y-0 left-0 z-20 flex max-w-[90%] border-r border-default shadow-xl'
              : 'hidden'
        "
        :style="{ width: `${desktopTree ? sidebarWidth : 360}px` }"
      >
        <GoCatalogTree
          v-if="defaultContext.database"
          :api="api"
          :session-id="session.id"
          :dialect="session.dialect"
          :database="defaultContext.database"
          :asset="session.asset || selector || ''"
          :ready="sessionReady"
          :can-paste="session.permissions.can_paste"
          :can-copy="session.permissions.can_copy"
          :can-insert="!!insertTarget"
          @insert="insertName"
          @object="openObject"
          @browse="(object) => newQuery({ database: object.database, schema: object.schema }, object, false, true)"
          @create-table="(context) => openSchemaEditor('create', undefined, context)"
          @query="(context, object) => newQuery(context, object)"
          @preview="(object) => newQuery({ database: object.database, schema: object.schema }, object, true)"
        />
        <div v-else class="p-3 text-xs text-muted">{{ t("Chen.GoV1Connecting") }}</div>
      </aside>
      <div
        v-if="treeVisible"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('Chen.ResizeDatabaseSidebar')"
        :aria-controls="sidebarId"
        :aria-valuenow="Math.round(sidebarWidth)"
        :aria-valuemin="220"
        :aria-valuemax="Math.round(sidebarMax)"
        :aria-valuetext="`${Math.round(sidebarWidth)} px`"
        :title="`${t('Chen.ResizeDatabaseSidebar')} · ${t('Chen.GoV1ResizeHint')}`"
        class="group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-[var(--workspace-surface-sidebar)] outline-none hover:bg-primary/15 focus-visible:bg-primary/20"
        :class="{ 'bg-primary/20': sidebarResize.dragging.value }"
        @pointerdown="sidebarResize.begin"
        @pointermove="sidebarResize.move"
        @pointerup="sidebarResize.end"
        @pointercancel="sidebarResize.end"
        @lostpointercapture="sidebarResize.end"
        @keydown="sidebarResize.keydown"
        @dblclick="sidebarResize.reset"
      >
        <span
          class="pointer-events-none absolute inset-y-0 left-1/2 border-l border-default group-hover:border-primary group-focus-visible:border-primary"
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref="tabStrip"
          role="tablist"
          :aria-label="t('Chen.GoV1WorkspaceTabs')"
          class="flex min-h-10 shrink-0 overflow-x-auto border-b border-default"
        >
          <div class="flex max-w-full items-stretch" :style="{ width: `${tabs.length * 176 + 40}px` }">
            <UContextMenu v-for="item in tabs" :key="item.id" :items="tabMenu(item)">
              <div
                role="tab"
                :aria-selected="activeId === item.id"
                :tabindex="activeId === item.id ? 0 : -1"
                class="flex w-44 min-w-28 shrink items-center gap-1.5 border-r border-default px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                :class="
                  activeId === item.id
                    ? 'border-b-2 border-b-primary bg-[var(--workspace-surface-main)]'
                    : 'bg-[var(--workspace-surface-sidebar)] text-muted'
                "
                :title="
                  item.kind === 'object'
                    ? `${item.object.database}.${item.object.schema}.${item.object.name}`
                    : `${item.context.database} / ${item.context.schema}`
                "
                @click="selectTab(item)"
                @dblclick="renameTab(item)"
                @keydown="tabKeydown($event, item)"
              >
                <UIcon
                  :name="
                    item.kind === 'object'
                      ? 'i-lucide-table-properties'
                      : executionActive(item.execution)
                        ? 'i-lucide-loader-circle'
                        : 'i-lucide-file-code-2'
                  "
                  class="size-3.5 shrink-0"
                  :class="{ 'animate-spin': item.kind !== 'object' && executionActive(item.execution) }"
                />
                <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
                <span
                  v-if="item.kind !== 'object' && queryDirty(item)"
                  :title="t('Chen.GoV1MemoryDraft')"
                  class="text-warning"
                >
                  ●
                </span>
                <UButton
                  icon="i-lucide-x"
                  :aria-label="`${t('Chen.GoV1CloseTab')} ${item.title}`"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="item.kind !== 'object' && item.busy"
                  @click.stop="closeTab(item)"
                  @dblclick.stop
                />
              </div>
            </UContextMenu>
            <UButton
              icon="i-lucide-plus"
              :aria-label="t('Chen.NewQuery')"
              :title="t('Chen.GoV1NewQueryHint')"
              class="m-1 shrink-0"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="!sessionReady"
              @click="newQuery()"
            />
          </div>
        </div>
        <div v-if="!tabs.length" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted">
          <p>{{ t("Chen.GoV1EmptyWorkspace") }}</p>
          <UButton :label="t('Chen.NewQuery')" size="sm" :disabled="!sessionReady" @click="newQuery()" />
        </div>
        <div v-for="item in tabs" v-show="activeId === item.id" :key="item.id" class="flex min-h-0 flex-1 flex-col">
          <GoObjectPane
            v-if="item.kind === 'object'"
            :object="item.object"
            :dialect="session.dialect"
            :api="api"
            :session-id="session.id"
            :ready="sessionReady"
            :can-copy="session.permissions.can_copy"
            :can-paste="session.permissions.can_paste"
            @query="newQuery({ database: item.object.database, schema: item.object.schema }, item.object)"
            @preview="newQuery({ database: item.object.database, schema: item.object.schema }, item.object, true)"
            @browse="newQuery({ database: item.object.database, schema: item.object.schema }, item.object, false, true)"
            @schema-edit="openSchemaEditor($event, item.object)"
          />
          <GoQueryPane
            v-else
            :ref="(value) => setQueryPane(item.id, value)"
            :query="item"
            :session="session"
            :api="api"
            :single="single"
            :visible="activeId === item.id"
            :review-core-site="reviewCoreSite"
            :ai-available="aiAvailable"
            @ai="requestSqlAi"
            @apply-edits="applyEdits(item, $event)"
            @upload-sql="restoreQuery(item.context, $event, true)"
            @refresh-data="refreshData(item)"
            @sql="updateQuerySql(item, $event)"
            @restore="(sql: string) => restoreQuery(item.context, sql)"
            @run="(sql, version) => submit(item, sql, version)"
            @explain="(sql, version) => explainQuery(item, sql, version)"
            @cancel="cancel(item)"
            @review="requestReview(item)"
            @confirm-warning="(id) => confirmWarning(item, id)"
            @export="(mode, format, snapshot) => startExport(item, mode, format, snapshot)"
            @export-sync="
              syncExport(item).catch((cause) => {
                item.error = failureText(cause);
              })
            "
            @export-cancel="cancelExport(item)"
            @export-delete="deleteExport(item)"
            @recover="recoverSubmission(item)"
            @reconnect="reconnect(item)"
            @rows="(id, offset) => loadRows(item, id, offset)"
            @retry-rows="retryRows(item)"
            @pane="(pane) => (item.resultPane = pane)"
          />
        </div>
        <div
          class="flex shrink-0 flex-wrap items-center gap-x-3 border-t border-default px-3 py-1 text-[11px] text-muted"
        >
          <span :title="t('Chen.GoV1MemoryDraft')">{{ t("Chen.GoV1MemoryDraftShort") }}</span>
          <span class="ml-auto" :title="t('Chen.GoV1Shortcuts')">Ctrl/⌘ Enter · {{ t("Chen.GoV1RunCurrent") }}</span>
        </div>
      </div>
    </div>
    <GoSchemaEditor
      v-if="schemaEdit && session"
      :key="schemaEdit.id"
      ref="schemaEditor"
      :session="session"
      :api="api"
      :context="schemaEdit.context"
      :object="schemaEdit.object"
      :mode="schemaEdit.mode"
      :transfer-sql="schemaEdit.transferSql"
      @close="schemaEdit.close"
    />
    <UModal
      :open="!!renameTarget"
      :title="t('Chen.GoV1RenameTab')"
      :description="t('Chen.GoV1RenameTabHint')"
      @update:open="
        (value) => {
          if (!value) renameTarget = null;
        }
      "
    >
      <template #body>
        <form @submit.prevent="finishRename">
          <UInput v-model="renameTitle" autofocus maxlength="80" class="w-full" :aria-label="t('Chen.GoV1TabName')" />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Chen.GoV1KeepEditing')" color="neutral" variant="soft" @click="renameTarget = null" />
          <UButton :label="t('Chen.GoV1RenameTab')" :disabled="!renameTitle.trim()" @click="finishRename" />
        </div>
      </template>
    </UModal>
    <UModal
      :open="!!closeDialog"
      :title="t('Chen.GoV1ConfirmClose')"
      :description="t('Chen.GoV1CloseDescription')"
      @update:open="
        (value) => {
          if (!value) finishClose(false);
        }
      "
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p v-if="closeDialog?.dirty" class="text-warning">{{ t("Chen.GoV1CloseDirty") }}</p>
          <p v-if="closeDialog?.running" class="text-warning">{{ t("Chen.GoV1CloseRunning") }}</p>
          <p v-if="closeDialog?.unknown" class="text-error">{{ t("Chen.GoV1CloseUnknown") }}</p>
          <p v-if="closeDialog?.transaction">{{ t("Chen.GoV1CloseTransaction") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Chen.GoV1KeepEditing')" color="neutral" variant="soft" @click="finishClose(false)" />
          <UButton :label="t('Chen.GoV1ConfirmDiscardClose')" color="warning" @click="finishClose(true)" />
        </div>
      </template>
    </UModal>
  </section>
</template>
