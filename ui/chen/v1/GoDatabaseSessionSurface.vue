<script setup lang="ts">
import type {
  GoBrowseRequest,
  GoCatalogObject,
  GoConsole,
  GoEditPlan,
  GoEvent,
  GoExecution,
  GoExport,
  GoExportFormat,
  GoQueryPageRequest,
  GoSession,
  GoTransactionRequest
} from "./api";
import type { GoSqlEditorSnapshot } from "./sqlAi";
import type {
  ChenWorkspaceTab,
  GoResultLoadingSettings,
  ObjectWorkspaceSection,
  ObjectWorkspaceTab,
  QueryContext,
  QueryWorkspaceTab
} from "./workspace";
import type {
  ChenSqlAiFrameSender,
  ChenSqlAiOperation,
  ChenSqlEditorContext,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";
import type { ChenLogConsoleEntry } from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { useElementSize, useLocalStorage } from "@vueuse/core";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
  useId,
  useTemplateRef,
  watch
} from "vue";
import { useI18n } from "vue-i18n";
import { parseKokoMcpFrame } from "#koko/composables/agent/types";
import LogConsolePanel from "~/chen/components/LogConsolePanel.vue";
import {
  getChenSqlAiSession,
  handleChenSqlAiError,
  handleChenSqlAiWireMessage,
  invalidateChenSqlAiContext,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "~/chen/composables/useChenSqlAiSessions";
import { chenErrorText } from "~/chen/utils/errorMessages";
import WorkspaceSubTabStrip from "~/components/Workspace/subTabStrip.vue";
import { registerWorkspaceSessionCloseGuard } from "~/composables/useWorkspaceTabs";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { ChenGoError, createChenGoApi, executionActive, executionCanCancel } from "./api";
import { acceptEditExecution, createEditDraft, editDirty } from "./dataEditing";
import { readChenEvents } from "./events";
import GoCatalogTree from "./GoCatalogTree.vue";
import GoObjectPane from "./GoObjectPane.vue";
import GoOverviewPane from "./GoOverviewPane.vue";
import GoQueryPane from "./GoQueryPane.vue";
import GoSchemaEditor from "./GoSchemaEditor.vue";
import { newChenRequestId } from "./requestId";
import { goSqlExecutionError, prepareGoSqlProposal } from "./sqlAi";
import { usePaneResize } from "./usePaneResize";
import {
  acceptQueryExecution,
  closeQueryPlan,
  closeQuerySession,
  closeWarnings,
  createQueryTab,
  exportActive,
  hasMoreResultRows,
  interruptQueryPlans,
  isQueryWorkspaceTab,
  loadQueryPlan,
  normalizeResultLoading,
  objectSelect,
  objectWorkspaceKey,
  openQueryPlan,
  reconcileExport,
  resultLoadingLocked,
  reviewSubmission,
  tabContext,
  useChenWorkspacePreferences,
  useResultLoadingPreferences,
  warningSubmission,
  workspaceQueries,
  workspaceQuery
} from "./workspace";

const props = defineProps<{ tab?: WorkspaceSessionTab; selector?: string }>();
const { t } = useI18n();
const toast = useToast();
const loadingPreferences = useResultLoadingPreferences();
const workspacePreferences = useChenWorkspacePreferences();
// Session-scoped metadata and logs never persist credentials, SQL, or object names to disk.
const recentObjects = ref<GoCatalogObject[]>([]);
const logs = ref<ChenLogConsoleEntry[]>([]);
const logsOpen = ref(false);
const unreadLogErrors = ref(0);
const loggedExecutions = new Map<string, string>();
function appendLog(sourceId: string, sourceTitle: string, level: ChenLogConsoleEntry["level"], message: string) {
  logs.value.push({ id: newChenRequestId(), timestamp: Date.now(), sourceId, sourceTitle, level, message });
  if (logs.value.length > 200) logs.value.shift();
  if (level === "error" && !logsOpen.value) unreadLogErrors.value++;
}
watch(logsOpen, (open) => {
  if (open) unreadLogErrors.value = 0;
});
function objectTitle(tab: ChenWorkspaceTab) {
  if (tab.kind !== "object" || tab.title !== tab.object.name) return tab.title;
  return workspacePreferences.value.tabTitleFormat === "table-schema" && tab.object.schema
    ? `${tab.object.name}.${tab.object.schema}`
    : tab.title;
}
function newQueryTab(...args: Parameters<typeof createQueryTab>) {
  const query = createQueryTab(...args);
  query.loadingSettings = normalizeResultLoading(loadingPreferences.value);
  query.browseDraft.page_size = query.loadingSettings.batchSize;
  return query;
}
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
const sidebarPreference = useLocalStorage("jumpserver-client:chen-v1-sidebar-width", 280, {
  writeDefaults: false,
  initOnMounted: true
});
const desktopTree = computed(() => workspaceWidth.value >= 720);
const sidebarMax = computed(() => Math.max(220, Math.min(800, workspaceWidth.value - 426)));
// Keep the user's preferred width while a smaller window temporarily clamps it.
const sidebarWidth = computed({
  get: () =>
    Math.max(220, Math.min(sidebarMax.value, Number.isFinite(sidebarPreference.value) ? sidebarPreference.value : 280)),
  set: (value: number) => {
    sidebarPreference.value = value;
  }
});
const sidebarResize = usePaneResize({
  axis: "x",
  value: sidebarWidth,
  min: 220,
  max: sidebarMax,
  defaultValue: 280,
  step: 16,
  pixelsPerUnit: () => 1,
  enabled: desktopTree
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
const queries = computed(() => workspaceQueries(tabs.value));
const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value));
const sessionReady = computed(() => session.value?.state === "ready");
const insertTarget = computed(() =>
  activeTab.value && ["query", "console"].includes(activeTab.value.kind) ? workspaceQuery(activeTab.value) : undefined
);
let disposed = false;
let sequence = 0;
function nextQueryTitle(prefix = t("Chen.Query")) {
  const titles = new Set(tabs.value.map((tab) => tab.title));
  if (!titles.has(prefix)) return prefix;
  let number = 2;
  while (titles.has(`${prefix} ${number}`)) number++;
  return `${prefix} ${number}`;
}
const tabDefinitions = computed(() =>
  tabs.value.map((tab) => ({
    id: tab.id,
    label: objectTitle(tab),
    icon:
      tab.kind === "overview"
        ? "i-lucide-list-tree"
        : tab.kind === "object"
          ? "i-lucide-table-properties"
          : tab.kind === "console"
            ? "i-lucide-square-terminal"
            : "i-lucide-terminal-square",
    title: objectTitle(tab)
  }))
);
const createTabItems = computed(() => [
  {
    label: t("Chen.NewQuery"),
    icon: "i-lucide-file-code-2",
    disabled: !sessionReady.value,
    onSelect: () => newQuery()
  },
  {
    label: t("Chen.NewConsole"),
    icon: "i-lucide-square-terminal",
    disabled: !sessionReady.value,
    onSelect: () => newQuery(undefined, undefined, false, false, "console")
  }
]);
const contextTab = ref<ChenWorkspaceTab>();
const tabMenuOpen = ref(false);
const tabMenuPosition = ref({ x: 0, y: 0 });
function openTabMenu(id: string, event: MouseEvent) {
  contextTab.value = tabs.value.find((tab) => tab.id === id);
  tabMenuPosition.value = { x: event.clientX, y: event.clientY };
  tabMenuOpen.value = true;
}
function selectTabById(id: string) {
  const tab = tabs.value.find((item) => item.id === id);
  if (tab) selectTab(tab);
}
function closeTabById(id: string) {
  const tab = tabs.value.find((item) => item.id === id);
  if (tab) void closeTab(tab);
}
const failureText = (cause: unknown) => chenErrorText(cause, t);
const aiAvailable = computed(() => !!props.tab && !!getChenSqlAiSession(props.tab.id)?.enabled);
let aiGeneration = 0;
function sqlAiContext(): ChenSqlEditorContext | null {
  const active = activeTab.value;
  if (!props.tab || !sessionReady.value || !session.value) return null;
  if (active?.kind === "preview") return null;
  const query = active ? workspaceQuery(active) : null;
  const editor = active && (active.kind === "query" || active.kind === "console");
  if ((editor || active?.kind === "object") && query?.console?.state !== "ready") return null;
  const snapshot = editor ? queryPanes.get(active.id)?.snapshot() : null;
  if (editor && !snapshot) return null;
  const context = tabContext(active, defaultContext.value);
  const consoleId = query?.console?.id || "";
  return {
    documentSql: "",
    selectedSql: "",
    selectionFrom: 0,
    selectionTo: 0,
    revision: 0,
    ...snapshot,
    dialect: session.value.dialect,
    database: context.database,
    schema: context.schema,
    nodeKey: consoleId || JSON.stringify([session.value.id, context.database, context.schema]),
    consoleId,
    paneId: props.tab.id,
    tabId: editor ? active.id : "",
    workspaceTabId: active?.id || "",
    workspaceTabKind:
      active?.kind === "object" ? "data-view" : active?.kind === "overview" ? "database" : active?.kind || "none",
    currentContext: editor ? JSON.stringify(context) : "",
    lastError: editor && query && snapshot ? goSqlExecutionError(query, snapshot) : null
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
      query && isQueryWorkspaceTab(query) && ["query", "console"].includes(query.kind)
        ? [query.console?.id, query.console?.state, query.context.database, query.context.schema, query.sql]
        : query?.kind === "object"
          ? [
              query.data?.console?.id,
              query.data?.console?.state,
              query.object.database,
              query.object.schema,
              query.object.name
            ]
          : query?.kind === "overview"
            ? [query.context.database, query.context.schema]
            : [defaultContext.value.database, defaultContext.value.schema]
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
  const context = sqlAiContext();
  if (!props.tab || !context) return;
  const current = getChenSqlAiSession(props.tab.id);
  if (context.workspaceTabKind === "query" || context.workspaceTabKind === "console")
    current?.targetNextRequestToEditor();
  aiPanel?.openAi();
  if (operation === "generate" || !current?.enabled) return;
  const prompt = t(operation === "explain" ? "RightPanel.SQLAIExplainPrompt" : "RightPanel.SQLAIRepairPrompt");
  void current.request(operation, prompt, "editor").catch((cause) => {
    toast.add({ title: t("RightPanel.SQLAIUnavailableTitle"), description: failureText(cause), color: "warning" });
  });
}
function markDisconnected(reason: string) {
  appendLog("session", session.value?.asset || "Chen", "warning", reason);
  if (props.tab) workspace?.markSessionDisconnected(props.tab.id, reason);
}
function setQueryPane(id: string, value: unknown) {
  if (value) queryPanes.set(id, value as QueryPaneHandle);
  else queryPanes.delete(id);
}
function selectTab(tab: ChenWorkspaceTab) {
  activeId.value = tab.id;
  if (tab.kind === "object" && tab.section === "data") void enterObjectData(tab);
}
function insertName(text: string) {
  if (!session.value?.permissions.can_paste || !insertTarget.value) return;
  queryPanes.get(insertTarget.value.id)?.insertText(text);
  drawer.value = false;
}
async function tabKeydown(event: KeyboardEvent) {
  const elements = Array.from(tabStrip.value?.querySelectorAll<HTMLElement>('[role="tab"]') || []);
  const index = elements.indexOf(event.target as HTMLElement);
  if (index < 0) return;
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
  if (tab.kind !== "query") return;
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
  const cannotClose = (list: ChenWorkspaceTab[]) => !list.length || list.some((item) => workspaceQuery(item)?.busy);
  return [
    ...(tab.kind === "query"
      ? [{ label: t("Chen.GoV1RenameTab"), icon: "i-lucide-pencil", onSelect: () => renameTab(tab) }]
      : []),
    ...(isQueryWorkspaceTab(tab)
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
      disabled: !!workspaceQuery(tab)?.busy,
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
  execution = query.resultTabs.find((result) => result.id === id)?.execution ||
    query.resultExecution ||
    query.execution,
  sql = query.resultTabs.find((result) => result.id === id)?.sql ||
    (execution?.id === query.execution?.id ? query.executionSql : query.resultSql),
  append = false
) {
  if (!execution || editDirty(query.edit) || query.edit.busy) return;
  const generation = ++query.loadGeneration;
  query.loadingRows = true;
  query.resultLoadError = null;
  try {
    const settings = query.pendingLoading || query.loadingSettings;
    const limit = settings.batchSize;
    let page = await api.rows(id, offset, limit);
    const replacesSource =
      execution.id === query.execution?.id &&
      !query.resultTabs.some((result) => result.id === page.id) &&
      !!(query.executionRefresh || query.executionBrowse || query.executionQueryPage);
    const refreshing = replacesSource && !!query.executionRefresh;
    if (
      refreshing &&
      !page.browse?.supported &&
      page.query_page?.mode !== "database" &&
      offset >= page.total_rows &&
      offset > 0
    ) {
      offset = Math.floor(Math.max(0, page.total_rows - 1) / limit) * limit;
      page = await api.rows(id, offset, limit);
    }
    if (isCurrent(query) && generation === query.loadGeneration) {
      const previousResultId = query.rows?.id;
      const changedResult = previousResultId !== page.id;
      const previousResults = [...query.resultTabs.map((result) => result.id), query.cachedResult?.id].filter(
        (value): value is string => !!value
      );
      const previousBrowse = query.rows?.browse;
      const browseCount = query.browseCount;
      const browseRequest = execution?.id === query.execution?.id ? query.executionBrowse : undefined;
      // Carry a server count only across pages of the same applied query. Refresh and new filters invalidate it.
      const keepBrowseCount =
        browseCount &&
        browseRequest &&
        browseRequest.source_result_id === query.rows?.id &&
        browseCount.source_result_id === query.rows?.id &&
        (browseRequest.offset === undefined || browseRequest.offset === page.browse?.offset) &&
        (browseRequest.page_size === undefined || browseRequest.page_size === page.browse?.page_size) &&
        ((browseRequest.offset !== undefined && browseRequest.offset !== previousBrowse?.offset) ||
          (browseRequest.page_size !== undefined && browseRequest.page_size !== previousBrowse?.page_size));
      if (refreshing || (page.query_page?.mode !== "database" && page.id !== query.cachedResult?.id))
        query.cachedResult = undefined;
      if (
        page.browse?.supported &&
        (!query.rows?.browse?.supported ||
          (changedResult &&
            execution?.id === query.execution?.id &&
            query.executionBrowse &&
            !query.executionBrowse.source_result_id))
      ) {
        query.browseDraft = {
          where: page.browse.where,
          filter: page.browse.filter ? structuredClone(toRaw(page.browse.filter)) : undefined,
          sort: page.browse.sort.map((item) => ({ ...item })),
          page_size: page.browse.page_size
        };
      }
      if (append) {
        const previous = query.rows;
        if (!previous || previous.id !== page.id || previous.offset !== 0 || previous.rows.length !== page.offset)
          return;
        query.rows = { ...page, offset: 0, rows: [...previous.rows, ...page.rows] };
      } else query.rows = page;
      if (query.pendingLoading) {
        query.loadingSettings = { ...query.pendingLoading };
        loadingPreferences.value = { ...query.pendingLoading };
        query.browseDraft.page_size = query.pendingLoading.batchSize;
        query.pendingLoading = null;
      }
      if (page.browse?.supported) {
        query.browseDraft.page_size = page.browse.page_size;
        query.loadingSettings.batchSize = page.browse.page_size;
      }
      query.loadMoreFailed = false;
      if (changedResult) {
        query.browseCount =
          page.browse?.supported && keepBrowseCount ? { ...browseCount, source_result_id: page.id } : null;
        query.queryCount =
          !refreshing &&
          page.query_page?.mode === "database" &&
          page.query_page.scope_id &&
          query.queryCount?.scope_id === page.query_page.scope_id
            ? { ...query.queryCount, source_result_id: page.id }
            : null;
      }
      if (page.query_page?.mode === "database") {
        query.loadingSettings = { mode: "page", batchSize: page.query_page.page_size };
      }
      if (changedResult) {
        const refresh = refreshing ? query.executionRefresh : undefined;
        query.resultViewId = refresh?.viewId || id;
        query.edit = createEditDraft();
        if (refresh) {
          query.edit.status = refresh.status;
          query.edit.saveError = refresh.saveError;
          const currentOffset = page.browse?.supported
            ? page.browse.offset
            : page.query_page?.mode === "database"
              ? page.query_page.offset
              : 0;
          const pageSize = page.browse?.page_size || page.query_page?.page_size || limit;
          if (!page.rows.length && currentOffset > 0) refresh.retryOffset = Math.max(0, currentOffset - pageSize);
        }
      }
      query.resultId = id;
      query.resultTransactionRevision = execution.transaction?.revision ?? query.console?.transaction?.revision;
      // Row loading may finish after more statements or audit updates arrive.
      // Retain the latest snapshot for this execution without changing its SQL source.
      query.resultExecution = {
        ...(query.execution?.id === execution.id
          ? query.execution
          : query.resultExecution?.id === execution.id
            ? query.resultExecution
            : execution)
      };
      query.resultSql = page.source_sql || sql;
      if (execution.id === query.execution?.id) query.loadedExecutionId = execution.id;
      const resultTab = { id: page.id, execution: query.resultExecution, sql: query.resultSql };
      if (query.resultTabs.some((result) => result.id === page.id)) {
        query.resultTabs = query.resultTabs.map((result) => (result.id === page.id ? resultTab : result));
      } else if (previousResultId && replacesSource) {
        query.replacedResultIds.push(previousResultId);
        query.resultTabs = query.resultTabs.length
          ? query.resultTabs.map((result) => (result.id === previousResultId ? resultTab : result))
          : [resultTab];
      } else {
        query.replacedResultIds = [];
        query.resultTabs = (query.pinnedSource ? [page.id] : query.resultExecution.result_ids).map((resultId) => ({
          id: resultId,
          execution: query.resultExecution!,
          sql:
            query.resultExecution!.statement_results.find((result) => result.result_id === resultId)?.source_sql ||
            query.resultSql
        }));
      }
      // Pinning retains the same data view until its owner runs another SQL result.
      // A refreshed shared source must not reappear stale when the pin is removed.
      if (changedResult && previousResultId && replacesSource) {
        for (const peer of queries.value) {
          if (
            peer === query ||
            peer.console?.id !== query.console?.id ||
            !peer.resultTabs.some((result) => result.id === previousResultId)
          )
            continue;
          if (
            peer.rows?.id === previousResultId &&
            (editDirty(peer.edit) || peer.edit.busy || executionActive(peer.execution))
          ) {
            peer.edit.refreshRequired = true;
            continue;
          }
          peer.replacedResultIds.push(previousResultId);
          peer.resultTabs = peer.resultTabs.map((result) => (result.id === previousResultId ? resultTab : result));
          if (peer.rows?.id !== previousResultId) continue;
          const previousExecution = peer.resultExecution;
          peer.rows = query.rows;
          peer.resultId = page.id;
          peer.resultSql = query.resultSql;
          peer.resultTransactionRevision = query.resultTransactionRevision;
          peer.loadingSettings = { ...query.loadingSettings };
          peer.browseDraft = JSON.parse(JSON.stringify(query.browseDraft));
          peer.browseCount = query.browseCount;
          peer.queryCount = query.queryCount;
          peer.cachedResult = query.cachedResult;
          peer.resultExecution = query.resultExecution;
          if (peer.execution?.id === previousExecution?.id) {
            peer.execution = query.execution;
            peer.executionSql = query.executionSql;
            peer.executionVersion = query.executionVersion;
            peer.loadedExecutionId = query.loadedExecutionId;
            peer.executionBrowse = query.executionBrowse;
            peer.executionQueryPage = query.executionQueryPage;
            peer.executionRefresh = undefined;
            peer.executionEditPlan = undefined;
            peer.executionPlanNumber = undefined;
          }
          peer.edit = { ...createEditDraft(), status: query.edit.status, saveError: query.edit.saveError };
        }
      }
      if (query.kind !== "console") {
        const retained = new Set(
          queries.value.flatMap((item) => [
            item.rows?.id,
            item.cachedResult?.id,
            ...item.resultTabs.map((result) => result.id)
          ])
        );
        for (const previous of new Set(previousResults)) {
          if (!retained.has(previous)) void api.releaseResult(previous).catch(() => {});
        }
      }
    }
  } catch (cause) {
    if (isCurrent(query) && generation === query.loadGeneration) {
      query.resultLoadError = { message: failureText(cause), id, offset, execution, sql, append };
      if (append) query.loadMoreFailed = true;
    }
  } finally {
    if (generation === query.loadGeneration) query.loadingRows = false;
  }
}
function retryRows(query: QueryWorkspaceTab) {
  const failed = query.resultLoadError;
  if (failed) void loadRows(query, failed.id, failed.offset, failed.execution, failed.sql, failed.append);
}
function acceptExecution(query: QueryWorkspaceTab, value: GoExecution) {
  if (!isCurrent(query) || !acceptQueryExecution(query, value)) return;
  acceptEditExecution(query.edit, value);
  if (!query.pinnedSource && query.resultTabs.some((result) => result.execution.id === value.id)) {
    for (const id of value.result_ids) {
      if (!query.replacedResultIds.includes(id) && !query.resultTabs.some((result) => result.id === id)) {
        query.resultTabs.push({
          id,
          execution: value,
          sql:
            value.statement_results.find((result) => result.result_id === id)?.source_sql ||
            value.sql ||
            query.executionSql
        });
      }
    }
  }
  const logState = `${value.status}:${value.audit_status}`;
  const notExecuted = value.error?.code === "implicit_commit_confirmation_required";
  if (loggedExecutions.get(value.id) !== logState) {
    loggedExecutions.set(value.id, logState);
    if (loggedExecutions.size > 200) loggedExecutions.delete(loggedExecutions.keys().next().value!);
    appendLog(
      query.id,
      query.title,
      (value.status === "failed" && !notExecuted) || value.audit_status === "failed"
        ? "error"
        : value.status === "unknown"
          ? "warning"
          : "info",
      `${t(notExecuted ? "Chen.Transaction.NotExecuted" : `Chen.GoV1Status_${value.status}`)} · ${value.id}${value.error && !notExecuted ? ` · ${failureText(value.error)}` : ""} · ${t("Chen.GoV1Audit")}: ${t(`Chen.GoV1Audit_${value.audit_status}`)}`
    );
  }
  if (!["queued", "running", "waiting_review", "cancel_requested", "succeeded"].includes(value.status)) {
    if (query.executionBrowse?.action === "append") query.loadMoreFailed = true;
    if (!["command_review_required", "command_warning_confirmation_required"].includes(value.error?.code || ""))
      query.pendingLoading = null;
  }
  if (value.status === "succeeded" && value.browse_count && value.browse_count.source_result_id === query.rows?.id)
    query.browseCount = value.browse_count;
  if (
    value.status === "succeeded" &&
    value.query_count &&
    value.query_count.source_result_id === query.rows?.id &&
    value.query_count.scope_id === query.rows.query_page?.scope_id
  )
    query.queryCount = value.query_count;
  const execution = query.execution!;
  const run = query.planRuns.find((item) => item.number === query.executionPlanNumber);
  if (run && run.state === "pending" && !executionActive(execution)) {
    if (execution.plan) {
      run.planRequestId = execution.plan.request_id;
      void loadQueryPlan(query, run, api);
    } else {
      run.state = "failed";
      run.error = execution.error ? failureText(execution.error) : t(`Chen.GoV1Status_${execution.status}`);
    }
  }
  if (
    !query.execution?.plan &&
    (!query.executionBrowse || value.status === "succeeded") &&
    (!query.executionQueryPage || value.status === "succeeded") &&
    value.result_ids?.length &&
    query.loadedExecutionId !== value.id &&
    !query.loadingRows &&
    !query.resultLoadError
  )
    void loadRows(
      query,
      value.result_ids[0]!,
      query.executionBrowse?.action === "append"
        ? query.executionBrowse.offset || 0
        : query.executionRefresh?.offset || 0,
      query.execution,
      query.executionSql,
      query.executionBrowse?.action === "append"
    );
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
  interruptQueryPlans(query);
  if (query.console) query.console.state = "lost";
  if (query.execution && executionActive(query.execution)) query.execution = { ...query.execution, status: "unknown" };
  query.error = t("Chen.GoV1ConnectionLost");
}
function acceptConsole(query: QueryWorkspaceTab, value: GoConsole) {
  if ((value.transaction?.revision ?? 0) < (query.console?.transaction?.revision ?? 0)) return;
  if (
    query.rows &&
    value.transaction?.notice &&
    value.transaction.notice.id !== query.console?.transaction?.notice?.id
  ) {
    query.edit.refreshRequired = true;
    query.edit.transactionStale = true;
    if (query.edit.status === "staged") query.edit.status = value.transaction.notice.outcome;
  }
  query.console = value;
  query.context = { database: value.database, schema: value.schema };
}
function acceptEvent(event: GoEvent) {
  if (event.sequence <= sequence && event.type !== "reset") return;
  sequence = event.sequence;
  if (event.type === "ai.message" && props.tab && sessionReady.value)
    handleChenSqlAiWireMessage(props.tab.id, event.data);
  if (event.type === "execution.updated") {
    const value = event.data as GoExecution;
    for (const query of queries.value.filter((query) => query.console?.id === value.console_id))
      acceptExecution(query, value);
  }
  if (event.type === "export.updated") {
    const value = event.data as GoExport;
    const query = queries.value.find((query) => query.exportJob?.id === value.id);
    if (query) acceptExport(query, value);
  }
  if (event.type === "session.updated") session.value = event.data as GoSession;
  if (event.type === "console.updated") {
    const value = event.data as GoConsole;
    for (const query of queries.value.filter((query) => query.console?.id === value.id)) {
      acceptConsole(query, value);
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
      if (current) acceptConsole(query, current);
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
  browse = false,
  kind: "query" | "console" = "query"
) {
  if (!sessionReady.value) return;
  if (object && !preview && !browse && !session.value?.permissions.can_paste) return;
  const sql = object ? objectSelect(object, session.value!.dialect, preview) : "";
  const query = reactive(
    newQueryTab(
      nextQueryTitle(t(preview ? "Chen.GoV1Preview" : kind === "console" ? "Chen.Console" : "Chen.Query")),
      context,
      sql,
      !!object && !preview
    )
  );
  query.kind = kind;
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
async function browseTable(query: QueryWorkspaceTab, request?: GoBrowseRequest, refresh = false): Promise<void> {
  if (
    !query.browseObject ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    executionActive(query.execution) ||
    query.loadingRows ||
    query.edit.busy ||
    editDirty(query.edit)
  )
    return;
  const appliedRequest: GoBrowseRequest =
    request ||
    (query.rows?.browse?.supported
      ? { source_result_id: query.rows.id, offset: query.rows.browse.offset }
      : {
          schema: query.browseObject.schema,
          table: query.browseObject.name,
          page_size: query.loadingSettings.batchSize
        });
  // The user already requested this read, just as in the Java console.
  // Source/context validation, ACL review and transaction guards remain server-side.
  appliedRequest.confirm_reexecution = true;
  query.loadGeneration++;
  query.resultLoadError = null;
  query.pending = {
    sql: objectSelect(query.browseObject, session.value!.dialect, true),
    version: 1,
    id: newChenRequestId(),
    browse: appliedRequest,
    refresh
  };
  await recoverSubmission(query);
}
async function pageQuery(query: QueryWorkspaceTab, request: GoQueryPageRequest, refresh = false): Promise<void> {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    resultLoadingLocked(query, refresh) ||
    request.source_result_id !== query.rows?.id
  )
    return;
  request = { ...request, confirm_reexecution: true };
  if (request.action === "page" && query.rows?.query_page?.mode !== "database" && query.resultExecution) {
    query.cachedResult = {
      id: query.rows!.id,
      offset: query.rows!.offset,
      execution: query.resultExecution,
      sql: query.resultSql,
      loadingSettings: { ...query.loadingSettings }
    };
  }
  query.loadGeneration++;
  query.resultLoadError = null;
  query.pending = {
    sql: query.resultSql,
    version: query.executionVersion,
    id: newChenRequestId(),
    queryPage: request,
    refresh
  };
  await recoverSubmission(query);
}
async function restoreCachedResult(query: QueryWorkspaceTab) {
  const cached = query.cachedResult;
  if (
    !cached ||
    cached.execution.console_id !== query.console?.id ||
    !isCurrent(query) ||
    !sessionReady.value ||
    resultLoadingLocked(query)
  )
    return;
  query.pendingLoading = { ...cached.loadingSettings };
  await loadRows(query, cached.id, cached.offset, cached.execution, cached.sql);
}
async function changeLoading(query: QueryWorkspaceTab, input: GoResultLoadingSettings) {
  if (!sessionReady.value || resultLoadingLocked(query)) return;
  const settings = normalizeResultLoading(input);
  settings.batchSize = Math.min(
    settings.batchSize,
    query.rows?.browse?.supported ? query.rows.browse.max_page_size : 1000
  );
  if (query.rows?.query_page?.mode === "database") settings.mode = "page";
  if (settings.mode === query.loadingSettings.mode && settings.batchSize === query.loadingSettings.batchSize) return;
  query.pendingLoading = settings;
  query.loadMoreFailed = false;
  if (query.rows?.query_page?.mode === "database") {
    settings.batchSize = Math.min(settings.batchSize, query.rows.query_page.max_page_size);
    await pageQuery(query, {
      source_result_id: query.rows.id,
      action: "page",
      page_size: settings.batchSize,
      offset: 0
    });
  } else if (query.rows?.browse?.supported) {
    await browseTable(query, { source_result_id: query.rows.id, page_size: settings.batchSize, offset: 0 });
  } else if (query.rows) await loadRows(query, query.rows.id, 0);
  else {
    query.loadingSettings = settings;
    query.browseDraft.page_size = settings.batchSize;
    loadingPreferences.value = { ...settings };
    query.pendingLoading = null;
  }
}
async function loadMore(query: QueryWorkspaceTab, automatic = false) {
  if (
    !sessionReady.value ||
    resultLoadingLocked(query) ||
    !hasMoreResultRows(query) ||
    (automatic && (query.loadMoreFailed || !queryVisible(query)))
  )
    return;
  query.loadMoreFailed = false;
  const rows = query.rows!;
  if (query.resultLoadError) {
    retryRows(query);
    return;
  }
  if (rows.next_offset !== undefined) {
    await loadRows(query, rows.id, rows.next_offset, undefined, undefined, true);
  } else if (rows.browse?.supported) {
    await browseTable(query, { action: "append", source_result_id: rows.id, offset: rows.rows.length });
    if (query.error) query.loadMoreFailed = true;
  }
}
async function applyEdits(query: QueryWorkspaceTab, plan: GoEditPlan) {
  if (
    query.readOnly ||
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
async function refreshData(query: QueryWorkspaceTab, targetOffset?: number, afterSave = false) {
  if (!isCurrent(query) || !sessionReady.value || resultLoadingLocked(query, true) || !query.rows) return;
  if (query.browseObject)
    await browseTable(
      query,
      targetOffset === undefined
        ? undefined
        : {
            source_result_id: query.rows.id,
            offset: targetOffset
          },
      true
    );
  else if (!afterSave && !query.rows.query_page?.supported && !query.edit.metadata?.supported)
    await submit(query, query.resultSql, query.executionVersion, false, true);
  else
    await pageQuery(
      query,
      {
        source_result_id: query.rows.id,
        action: query.rows.query_page?.mode === "database" ? "page" : "refresh",
        offset:
          targetOffset ??
          (query.rows.query_page?.mode === "database" ? query.rows.query_page.offset : query.rows.offset),
        page_size:
          query.rows.query_page?.mode === "database" ? query.rows.query_page.page_size : query.loadingSettings.batchSize
      },
      true
    );
}
// Refresh from the session lifecycle, including background tabs and manual transactions.
// Failed/uncertain writes retain their draft and outcome until the user discards it.
const refreshedEdits = new WeakMap<QueryWorkspaceTab, string>();
watch(
  () =>
    queries.value.map((query) => [
      query.execution?.id,
      query.execution?.status,
      query.busy,
      query.pending,
      query.loadingRows,
      query.edit.status,
      query.edit.busy,
      query.executionRefresh?.retryOffset,
      sessionReady.value
    ]),
  () => {
    for (const query of queries.value) {
      const execution = query.execution;
      if (
        execution?.status === "succeeded" &&
        query.executionRefresh?.retryOffset !== undefined &&
        sessionReady.value &&
        !resultLoadingLocked(query, true)
      ) {
        const offset = query.executionRefresh.retryOffset;
        query.executionRefresh.retryOffset = undefined;
        void refreshData(query, offset, true);
        continue;
      }
      if (
        execution?.status !== "succeeded" ||
        !execution.edit?.changes_applied ||
        !["committed", "staged"].includes(query.edit.status) ||
        refreshedEdits.get(query) === execution.id ||
        !query.rows ||
        !sessionReady.value ||
        resultLoadingLocked(query, true)
      )
        continue;
      refreshedEdits.set(query, execution.id);
      void refreshData(query, undefined, true);
    }
  }
);

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
  const query = reactive(newQueryTab(nextQueryTitle(), target.context, sql, true));
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
  const query = reactive(newQueryTab(nextQueryTitle(), context, sql, true));
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  await connectQuery(query);
}
function queryVisible(query: QueryWorkspaceTab) {
  const tab = activeTab.value;
  const owner = tab && workspaceQuery(tab);
  return (
    !!owner &&
    (owner === query || owner.pinnedResultId === query.id) &&
    (tab!.kind !== "object" || tab!.section === "data")
  );
}
async function enterObjectData(tab: ObjectWorkspaceTab) {
  if (!sessionReady.value || tab.section !== "data") return;
  recentObjects.value = [
    { ...tab.object },
    ...recentObjects.value.filter(
      (item) => objectWorkspaceKey(session.value!.id, item) !== objectWorkspaceKey(session.value!.id, tab.object)
    )
  ].slice(0, 10);
  if (!tab.data) {
    const query = newQueryTab(
      tab.title,
      { database: tab.object.database, schema: tab.object.schema },
      objectSelect(tab.object, session.value!.dialect, true)
    );
    query.kind = "preview";
    query.readOnly = tab.object.kind === "view" || session.value!.dialect === "clickhouse";
    query.browseObject = tab.object;
    tab.data = query;
  }
  const query = tab.data;
  if (query.console || query.busy) return;
  await connectQuery(query);
  if (!isCurrent(query) || (query.console as GoConsole | null)?.state !== "ready") return;
  if (query.browseObject) await browseTable(query);
  else await submit(query, query.sql, 1);
}
function objectSection(tab: ObjectWorkspaceTab, section: ObjectWorkspaceSection) {
  if (section === "diagram" && tab.object.kind !== "table") return;
  tab.section = section;
  if (section === "data") void enterObjectData(tab);
}
function openObject(object: GoCatalogObject, section: ObjectWorkspaceSection = "data") {
  if (!session.value) return;
  const key = objectWorkspaceKey(session.value.id, object);
  let tab = tabs.value.find(
    (item): item is ObjectWorkspaceTab =>
      item.kind === "object" && objectWorkspaceKey(item.sessionId, item.object) === key
  );
  if (!tab) {
    tab = reactive<ObjectWorkspaceTab>({
      id: newChenRequestId(),
      kind: "object",
      title: object.name,
      object: { ...object },
      sessionId: session.value.id,
      section,
      data: null
    });
    tabs.value.push(tab);
  }
  activeId.value = tab.id;
  drawer.value = false;
  objectSection(tab, section);
}
function openOverview(context: QueryContext, section: "diagram" | "basic" = "basic") {
  if (!sessionReady.value || !context.database) return;
  const id = `overview:${JSON.stringify([session.value?.id, context.database, context.schema])}`;
  if (!tabs.value.some((tab) => tab.id === id))
    tabs.value.push({
      id,
      kind: "overview",
      section,
      title: context.schema || context.database,
      context: { ...context }
    });
  const tab = tabs.value.find((tab) => tab.id === id);
  if (tab?.kind === "overview") tab.section = section;
  activeId.value = id;
  drawer.value = false;
}
async function submit(query: QueryWorkspaceTab, sql: string, version: number, plan = false, refresh = false) {
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
  if (!plan) query.resultPane = "results";
  query.pending = {
    sql,
    version,
    id: newChenRequestId(),
    refresh,
    ...(plan ? { planNumber: openQueryPlan(query, sql) } : {})
  };
  await recoverSubmission(query);
}
async function transactionAction(query: QueryWorkspaceTab, transaction: GoTransactionRequest) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    executionActive(query.execution) ||
    editDirty(query.edit) ||
    query.edit.busy
  )
    return;
  query.pending = {
    sql:
      transaction.action === "commit"
        ? "COMMIT"
        : transaction.action === "rollback"
          ? "ROLLBACK"
          : transaction.action === "manual"
            ? "BEGIN"
            : "AUTOCOMMIT",
    version: 0,
    id: newChenRequestId(),
    transaction
  };
  await recoverSubmission(query);
}
async function confirmImplicitCommit(query: QueryWorkspaceTab, executionId: string) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.pending ||
    editDirty(query.edit) ||
    query.edit.busy ||
    query.execution?.id !== executionId ||
    query.execution.error?.code !== "implicit_commit_confirmation_required"
  )
    return;
  const revision = query.execution.transaction?.revision;
  if (!revision || query.console.transaction?.revision !== revision) return;
  query.pending = {
    sql: query.executionSql,
    version: query.executionVersion,
    id: newChenRequestId(),
    transaction: { confirmImplicit: true, revision },
    submitReview: query.executionSubmitReview,
    confirmWarnings: query.executionConfirmWarnings
  };
  await recoverSubmission(query);
}
async function explainQuery(query: QueryWorkspaceTab, sql: string, version: number) {
  await submit(query, sql, version, true);
}
async function recoverSubmission(query: QueryWorkspaceTab) {
  const pending = query.pending;
  if (!pending || !sessionReady.value || query.console?.state !== "ready" || query.busy) return;
  const run = query.planRuns.find((item) => item.number === pending.planNumber);
  if (run) {
    run.state = "pending";
    run.error = "";
    run.plan = null;
    run.executionId = "";
    run.planRequestId = "";
  }
  query.busy = true;
  query.error = "";
  try {
    const value = pending.queryPage
      ? await api.queryPage(
          query.console.id,
          pending.queryPage,
          pending.id,
          pending.submitReview,
          pending.confirmWarnings
        )
      : pending.editPlanId
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
              pending.browse.schema || "",
              pending.browse.table || "",
              pending.id,
              pending.submitReview,
              pending.confirmWarnings,
              pending.browse
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
                !!pending.planNumber,
                pending.transaction,
                query.kind === "console" && !pending.planNumber && !pending.transaction?.action
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
    query.executionPlanNumber = pending.planNumber;
    if (run) run.executionId = value.id;
    if (!pending.planNumber) query.resultPane = "results";
    query.executionTransaction = pending.transaction;
    query.executionConfirmWarnings = !!pending.confirmWarnings;
    query.executionSubmitReview = !!pending.submitReview;
    query.executionExportFormat = pending.exportFormat;
    query.executionEditPlan = pending.editPlanId;
    query.executionRefresh =
      pending.refresh && query.rows
        ? {
            viewId: query.resultViewId || query.rows.id,
            offset: query.rows.browse?.supported || query.rows.query_page?.mode === "database" ? 0 : query.rows.offset,
            status: query.edit.status,
            saveError: query.edit.saveError
          }
        : undefined;
    query.executionBrowse = pending.browse;
    query.executionQueryPage = pending.queryPage;
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
    if (cause instanceof ChenGoError && cause.status >= 400 && cause.status < 500) {
      query.pending = null;
      query.pendingLoading = null;
    }
    query.error = query.pending ? `${t("Chen.GoV1SubmissionUnknown")} ${failureText(cause)}` : failureText(cause);
    if (run && !run.executionId) {
      run.state = "failed";
      run.error = query.error;
    }
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function startExport(
  query: QueryWorkspaceTab,
  mode: "query" | "cached",
  format: GoExportFormat,
  snapshot: { sql: string; resultId: string; version: number; rows?: number }
): Promise<void> {
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
    if (query.browseObject && !query.rows?.browse?.supported) return;
    query.pending = {
      sql: snapshot.sql,
      version: snapshot.version,
      id: newChenRequestId(),
      exportFormat: format,
      ...(query.rows?.query_page?.supported
        ? {
            queryPage: {
              source_result_id: snapshot.resultId,
              action: "export",
              format,
              confirm_reexecution: true
            } as GoQueryPageRequest
          }
        : query.browseObject
          ? {
              browse: {
                source_result_id: snapshot.resultId,
                action: "export",
                format,
                confirm_reexecution: true
              } as GoBrowseRequest
            }
          : {})
    };
    await recoverSubmission(query);
    return;
  }
  if (!snapshot.resultId) return;
  // On an unknown HTTP outcome, recover exactly the same request before offering another export.
  query.pendingCachedExport ||= { resultId: snapshot.resultId, format, id: newChenRequestId(), rows: snapshot.rows };
  const pending = query.pendingCachedExport;
  query.exportBusy = true;
  query.error = "";
  try {
    const value = await api.exportCached(pending.resultId, pending.format, pending.id, pending.rows);
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
async function confirmPolicy(query: QueryWorkspaceTab, executionId: string, confirmationId: string, accepted: boolean) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.busy ||
    query.pending ||
    query.execution?.id !== executionId ||
    query.execution.confirmation?.id !== confirmationId
  )
    return;
  query.busy = true;
  query.error = "";
  try {
    acceptExecution(query, await api.confirmExecution(executionId, confirmationId, accepted));
    await syncExecution(query);
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function requestReview(query: QueryWorkspaceTab, executionId: string, confirmationId?: string) {
  if (query.execution?.id !== executionId) return;
  if (confirmationId) return confirmPolicy(query, executionId, confirmationId, true);
  if (!isCurrent(query) || !sessionReady.value || query.console?.state !== "ready" || query.busy || query.pending)
    return;
  const pending = reviewSubmission(query);
  if (!pending) return;
  query.pending = pending;
  await recoverSubmission(query);
}
async function confirmWarning(query: QueryWorkspaceTab, executionId: string, confirmationId?: string) {
  if (confirmationId) return confirmPolicy(query, executionId, confirmationId, true);
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

const closeDialog = ref<(ReturnType<typeof closeWarnings> & { keepConnection?: boolean }) | null>(null);
let closeResolver: ((value: boolean) => void) | undefined;
function confirmClose(list: QueryWorkspaceTab[], preserveSqlDrafts = false, keepConnection = false) {
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
  if (keepConnection) warnings.transaction = false;
  if (preserveSqlDrafts) warnings.dirty = list.some((query) => editDirty(query.edit));
  if (!Object.values(warnings).some(Boolean)) return Promise.resolve(true);
  if (closeResolver) return Promise.resolve(false);
  closeDialog.value = { ...warnings, keepConnection };
  return new Promise<boolean>((resolve) => {
    closeResolver = resolve;
  });
}
function finishClose(value: boolean) {
  closeDialog.value = null;
  closeResolver?.(value);
  closeResolver = undefined;
}
function pinResult(source: QueryWorkspaceTab, sql: string, title: string, view?: QueryWorkspaceTab["gridView"]) {
  if (!source.rows || editDirty(source.edit) || source.edit.busy || source.loadingRows) return;
  const query = createQueryTab(title, source.context, sql);
  query.kind = "preview";
  query.console = source.console;
  query.readOnly = source.readOnly;
  query.browseObject = source.browseObject;
  query.loadingSettings = { ...source.loadingSettings };
  query.browseDraft = JSON.parse(JSON.stringify(source.browseDraft));
  query.rows = source.rows;
  query.resultId = source.resultId;
  query.resultSql = sql;
  query.resultViewId = source.resultViewId || source.rows.id;
  query.resultTransactionRevision = source.resultTransactionRevision;
  query.gridView = view;
  query.edit.metadata = source.edit.metadata;
  query.resultExecution = source.resultExecution;
  query.resultTabs = source.resultExecution ? [{ id: source.rows.id, execution: source.resultExecution, sql }] : [];
  query.pinnedSource = true;
  query.loadedExecutionId = source.resultExecution?.id;
  query.execution = query.resultExecution;
  query.executionSql = query.resultSql;
  query.executionVersion = source.executionVersion;
  query.cachedResult = source.cachedResult;
  source.pinnedResults.push(query);
  source.pinnedResultId = query.id;
}
async function closePinned(owner: QueryWorkspaceTab, query: QueryWorkspaceTab) {
  if (
    !owner.pinnedResults.includes(query) ||
    query.busy ||
    query.exportBusy ||
    !(await confirmClose([query], false, true))
  )
    return;
  try {
    if (executionActive(query.execution)) await api.cancel(query.execution!.id);
    if (exportActive(query.exportJob)) await api.cancelExport(query.exportJob!.id);
  } catch (cause) {
    query.error = failureText(cause);
    return;
  }
  query.closed = true;
  query.loadGeneration++;
  owner.pinnedResults = owner.pinnedResults.filter((item) => item !== query);
  if (owner.pinnedResultId === query.id) owner.pinnedResultId = null;
  const retained = new Set(
    queries.value.flatMap((item) => [
      item.rows?.id,
      item.cachedResult?.id,
      ...item.resultTabs.map((result) => result.id)
    ])
  );
  for (const id of new Set([query.rows?.id, query.cachedResult?.id, ...query.resultTabs.map((result) => result.id)])) {
    if (id && !retained.has(id)) void api.releaseResult(id).catch(() => {});
  }
}
async function closeTabs(list: ChenWorkspaceTab[]) {
  const queries = workspaceQueries(list);
  if (queries.some((query) => query.busy) || !(await confirmClose(queries))) return;
  for (const tab of list) await closeTab(tab, true);
}
async function closeTab(tab: ChenWorkspaceTab, confirmed = false) {
  const query = workspaceQuery(tab);
  if (query) {
    if (
      [query, ...query.pinnedResults].some((item) => item.busy || item.exportBusy) ||
      (!confirmed && !(await confirmClose([query, ...query.pinnedResults]))) ||
      !isCurrent(query)
    )
      return;
    if (
      session.value?.can_cancel === false &&
      executionActive(query.execution) &&
      query.execution?.status !== "waiting_review"
    ) {
      query.error = t("Chen.GoV1CloseCancelUnsupported");
      return;
    }
    query.busy = true;
    const queryApi = api;
    try {
      for (const item of [query, ...query.pinnedResults]) {
        if (item.execution && executionActive(item.execution)) await queryApi.cancel(item.execution.id);
        if (exportActive(item.exportJob)) await queryApi.cancelExport(item.exportJob!.id);
      }
      if (query.console && query.console.state !== "closed" && session.value?.state !== "closed")
        await queryApi.closeConsole(query.console.id);
    } catch (cause) {
      query.error = failureText(cause);
      query.busy = false;
      return;
    }
    if (!isCurrent(query)) return;
    for (const item of [query, ...query.pinnedResults]) {
      item.closed = true;
      item.loadGeneration++;
    }
  }
  const index = tabs.value.indexOf(tab);
  if (index < 0) return;
  tabs.value.splice(index, 1);
  if (activeId.value === tab.id) activeId.value = tabs.value[Math.max(0, index - 1)]?.id || "";
}
async function reconnect(query: QueryWorkspaceTab): Promise<void> {
  const owner = queries.value.find((item) => item.pinnedResults.includes(query));
  if (owner) return reconnect(owner);
  if (!sessionReady.value || query.busy || !(await confirmClose([query, ...query.pinnedResults])) || !isCurrent(query))
    return;
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
  for (const pinned of query.pinnedResults) pinned.closed = true;
  query.pinnedResults = [];
  query.pinnedResultId = null;
  query.pending = null;
  query.edit = createEditDraft();
  query.rows = null;
  query.cachedResult = undefined;
  query.resultId = "";
  query.resultExecution = null;
  query.resultTabs = [];
  query.replacedResultIds = [];
  query.loadedExecutionId = undefined;
  query.resultSql = "";
  query.loadGeneration++;
  query.planRuns = [];
  query.executionPlanNumber = undefined;
  query.resultPane = "results";
  await connectQuery(query);
  if (tabs.value.some((tab) => tab.kind === "object" && tab.data === query) && isCurrent(query)) {
    if (query.browseObject) await browseTable(query);
    else await submit(query, query.sql, 1);
  }
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
  tabs.value = tabs.value
    .filter((tab) => tab.kind !== "overview")
    .map((tab) => {
      const query = workspaceQuery(tab);
      if (!query) return { ...tab };
      query.closed = true;
      query.loadGeneration++;
      const restored = {
        ...newQueryTab(query.title, query.context, query.sql),
        id: query.id,
        kind: query.kind,
        baselineSql: query.baselineSql,
        browseObject: query.browseObject,
        readOnly: query.readOnly,
        loadingSettings: { ...query.loadingSettings },
        browseDraft: structuredClone(toRaw(query.browseDraft))
      };
      return tab.kind === "object" ? { ...tab, data: restored } : restored;
    });
  if (!tabs.value.some((tab) => tab.id === activeId.value)) activeId.value = tabs.value[0]?.id || "";
  session.value = null;
  recentObjects.value = [];
  logs.value = [];
  unreadLogErrors.value = 0;
  loggedExecutions.clear();
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
      for (const tab of tabs.value) if (tab.kind === "object") tab.sessionId = authenticated.id;
      // Only SQL pages reconnect eagerly. Object data connects on its next explicit visit.
      const sqlQueries = tabs.value.filter(isQueryWorkspaceTab);
      if (sqlQueries.length) await Promise.all(sqlQueries.map(connectQuery));
      else if (!tabs.value.length) await newQuery();
      const active = activeTab.value;
      if (active?.kind === "object" && active.section === "data") await enterObjectData(active);
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
            ? 'relative flex'
            : drawer
              ? 'absolute inset-y-0 left-0 z-20 flex max-w-[90%] border-r border-default shadow-xl'
              : 'hidden'
        "
        :style="{ width: `${desktopTree ? sidebarWidth : 360}px` }"
      >
        <GoCatalogTree
          :api="api"
          :session-id="session.id"
          :dialect="session.dialect"
          :database="defaultContext.database"
          :schema="defaultContext.schema"
          :asset="session.asset || selector || ''"
          :ready="sessionReady"
          :can-paste="session.permissions.can_paste"
          :can-copy="session.permissions.can_copy"
          :can-insert="!!insertTarget"
          :recent-objects="recentObjects"
          :active-object="activeTab?.kind === 'object' ? activeTab.object : undefined"
          :active-scope="activeTab ? tabContext(activeTab, defaultContext) : undefined"
          @default-context="defaultContext = $event"
          @remove-recent="
            (object) =>
              (recentObjects = recentObjects.filter(
                (item) => objectWorkspaceKey(session!.id, item) !== objectWorkspaceKey(session!.id, object)
              ))
          "
          @clear-recent="recentObjects = []"
          @insert="insertName"
          @object="(object, section) => openObject(object, section)"
          @browse="(object) => openObject(object)"
          @overview="openOverview"
          @create-table="(context) => openSchemaEditor('create', undefined, context)"
          @query="(context, object) => newQuery(context, object)"
          @preview="(object) => openObject(object)"
        />
      </aside>
      <div
        v-if="desktopTree"
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
        class="relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-[var(--workspace-surface-border)] outline-none hover:bg-primary focus-visible:bg-primary data-[resizing=true]:bg-primary"
        :data-resizing="sidebarResize.dragging.value"
        @pointerdown="sidebarResize.begin"
        @pointermove="sidebarResize.move"
        @pointerup="sidebarResize.end"
        @pointercancel="sidebarResize.end"
        @lostpointercapture="sidebarResize.end"
        @keydown="sidebarResize.keydown"
        @dblclick="sidebarResize.reset"
      >
        <span class="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref="tabStrip" class="shrink-0" @keydown="tabKeydown">
          <WorkspaceSubTabStrip
            :tabs="tabDefinitions"
            :active-id="activeId"
            :close-label="t('Common.Close')"
            context-menu
            @select="selectTabById"
            @close="closeTabById"
            @contextmenu="openTabMenu"
            @pin="
              (id) => {
                const tab = tabs.find((item) => item.id === id);
                if (tab) renameTab(tab);
              }
            "
          >
            <template #after-tabs="{ buttonClass }">
              <UDropdownMenu
                :items="createTabItems"
                :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
                :ui="{ content: 'w-40 p-1' }"
              >
                <UButton
                  icon="i-lucide-plus"
                  :aria-label="t('Chen.CreateTab')"
                  :title="t('Chen.CreateTab')"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :class="buttonClass"
                  :disabled="!sessionReady"
                />
              </UDropdownMenu>
            </template>
            <template #trailing="{ buttonClass }">
              <UButton
                v-if="!desktopTree"
                :icon="drawer ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
                :aria-label="t('Chen.GoV1Objects')"
                :title="t('Chen.GoV1Objects')"
                :aria-expanded="drawer"
                :aria-controls="sidebarId"
                size="xs"
                color="neutral"
                variant="ghost"
                class="aria-expanded:bg-(--app-selected-soft) aria-expanded:text-(--app-fg)"
                :class="buttonClass"
                @click="drawer = !drawer"
              />
              <UButton
                v-if="!tab"
                icon="i-lucide-unplug"
                :aria-label="t('Chen.GoV1Close')"
                :title="t('Chen.GoV1Close')"
                size="xs"
                color="neutral"
                variant="ghost"
                :class="buttonClass"
                :disabled="session.state === 'closed' || busy"
                @click="closeSession"
              />
              <div class="relative shrink-0">
                <UButton
                  size="xs"
                  icon="i-lucide-scroll-text"
                  color="neutral"
                  variant="ghost"
                  class="aria-pressed:bg-(--app-selected-soft) aria-pressed:text-(--app-fg)"
                  :class="buttonClass"
                  :aria-pressed="logsOpen"
                  :aria-label="t('Chen.ToggleLogConsole')"
                  :title="
                    unreadLogErrors ? t('Chen.LogConsoleNewErrors', { count: unreadLogErrors }) : t('Chen.LogConsole')
                  "
                  @click="logsOpen = !logsOpen"
                />
                <span
                  v-if="unreadLogErrors"
                  class="pointer-events-none absolute right-0.5 top-0.5 size-1.5 rounded-full bg-error ring-1 ring-[var(--workspace-surface-main)]"
                />
              </div>
            </template>
          </WorkspaceSubTabStrip>
          <UDropdownMenu
            v-model:open="tabMenuOpen"
            :items="contextTab ? tabMenu(contextTab) : []"
            :content="{ align: 'start' }"
          >
            <div
              class="pointer-events-none fixed h-px w-px"
              :style="{ left: `${tabMenuPosition.x}px`, top: `${tabMenuPosition.y}px` }"
            />
          </UDropdownMenu>
        </div>
        <div v-if="!tabs.length" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted">
          <p>{{ t("Chen.GoV1EmptyWorkspace") }}</p>
          <UButton :label="t('Chen.NewQuery')" size="sm" :disabled="!sessionReady" @click="newQuery()" />
        </div>
        <div v-for="item in tabs" v-show="activeId === item.id" :key="item.id" class="flex min-h-0 flex-1 flex-col">
          <GoOverviewPane
            v-if="item.kind === 'overview'"
            :api="api"
            :session-id="session.id"
            :scope="item.context"
            :section="item.section"
            :dialect="session.dialect"
            :ready="sessionReady && eventConnected && !authenticationUnknown"
            :visible="activeId === item.id"
            :can-copy="session.permissions.can_copy"
            @section="item.section = $event"
            @object="openObject"
            @diagram-object="openObject($event, 'diagram')"
          />
          <GoObjectPane
            v-else-if="item.kind === 'object'"
            :object="item.object"
            :section="item.section"
            :diagram-ready="eventConnected && !authenticationUnknown"
            :active="activeId === item.id"
            :dialect="session.dialect"
            :api="api"
            :session-id="session.id"
            :ready="sessionReady"
            :can-copy="session.permissions.can_copy"
            :can-paste="session.permissions.can_paste"
            @object="openObject($event, 'diagram')"
            @section="objectSection(item, $event)"
            @query="newQuery({ database: item.object.database, schema: item.object.schema }, item.object)"
            @schema-edit="openSchemaEditor($event, item.object)"
          />
          <template v-for="query in [workspaceQuery(item)]" :key="query?.id">
            <GoQueryPane
              v-if="query"
              v-show="queryVisible(query)"
              :ref="(value) => setQueryPane(item.id, value)"
              :data-only="item.kind === 'object'"
              :query="query"
              :session="session"
              :api="api"
              :single="single"
              :visible="queryVisible(query)"
              :review-core-site="reviewCoreSite"
              :ai-available="aiAvailable"
              :sql-keyword-case="workspacePreferences.sqlKeywordCase"
              @ai="requestSqlAi"
              @apply-edits="(plan, target) => applyEdits(target || query, plan)"
              @refresh-data="(target) => refreshData(target || query)"
              @browse="(request, target) => browseTable(target || query, request)"
              @query-page="(request, target) => pageQuery(target || query, request)"
              @cached-result="(target) => restoreCachedResult(target || query)"
              @loading-settings="(settings, target) => changeLoading(target || query, settings)"
              @load-more="(automatic, target) => loadMore(target || query, automatic)"
              @sql="updateQuerySql(query, $event)"
              @restore="(sql: string) => restoreQuery(query.context, sql)"
              @upload-sql="restoreQuery(query.context, $event, true)"
              @run="(sql, version) => submit(query, sql, version)"
              @explain="(sql, version) => explainQuery(query, sql, version)"
              @cancel="(target) => cancel(target || query)"
              @review="(id, confirmationId, target) => requestReview(target || query, id, confirmationId)"
              @confirm-warning="(id, confirmationId, target) => confirmWarning(target || query, id, confirmationId)"
              @policy-cancel="(id, confirmationId, target) => confirmPolicy(target || query, id, confirmationId, false)"
              @transaction="(request, target) => transactionAction(target || query, request)"
              @confirm-implicit="(id, target) => confirmImplicitCommit(target || query, id)"
              @export="(mode, format, snapshot, target) => startExport(target || query, mode, format, snapshot)"
              @export-sync="
                (target) =>
                  syncExport(target || query).catch((cause) => {
                    (target || query).error = failureText(cause);
                  })
              "
              @export-cancel="(target) => cancelExport(target || query)"
              @export-delete="(target) => deleteExport(target || query)"
              @recover="(target) => recoverSubmission(target || query)"
              @reconnect="(target) => reconnect(target || query)"
              @rows="(id, offset, target) => loadRows(target || query, id, offset)"
              @retry-rows="(target) => retryRows(target || query)"
              @close-plan="(number, target) => closeQueryPlan(target || query, number)"
              @pane="(pane, target) => ((target || query).resultPane = pane)"
              @close-pinned="(target) => closePinned(query, target)"
              @pin="(sql, title, view) => pinResult(query, sql, title, view)"
              @select-pinned="(id) => (query.pinnedResultId = id)"
            />
          </template>
        </div>
        <LogConsolePanel
          v-if="logsOpen"
          :entries="logs"
          @clear="
            logs = [];
            unreadLogErrors = 0;
          "
          @close="logsOpen = false"
        />
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
      :title="t(closeDialog?.keepConnection ? 'Chen.UnpinResult' : 'Chen.GoV1ConfirmClose')"
      :ui="{
        content: 'sm:max-w-sm',
        header: 'px-4 py-3 sm:px-4',
        body: 'px-4 py-1 sm:p-4 sm:py-1',
        footer: 'px-4 py-3 sm:px-4'
      }"
      @update:open="
        (value) => {
          if (!value) finishClose(false);
        }
      "
    >
      <template #body>
        <p class="text-sm">{{ t("Chen.GoV1CloseDescription") }}</p>
        <p v-if="closeDialog?.transaction" class="mt-2 text-sm text-warning">
          {{ t("Chen.Transaction.RollbackOnClose") }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Common.Cancel')" color="neutral" variant="ghost" @click="finishClose(false)" />
          <UButton :label="t('Chen.GoV1ConfirmDiscardClose')" color="warning" @click="finishClose(true)" />
        </div>
      </template>
    </UModal>
  </section>
</template>
