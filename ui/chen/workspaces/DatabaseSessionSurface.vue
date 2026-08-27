<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ChenDataViewColumnPreview } from "~/chen/composables/useChenDataViewDerivedMeta";
import type {
  ChenSqlAiOperation,
  ChenSqlEditorContext,
  ChenSqlProposal,
  ChenSqlProposalApplyResult
} from "~/chen/composables/useChenSqlAiSessions";
import type {
  ChenActionItem,
  ChenCreateTableWorkspaceTab,
  ChenDatabaseSection,
  ChenDatabaseWorkspaceTab,
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewActionTarget,
  ChenDataViewConsoleTab,
  ChenLogConsoleEntry,
  ChenLogConsoleLevel,
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenQueryResultTab,
  ChenSaveChangesPreviewResult,
  ChenSaveChangesResult,
  ChenSqlEditorSnapshot,
  ChenTableStructureWorkspaceTab,
  ChenTreeNode,
  ChenWorkspaceTab
} from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import {
  fetchChenActions,
  fetchChenExport,
  fetchChenSchemaOverview,
  fetchChenSqlColumns,
  fetchChenSqlRelations,
  uploadChenSqlFile
} from "~/chen/api";
import ChenSessionState from "~/chen/components/ChenSessionState.vue";
import ConsolePanel from "~/chen/components/ConsolePanel.vue";
import CreateTablePanel from "~/chen/components/CreateTablePanel.vue";
import DatabaseOverviewPanel from "~/chen/components/DatabaseOverviewPanel.vue";
import DataViewPanel from "~/chen/components/DataViewPanel.vue";
import DiscardDataViewChangesDialog from "~/chen/components/DiscardDataViewChangesDialog.vue";
import LogConsolePanel from "~/chen/components/LogConsolePanel.vue";
import QueryConsolePanel from "~/chen/components/QueryConsolePanel.vue";
import ResourceTreePanel from "~/chen/components/ResourceTreePanel.vue";
import TableStructurePanel from "~/chen/components/TableStructurePanel.vue";
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import WorkspaceTabBar from "~/chen/components/WorkspaceTabBar.vue";
import { useChenActionMenu } from "~/chen/composables/useChenActionMenu";
import { useChenAuth } from "~/chen/composables/useChenAuth";
import { useChenDataView } from "~/chen/composables/useChenDataView";
import { useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";
import { useChenRecentTables } from "~/chen/composables/useChenRecentTables";
import { useChenResourceTree } from "~/chen/composables/useChenResourceTree";
import { useChenSession } from "~/chen/composables/useChenSession";
import {
  getChenSqlAiSession,
  handleChenSqlAiError,
  handleChenSqlAiMessage,
  handleChenSqlAiReady,
  handleChenSqlAiToolApprovalRequired,
  handleChenSqlAiToolApprovalResolved,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "~/chen/composables/useChenSqlAiSessions";
import { chenWsUrl, useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { useChenWorkspacePreferences } from "~/chen/composables/useChenWorkspacePreferences";
import { newChenWorkspaceId, useChenWorkspaceTabs } from "~/chen/composables/useChenWorkspaceTabs";
import { saveChenExport } from "~/chen/runtime/download";
import { formatChenDialogValue } from "~/chen/utils/chenDialog";
import {
  acceptChenSaveChangesPreviewResult,
  acceptChenSaveChangesResult,
  chenDataViewHasDirty,
  chenDataViewTargets,
  clearChenDataViewEdits,
  findChenDataViewTarget
} from "~/chen/utils/dataViewEditing";
import { canOpenChenQueryConsole, chenNodeActivationAction } from "~/chen/utils/resourceTree";
import { ChenSqlMetadataStore } from "~/chen/utils/sqlMetadata";
import { chenUnrestrictedMutations } from "~/chen/utils/sqlSafety";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();

const toast = useToast();
const { locale, t } = useI18n();
const { openWithTab } = useRightPanel();
const { addErrorToast } = useErrorToast();
const userInfoStore = useUserInfoStore();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const tabRef = toRef(props, "tab");
const endpointUrl = computed(() => {
  const explicit = String(props.tab.payload?.endpointUrl || "").trim();
  if (explicit) return explicit;

  const webUrl = String(props.tab.payload?.webUrl || "").trim();
  if (webUrl) {
    try {
      return new URL(webUrl, window.location.origin).origin;
    } catch {
      // Fall back to the current origin for legacy or malformed payloads.
    }
  }

  if (isDesktopRuntime() && userInfoStore.currentSite) return userInfoStore.currentSite;
  return window.location.origin;
});
const resolveChenWsUrl = (path: "session" | "console" | "ai") => chenWsUrl(path, endpointUrl.value);

const sidebarWidth = ref(280);
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const resourceTreeOpen = ref(true);
const resourceTreeWidth = computed(() =>
  isNarrowScreen.value ? "min(280px, calc(100vw - 3rem))" : sidebarWidth.value
);
const resizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizeHandle: HTMLElement | null = null;
let resizePointerId: number | null = null;
const discardDialogOpen = ref(false);
const discardDialogMessage = ref("");
const pendingDiscard = shallowRef<(() => void) | null>(null);
const unrestrictedMutationDialogOpen = ref(false);
const pendingUnrestrictedMutation = shallowRef<
  | { kind: "query"; tab: ChenQueryConsoleTab; sql: string }
  | { kind: "upload"; tab: ChenQueryConsoleTab; sql: string; file: File }
  | null
>(null);
const UNRESTRICTED_SQL_PREVIEW_LIMIT = 8_000;
const unrestrictedMutationSqlPreview = computed(() => {
  const sql = pendingUnrestrictedMutation.value?.sql || "";
  if (sql.length <= UNRESTRICTED_SQL_PREVIEW_LIMIT) return sql;
  return `${sql.slice(0, UNRESTRICTED_SQL_PREVIEW_LIMIT)}\n\n-- Preview truncated --`;
});
const GUARDED_DATA_VIEW_ACTIONS = new Set<ChenDataViewAction>([
  "first_page",
  "prev_page",
  "next_page",
  "last_page",
  "refresh",
  "change_limit",
  "change_filter"
]);
const auth = useChenAuth(tabRef, endpointUrl);
const tokenId = computed(() => auth.ensureTokenId());
const tree = useChenResourceTree(auth.chenToken, {
  endpointUrl,
  onLoadError: (node) => {
    // Root failures propagate to the session fatal state; only per-node
    // load failures surface as a toast here.
    if (!node) return;
    addErrorToast({
      title: "Failed to load node",
      description: node.label || node.name || node.key
    });
  }
});
const workspace = useChenWorkspaceTabs();
const workspacePreferences = useChenWorkspacePreferences();
const recentTables = useChenRecentTables(`${props.tab.assetId}:${props.tab.protocol}`);
const logConsoleOpen = ref(false);
const logConsoleEntries = ref<ChenLogConsoleEntry[]>([]);
const unreadLogErrorCount = ref(0);
const MAX_LOG_CONSOLE_ENTRIES = 1_000;
const dataView = useChenDataView(sendConsoleAction);
const consoleConnections = new Map<string, ReturnType<typeof useChenWebSocket>>();
const indexOperations = new Map<
  string,
  { sourceTabId: string; operation: "create" | "drop"; indexName: string; started: boolean; error: string }
>();
const queryConsolePanel = ref<{ editorSnapshot: () => ChenSqlEditorSnapshot } | null>(null);
let aiConnection: ReturnType<typeof useChenWebSocket> | null = null;
let aiSocket: WebSocket | null = null;
const sqlMetadataStore = new ChenSqlMetadataStore({
  listRelations: (scope, prefix, limit) =>
    fetchChenSqlRelations(auth.chenToken.value, scope, prefix, limit, undefined, endpointUrl.value),
  listColumns: (scope, relations) =>
    fetchChenSqlColumns(auth.chenToken.value, scope, relations, undefined, endpointUrl.value)
});
const databaseCatalogLoads = new WeakMap<ChenDatabaseWorkspaceTab, symbol>();

function invalidateDatabaseCatalogs() {
  for (const tab of Object.values(workspace.workspaceTabState)) {
    if (tab.kind !== "database") continue;
    databaseCatalogLoads.set(tab, Symbol("invalidated schema metadata load"));
    tab.schemaOverview = null;
    tab.catalogLoaded = false;
    tab.catalogLoading = false;
    tab.catalogError = "";
  }
}

function clearMetadataCaches() {
  sqlMetadataStore.clear();
  invalidateDatabaseCatalogs();
}

const currentWorkspaceNodeKey = computed(() => {
  return (
    tree.selectedNodeKey.value || workspace.activeWorkspaceTab.value?.nodeKey || tree.rootNodes.value[0]?.key || ""
  );
});
const RECENT_TABLES_ROOT_KEY = "__chen_recent_tables__";
const recentTableNodes = computed<ChenTreeNode[]>(() =>
  recentTables.entries.value.map((entry) => ({
    key: `${RECENT_TABLES_ROOT_KEY}:${entry.node.key}`,
    label: entry.node.label || entry.node.name || entry.node.key,
    fullLabel: entry.label || entry.node.label || entry.node.name || entry.node.key,
    type: "recent-table",
    leaf: true,
    recentEntry: entry
  }))
);
const explorerRootNodes = computed<ChenTreeNode[]>(() => [
  {
    key: RECENT_TABLES_ROOT_KEY,
    label: "Recently tables",
    type: "recent-group",
    leaf: recentTableNodes.value.length === 0,
    hasChildren: recentTableNodes.value.length > 0,
    clearable: recentTableNodes.value.length > 0,
    children: recentTableNodes.value
  },
  ...tree.rootNodes.value
]);
const currentWorkspaceNode = computed(() => {
  const node = tree.findNodeByKey(currentWorkspaceNodeKey.value);
  if (node) return node;
  return recentTableNodes.value.find((item) => item.key === currentWorkspaceNodeKey.value)?.recentEntry?.node || null;
});
function sqlAiResourceNode() {
  const isSupported = (node: ChenTreeNode | null | undefined) =>
    Boolean(node && ["datasource", "database", "schema", "table", "view"].includes(node.type));
  const selectedNode = tree.findNodeByKey(currentWorkspaceNodeKey.value);
  if (isSupported(selectedNode)) return selectedNode;

  const path = tree.findNodePathByKey(currentWorkspaceNodeKey.value);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (isSupported(path[index])) return path[index];
  }
  return tree.rootNodes.value.find(isSupported) || null;
}
const currentContextLabel = computed(() => currentWorkspaceNode.value?.label || currentWorkspaceNode.value?.name || "");
const consolePromptLabel = computed(() => {
  const dbType = `${auth.profile.value?.dbType || props.tab.protocol || ""}`.toLowerCase();
  if (dbType.includes("postgres")) return "psql>";
  return "mysql>";
});
const activeQueryTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "query" ? tab : null;
});
const activeConsoleTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "console" ? tab : null;
});
const activeDataViewTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "data-view" ? tab : null;
});
const activeDatabaseTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "database" ? tab : null;
});
const activeCreateTableTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "create-table" ? tab : null;
});
const activeTableStructureTab = computed(() => {
  const tab = workspace.activeWorkspaceTab.value;
  return tab?.kind === "table-structure" ? tab : null;
});
const activeConnectionError = computed(() => workspace.activeWorkspaceTab.value?.connectionError || "");
const databaseTarget = computed(() => {
  const address = String(props.tab.address || "").trim();
  const protocol = String(props.tab.protocol || "").toLowerCase();
  const port = props.tab.permedProtocols?.find((item) => item.name.toLowerCase() === protocol)?.port;
  if (!address) return "";
  const formattedAddress = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return port ? `${formattedAddress}:${port}` : address;
});

function logConsoleLevel(line: unknown): ChenLogConsoleLevel {
  if (!line || typeof line !== "object") return "info";
  const level = "level" in line ? Number(line.level) : undefined;
  if (level === 0 || ("type" in line && line.type === "error")) return "error";
  if (level === 1 || ("type" in line && line.type === "warning")) return "warning";
  return "info";
}

function appendLogConsoleEntry(tab: ChenWorkspaceTab, line: unknown, content: string) {
  const level = logConsoleLevel(line);
  logConsoleEntries.value.push({
    id: newChenWorkspaceId("log"),
    timestamp: Date.now(),
    sourceId: tab.id,
    sourceTitle: workspace.displayWorkspaceTabTitle(tab),
    level,
    message: content
  });
  if (logConsoleEntries.value.length > MAX_LOG_CONSOLE_ENTRIES) {
    logConsoleEntries.value.splice(0, logConsoleEntries.value.length - MAX_LOG_CONSOLE_ENTRIES);
  }
  if (level === "error" && !logConsoleOpen.value) unreadLogErrorCount.value += 1;
}

function toggleLogConsole() {
  logConsoleOpen.value = !logConsoleOpen.value;
  if (logConsoleOpen.value) unreadLogErrorCount.value = 0;
}

function closeLogConsole() {
  logConsoleOpen.value = false;
}

function clearLogConsole() {
  logConsoleEntries.value = [];
  unreadLogErrorCount.value = 0;
}

const queryConsole = useChenQueryConsole(sendConsoleAction, { onLog: appendLogConsoleEntry });
const session = useChenSession({
  authenticate: auth.authenticate,
  markConnected: () => markSessionConnected(props.tab.id),
  markFailed: () =>
    markSessionFailed({
      tabId: props.tab.id,
      assetId: props.tab.assetId,
      protocol: props.tab.protocol,
      account: props.tab.account
    }),
  onBeforeReady: async () => {
    await auth.loadProfile();
    await tree.loadNodeChildren(null);
  },
  onAfterReady: async () => {
    await tree.expandInitialTree();
    connectSqlAiSession();
  },
  onDisconnected: () => {
    closeSqlAiSession();
    clearMetadataCaches();
    closeAllConsoleSockets("Database session disconnected");
  },
  showMessage: (data) => {
    toast.add({
      title: data?.level || "Message",
      description: data?.message || "",
      color: data?.level?.toLowerCase() === "error" ? "error" : "primary"
    });
  },
  downloadFile: downloadExportFile,
  resolveUrl: resolveChenWsUrl
});
const startupError = computed(() => {
  if (session.error.value) return session.error.value;
  if (!tokenId.value && props.tab.status === "failed") return "Failed to start database workspace";
  return "";
});
const startupErrorMessage = computed(() => {
  const message = startupError.value;
  if (!message || message.startsWith("Chen WebSocket 连接失败")) return message;
  return `Chen 服务端请求失败：${message}`;
});
const databaseDialogFailed = computed(() =>
  /连接失败|connection (?:attempt )?failed|unable to connect/i.test(session.dialogMessage.value?.text || "")
);
const startupDialogMessage = computed(() => {
  const dialog = session.dialogMessage.value;
  if (!dialog || !session.dialogOpenedDuringStartup.value || dialog.buttons.length || databaseDialogFailed.value)
    return "";
  return dialog.text || (dialog.title === "Message" ? "" : dialog.title);
});
const startupMessage = computed(() => {
  if (startupDialogMessage.value) return startupDialogMessage.value;
  if (!tokenId.value) return "Waiting for connection details…";
  if (!auth.chenToken.value) return "Authenticating your database session…";
  if (session.sessionConnection.state.value === "connecting") return "Connecting to the database service…";
  if (!auth.profile.value) return "Preparing your database session…";
  return "Loading database resources…";
});
const databaseDialogText = computed(() => {
  const message = session.dialogMessage.value?.text || "";
  if (!databaseDialogFailed.value || !databaseTarget.value) return message;
  return `数据库地址：${databaseTarget.value}\n${message}`;
});

async function downloadExportFile(fileKey: string) {
  const file = await fetchChenExport(auth.chenToken.value, fileKey, undefined, endpointUrl.value);
  const result = await saveChenExport(file.blob, file.fileName);
  toast.add(
    result === "saved"
      ? { title: "Export downloaded", description: file.fileName, color: "success" }
      : { title: "Export canceled", description: file.fileName, color: "neutral" }
  );
}

function buildSqlAiContext(): ChenSqlEditorContext | null {
  const active = workspace.activeWorkspaceTab.value;
  const nodeKey = active?.nodeKey || sqlAiResourceNode()?.key || "";
  if (!nodeKey) return null;
  if (active?.kind === "create-table" || active?.kind === "table-structure") return null;
  if (active && active.kind !== "database" && !active.serverConsoleId) return null;

  let snapshot: ChenSqlEditorSnapshot = {
    documentSql: "",
    selectedSql: "",
    selectionFrom: 0,
    selectionTo: 0
  };
  let tabId = "";
  let revision = 0;
  let lastError: Record<string, any> | null = null;

  if (active?.kind === "query") {
    tabId = active.id;
    revision = active.aiRevision;
    snapshot = queryConsolePanel.value?.editorSnapshot() || {
      documentSql: active.statement,
      selectedSql: "",
      selectionFrom: 0,
      selectionTo: 0
    };
    lastError = active.lastSqlError ? { ...active.lastSqlError } : null;
  } else if (active?.kind === "console") {
    snapshot.documentSql = active.pendingSql;
  }

  return {
    dialect: String(auth.profile.value?.dbType || props.tab.protocol || "").toLowerCase(),
    nodeKey,
    consoleId: active?.serverConsoleId || "",
    paneId: props.tab.id,
    tabId,
    workspaceTabId: active?.id || "",
    workspaceTabKind: active?.kind || "none",
    currentContext:
      active?.kind === "query" || active?.kind === "console" ? String(active.state.currentContext || "") : "",
    revision,
    selectionFrom: snapshot.selectionFrom,
    selectionTo: snapshot.selectionTo,
    selectedSql: snapshot.selectedSql,
    documentSql: snapshot.documentSql,
    lastError
  };
}

function staleProposal(reason = t("RightPanel.SQLAIProposalStale")): ChenSqlProposalApplyResult {
  toast.add({
    title: t("RightPanel.SQLAIApplyFailed"),
    description: reason,
    color: "warning"
  });
  return { applied: false, reason };
}

function applySqlProposal(proposal: ChenSqlProposal): ChenSqlProposalApplyResult {
  const sql = String(proposal?.sql || "").trim();
  const base = proposal?.base;
  if (!sql || sql.length > 128 * 1024 || !base || base.paneId !== props.tab.id || !base.nodeKey) {
    return staleProposal(t("RightPanel.SQLAIProposalInvalid"));
  }
  const currentContext = buildSqlAiContext();
  if (
    !currentContext ||
    currentContext.nodeKey !== base.nodeKey ||
    currentContext.workspaceTabId !== String(base.workspaceTabId || "") ||
    currentContext.workspaceTabKind !== (base.workspaceTabKind || "none") ||
    currentContext.currentContext !== String(base.currentContext || "")
  ) {
    return staleProposal();
  }

  if (base.target === "new_query") {
    const created = openQueryWorkspace(base.nodeKey, workspace.nextTabTitle("Query"), false);
    if (!created || created.kind !== "query") return staleProposal();
    created.statement = sql;
    created.aiRevision += 1;
    workspace.setActiveTab(created.id);
    toast.add({ title: t("RightPanel.SQLAIApplied"), color: "success" });
    return { applied: true };
  }

  const target = workspace.workspaceTabState[base.tabId];
  if (!target || target.kind !== "query" || target.nodeKey !== base.nodeKey || target.aiRevision !== base.revision) {
    return staleProposal();
  }

  let nextSql = sql;
  if (base.target === "selection") {
    const from = Number(base.selectionFrom);
    const to = Number(base.selectionTo);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to <= from ||
      to > target.statement.length ||
      target.statement.slice(from, to) !== String(proposal.originalSql || "")
    ) {
      return staleProposal();
    }
    nextSql = `${target.statement.slice(0, from)}${sql}${target.statement.slice(to)}`;
  } else if (base.target === "document") {
    if (target.statement !== String(proposal.originalSql || "")) return staleProposal();
  } else {
    return staleProposal(t("RightPanel.SQLAIProposalInvalid"));
  }

  target.statement = nextSql;
  target.aiRevision += 1;
  workspace.setActiveTab(target.id);
  toast.add({ title: t("RightPanel.SQLAIApplied"), color: "success" });
  return { applied: true };
}

function closeSqlAiSession() {
  const socket = aiSocket;
  aiConnection?.close();
  aiConnection = null;
  aiSocket = null;
  unregisterChenSqlAiSession(props.tab.id, socket);
}

function connectSqlAiSession() {
  closeSqlAiSession();
  if (auth.profile.value?.chatAiEnabled !== true) {
    const disabledSession = registerChenSqlAiSession(props.tab.id, null, buildSqlAiContext, applySqlProposal);
    if (disabledSession) {
      disabledSession.enabled = false;
      disabledSession.errorCode = "disabled";
      disabledSession.errorText = t("RightPanel.SQLAIDisabledDescription");
    }
    return;
  }
  const connection = useChenWebSocket({
    path: "ai",
    resolveUrl: resolveChenWsUrl,
    onOpen: () => {
      connection.sendImmediately({
        type: "connect",
        data: { language: locale.value }
      });
    },
    onPacket: (packet) => {
      if (packet.type === "ai_ready") {
        connection.markReady();
        handleChenSqlAiReady(props.tab.id, packet.data || {});
      } else if (packet.type === "ai_chat") {
        handleChenSqlAiMessage(props.tab.id, packet.data);
      } else if (packet.type === "ai_error") {
        handleChenSqlAiError(props.tab.id, packet.data || {});
      } else if (packet.type === "ai_tool_approval_required") {
        handleChenSqlAiToolApprovalRequired(props.tab.id, packet.data || {});
      } else if (packet.type === "ai_tool_approval_resolved") {
        handleChenSqlAiToolApprovalResolved(props.tab.id, packet.data || {});
      }
    },
    onError: (socketError) => {
      handleChenSqlAiError(props.tab.id, {
        code: socketError.code,
        message: socketError.message
      });
      const current = getChenSqlAiSession(props.tab.id);
      if (current) current.enabled = false;
    }
  });
  aiConnection = connection;
  const socket = connection.connect(auth.chenToken.value);
  aiSocket = socket;
  if (socket) registerChenSqlAiSession(props.tab.id, socket, buildSqlAiContext, applySqlProposal);
}

function openSqlAi() {
  openWithTab("ai");
}

function requestSqlAi(operation: ChenSqlAiOperation) {
  openSqlAi();
  const current = getChenSqlAiSession(props.tab.id);
  if (!current?.enabled) {
    toast.add({
      title: t("RightPanel.SQLAIUnavailableTitle"),
      description: current?.errorText || t("RightPanel.SQLAIUnavailableDescription"),
      color: "warning"
    });
    return;
  }

  const prompt = operation === "explain" ? t("RightPanel.SQLAIExplainPrompt") : t("RightPanel.SQLAIRepairPrompt");
  void current.request(operation, prompt).catch((cause) => {
    toast.add({
      title: t("RightPanel.SQLAISendFailed"),
      description: cause instanceof Error ? cause.message : String(cause),
      color: "error"
    });
  });
}

function initConsoleSocket(tab: ChenWorkspaceTab) {
  if (tab.kind === "database") return null;
  const existing = consoleConnections.get(tab.id);
  if (existing) return existing;
  if (!session.ready.value) {
    tab.connectionError = "Database session is not ready";
    return null;
  }

  tab.connectionError = "";
  const connection = useChenWebSocket({
    path: "console",
    resolveUrl: resolveChenWsUrl,
    onOpen: () => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab || reactiveTab.kind === "database") {
        connection.close();
        return;
      }

      connection.sendImmediately({
        type: "connect",
        data: {
          nodeKey: reactiveTab.nodeKey,
          type:
            reactiveTab.kind === "data-view"
              ? "data_view"
              : reactiveTab.kind === "create-table" || reactiveTab.kind === "table-structure"
                ? "query"
                : reactiveTab.kind
        }
      });
    },
    onPacket: (packet) => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab || reactiveTab.kind === "database") return;

      handleConsolePacket(reactiveTab, packet);
      if (packet.type === "init") {
        reactiveTab.connectionError = "";
        connection.markReady();
      }
    },
    onError: (socketError) => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab || reactiveTab.kind === "database") return;
      reactiveTab.socket = null;
      reactiveTab.connectionError = socketError.message;
      if ((reactiveTab.kind === "create-table" || reactiveTab.kind === "table-structure") && reactiveTab.submitting) {
        reactiveTab.submitError = socketError.message;
        if (reactiveTab.kind === "create-table") void finishCreateTable(reactiveTab, false);
        else finishTableStructure(reactiveTab, false);
        return;
      }
      queryConsole.failConsoleExecution(reactiveTab, socketError.message);
    }
  });

  consoleConnections.set(tab.id, connection);
  tab.socket = connection.connect(auth.chenToken.value);
  return connection;
}

function sendConsoleAction(tab: ChenWorkspaceTab, type: string, data?: any) {
  const action = { type, data };
  const connection = consoleConnections.get(tab.id) || initConsoleSocket(tab);
  if (connection?.sendWhenReady(action)) return true;

  tab.connectionError ||= "Console websocket is not connected";
  queryConsole.failConsoleExecution(tab, tab.connectionError);
  return false;
}

function reconnectConsoleSocket(tab: ChenWorkspaceTab) {
  consoleConnections.get(tab.id)?.close();
  consoleConnections.delete(tab.id);
  tab.socket = null;
  tab.connectionError = "";
  return initConsoleSocket(tab);
}

function refreshDataViewWithNewConnection(tab: ChenWorkspaceTab, target: ChenDataViewActionTarget) {
  if (!reconnectConsoleSocket(tab)) return false;
  return dataView.sendDataViewAction(tab, target, "refresh");
}

function guardDataViewChanges(targets: ChenDataViewActionTarget[], action: () => void) {
  if (targets.some((target) => target.editState.activeRequest !== null)) {
    toast.add({
      title: "Data view request in progress",
      description: "Wait for the current request to finish before continuing.",
      color: "warning"
    });
    return;
  }
  const dirtyTargets = targets.filter((target) => chenDataViewHasDirty(target.editState));
  if (!dirtyTargets.length) {
    action();
    return;
  }

  pendingDiscard.value = () => {
    dirtyTargets.forEach((target) => clearChenDataViewEdits(target.editState));
    action();
  };
  discardDialogMessage.value = "This data view has unsaved edits. Discard them and continue?";
  discardDialogOpen.value = true;
}

function updateDiscardDialog(open: boolean) {
  discardDialogOpen.value = open;
  if (!open) {
    pendingDiscard.value = null;
    discardDialogMessage.value = "";
  }
}

function confirmDiscardChanges() {
  const action = pendingDiscard.value;
  pendingDiscard.value = null;
  action?.();
}

function resultFailureDescription(
  result: { reason?: string; failedChangeIndex?: number | null } | null,
  fallback: string
) {
  const reason = result?.reason || fallback;
  return result?.failedChangeIndex == null ? reason : `${reason}, failedChangeIndex=${result.failedChangeIndex}`;
}

function consumeDataViewSavePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  if (
    tab.kind === "console" ||
    (packet.type !== "save_changes_preview_result" && packet.type !== "save_changes_result")
  ) {
    return;
  }

  const packetResult = packet.data?.result || packet.data;
  const target = findChenDataViewTarget(tab, packetResult?.dataView || packet.data?.dataView);
  if (!target) return;

  if (packet.type === "save_changes_preview_result") {
    const result = packetResult as ChenSaveChangesPreviewResult;
    const outcome = acceptChenSaveChangesPreviewResult(target.editState, result);
    if (outcome === "failed") {
      addErrorToast({
        title: "Preview failed",
        description: resultFailureDescription(result, "Preview failed")
      });
    } else if (outcome === "stale") {
      toast.add({
        title: "Preview is out of date",
        description: "The data changed after preview started. Preview the changes again.",
        color: "warning"
      });
    }
    return;
  }

  const result = packetResult as ChenSaveChangesResult;
  const outcome = acceptChenSaveChangesResult(target.editState, result);
  if (outcome === "ignored") return;
  if (outcome === "commit-unknown") {
    clearChenDataViewEdits(target.editState);
    toast.add({
      title: "Save outcome is unknown",
      description:
        "The connection was reset. Refreshing with a new connection to verify the database state; do not retry until it finishes.",
      color: "warning"
    });
    refreshDataViewWithNewConnection(tab, target);
    return;
  }
  if (outcome === "failed") {
    addErrorToast({
      title: "Save failed",
      description: resultFailureDescription(result, "Save failed")
    });
    return;
  }
  if (outcome === "stale-applied") {
    const connectionDetail = result.connectionInvalidated
      ? "The connection was reset. Refresh before saving again; transaction and session state were lost."
      : "Refresh was skipped so the newer local edits are not discarded.";
    const auditDetail =
      result.auditSucceeded === false
        ? result.databaseCommitted
          ? " Audit recording failed after the database commit; do not retry the save."
          : " Audit recording failed after applying the current transaction; do not retry the save."
        : "";
    toast.add({
      title: "Save applied; newer edits were kept",
      description: `${connectionDetail}${auditDetail}`,
      color: "warning"
    });
    if (result.connectionInvalidated) reconnectConsoleSocket(tab);
    return;
  }

  clearChenDataViewEdits(target.editState);
  if (result.connectionInvalidated) {
    toast.add({
      title: result.success ? "Save succeeded; connection reset" : "Database changes applied; connection reset",
      description:
        result.auditSucceeded === false
          ? "Transaction and session state were lost. Audit recording also failed; do not retry the save. Refreshing with a new connection."
          : "Transaction and session state were lost. Refreshing with a new connection.",
      color: "warning"
    });
  } else if (result.auditSucceeded === false) {
    toast.add({
      title: "Save applied; audit failed",
      description: result.databaseCommitted
        ? "The database commit succeeded. Do not retry the save."
        : "The changes were applied to the current transaction. Do not retry the save.",
      color: "warning"
    });
  } else {
    toast.add({ title: result.success ? "Save succeeded" : "Database changes applied", color: "success" });
  }
  if (result.connectionInvalidated) refreshDataViewWithNewConnection(tab, target);
  else dataView.sendDataViewAction(tab, target, "refresh");
}

function handleConsolePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  if (tab.kind === "create-table") {
    handleCreateTablePacket(tab, packet);
    return;
  }
  if (tab.kind === "table-structure") {
    handleTableStructurePacket(tab, packet);
    return;
  }
  if (tab.kind === "query" || tab.kind === "console") {
    queryConsole.handleQueryConsolePacket(tab, packet);
  }
  if (tab.kind === "query") handleIndexOperationPacket(tab, packet);

  switch (packet.type) {
    case "init":
      if (tab.kind === "data-view") {
        tab.title = packet.data?.title || tab.title;
        tab.serverConsoleId = String(packet.data?.consoleId || "");
      }
      break;
    case "log":
      if (tab.kind === "data-view") queryConsole.appendLog(tab, packet.data);
      break;
    case "message":
      if (tab.kind === "data-view") queryConsole.appendLog(tab, packet.data);
      break;
    case "active_console":
      if (typeof packet.data === "string") {
        const match = workspace.workspaceTabs.value.find((item) => item.title === packet.data);
        if (match) workspace.setActiveTab(match.id);
      }
      break;
    case "close":
      performCloseWorkspaceTab(tab.id);
      break;
    default:
      if (tab.kind === "data-view") dataView.handleDataViewConsolePacket(tab, packet);
      break;
  }

  consumeDataViewSavePacket(tab, packet);
}

function handleIndexOperationPacket(tab: ChenQueryConsoleTab, packet: ChenPacket) {
  const operation = indexOperations.get(tab.id);
  if (!operation) return;
  if (packet.type === "log" && Number(packet.data?.level) === 0) {
    operation.error ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type === "message" && (packet.data?.type === "error" || packet.data?.level === 0)) {
    operation.error ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type !== "update_state") return;
  if (packet.data?.loading === true || packet.data?.inQuery === true) {
    operation.started = true;
    return;
  }
  if (
    packet.data?.loading !== false ||
    (!operation.started && !["success", "error", "cancelled"].includes(packet.data?.executionStatus))
  ) {
    return;
  }

  indexOperations.delete(tab.id);
  const failed = ["error", "cancelled"].includes(packet.data?.executionStatus) || Boolean(operation.error);
  if (failed) {
    addErrorToast({
      title: `Failed to ${operation.operation} index`,
      description:
        operation.error || tab.message?.message || tab.logs.at(-1) || "The database rejected the index statement."
    });
    return;
  }

  toast.add({
    title: operation.operation === "create" ? "Index created" : "Index dropped",
    description: operation.indexName,
    color: "success"
  });
  const source = workspace.workspaceTabState[operation.sourceTabId];
  performCloseWorkspaceTab(tab.id);
  if (source?.kind === "data-view") {
    workspace.setActiveTab(source.id);
    refreshDataViewWithNewConnection(source, source);
  }
}

function packetErrorMessage(data: any) {
  if (typeof data === "string") return data;
  return String(data?.message || data?.reason || "").trim();
}

async function finishCreateTable(tab: ChenCreateTableWorkspaceTab, succeeded: boolean) {
  tab.submitting = false;
  if (!succeeded) {
    tab.submitError ||= "The database rejected the CREATE TABLE statement.";
    addErrorToast({ title: "Failed to create table", description: tab.submitError });
    return;
  }

  tab.created = true;
  tab.title = tab.tableName.trim() || tab.title;
  clearMetadataCaches();
  toast.add({ title: "Table created", description: tab.tableName.trim(), color: "success" });
  await tree.loadNodeChildren(tab.parentNode, true);
}

function handleCreateTablePacket(tab: ChenCreateTableWorkspaceTab, packet: ChenPacket) {
  if (packet.type === "log") {
    queryConsole.appendLog(tab, packet.data);
    if (Number(packet.data?.level) === 0) tab.submitError ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type === "message") {
    queryConsole.appendLog(tab, packet.data);
    const isError = packet.data?.type === "error" || packet.data?.level === 0;
    if (isError) tab.submitError ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type !== "update_state") return;

  tab.state = packet.data || {};
  if (!tab.submitting) return;
  if (packet.data?.loading === true || packet.data?.inQuery === true) {
    tab.executionStarted = true;
    return;
  }
  if (
    packet.data?.loading !== false ||
    (!tab.executionStarted && !["success", "error", "cancelled"].includes(packet.data?.executionStatus))
  ) {
    return;
  }
  const failed = ["error", "cancelled"].includes(packet.data?.executionStatus) || Boolean(tab.submitError);
  void finishCreateTable(tab, !failed);
}

function finishTableStructure(tab: ChenTableStructureWorkspaceTab, succeeded: boolean) {
  tab.submitting = false;
  if (!succeeded) {
    tab.submitError ||= "The database rejected the ALTER TABLE statement.";
    addErrorToast({ title: "Failed to update table structure", description: tab.submitError });
    return;
  }

  tab.saved = true;
  clearMetadataCaches();
  tab.columns = tab.columns
    .filter((column) => !column.deleted)
    .map((column) => ({
      ...column,
      originalName: column.name,
      originalType: column.type,
      originalSize: column.size,
      originalNullable: column.nullable,
      added: false,
      deleted: false
    }));
  toast.add({ title: "Table structure updated", description: tab.tableName, color: "success" });
  const source = workspace.workspaceTabState[tab.sourceTabId];
  if (source?.kind === "data-view") dataView.sendDataViewAction(source, source, "refresh");
}

function handleTableStructurePacket(tab: ChenTableStructureWorkspaceTab, packet: ChenPacket) {
  if (packet.type === "log") {
    queryConsole.appendLog(tab, packet.data);
    if (Number(packet.data?.level) === 0) tab.submitError ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type === "message") {
    queryConsole.appendLog(tab, packet.data);
    const isError = packet.data?.type === "error" || packet.data?.level === 0;
    if (isError) tab.submitError ||= packetErrorMessage(packet.data);
    return;
  }
  if (packet.type !== "update_state") return;

  tab.state = packet.data || {};
  if (!tab.submitting) return;
  if (packet.data?.loading === true || packet.data?.inQuery === true) {
    tab.executionStarted = true;
    return;
  }
  if (
    packet.data?.loading !== false ||
    (!tab.executionStarted && !["success", "error", "cancelled"].includes(packet.data?.executionStatus))
  ) {
    return;
  }
  finishTableStructure(tab, !["error", "cancelled"].includes(packet.data?.executionStatus) && !tab.submitError);
}

function openQueryWorkspace(nodeKey: string, title = "Query", reuseExisting = true) {
  const tab = workspace.openQueryTab(nodeKey, title, reuseExisting);
  if (tab && !consoleConnections.has(tab.id)) initConsoleSocket(tab);
  return tab;
}

function openConsoleWorkspace(nodeKey: string, title = "Console") {
  const tab = workspace.openConsoleTab(nodeKey, title);
  initConsoleSocket(tab);
}

function openDataViewWorkspace(nodeKey: string, title = "Data View") {
  const tab = workspace.openDataViewTab(nodeKey, title);
  if (tab && !consoleConnections.has(tab.id)) initConsoleSocket(tab);
}

function openDatabaseWorkspace(node: ChenTreeNode) {
  const tab = workspace.openDatabaseTab(
    node,
    node.label || node.name || (node.type === "schema" ? "Schema" : "Database")
  );
  if (node.type === "schema") void loadDatabaseCatalog(tab);
}

async function loadDatabaseCatalog(tab: ChenDatabaseWorkspaceTab, force = false) {
  if ((!force && tab.catalogLoaded) || tab.catalogLoading) return;
  const load = Symbol("schema metadata load");
  databaseCatalogLoads.set(tab, load);
  tab.catalogLoading = true;
  tab.catalogError = "";

  try {
    if (tab.node.type === "schema") {
      const overview = await fetchChenSchemaOverview(auth.chenToken.value, tab.nodeKey, undefined, endpointUrl.value);
      if (databaseCatalogLoads.get(tab) !== load) return;
      tab.schemaOverview = overview;
    } else if ((force || !Array.isArray(tab.node.children)) && tab.node.hasChildren !== false) {
      await tree.loadNodeChildren(tab.node, force);
    }
    if (databaseCatalogLoads.get(tab) !== load) return;
    tab.catalogLoaded = true;
  } catch (cause) {
    if (databaseCatalogLoads.get(tab) !== load) return;
    tab.catalogError = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (databaseCatalogLoads.get(tab) === load) tab.catalogLoading = false;
  }
}

async function openSchemaOverviewTable(tab: ChenDatabaseWorkspaceTab, tableName: string) {
  if (tab.node.type !== "schema") return;
  try {
    if (!Array.isArray(tab.node.children)) await tree.loadNodeChildren(tab.node);
    const tablesFolder = (tab.node.children || []).find(
      (child) => child.type === "folder" && String(child.label || child.name || "").toLowerCase() === "tables"
    );
    if (!tablesFolder) throw new Error("Tables folder is unavailable");
    if (!Array.isArray(tablesFolder.children)) await tree.loadNodeChildren(tablesFolder);
    const tableNode = (tablesFolder.children || []).find(
      (child) => child.type === "table" && String(child.label || child.name || "") === tableName
    );
    if (!tableNode) throw new Error(`Table ${tableName} is unavailable`);
    await handleNodeClick(tableNode);
  } catch (cause) {
    addErrorToast({
      title: "Failed to open table",
      description: cause instanceof Error ? cause.message : String(cause)
    });
  }
}

function updateDatabaseSection(tab: ChenDatabaseWorkspaceTab, section: ChenDatabaseSection) {
  tab.activeSection = section;
}

function closeConsoleSocket(id: string) {
  const connection = consoleConnections.get(id);
  connection?.close();
  consoleConnections.delete(id);

  const tab = workspace.workspaceTabState[id];
  if (tab) tab.socket = null;
}

function closeAllConsoleSockets(reason = "") {
  for (const [id, connection] of consoleConnections) {
    connection.close();
    const tab = workspace.workspaceTabState[id];
    if (tab) {
      tab.socket = null;
      if (reason) tab.connectionError = reason;
    }
  }
  consoleConnections.clear();
}

function performCloseWorkspaceTab(id: string) {
  indexOperations.delete(id);
  closeConsoleSocket(id);
  workspace.closeTab(id);
}

function closeWorkspaceTab(id: string) {
  const tab = workspace.workspaceTabState[id];
  if (tab?.kind === "table-structure" && tableStructureDirty(tab)) {
    pendingDiscard.value = () => performCloseWorkspaceTab(id);
    discardDialogMessage.value = "This table structure has unapplied changes. Discard them and close the tab?";
    discardDialogOpen.value = true;
    return;
  }
  if (!tab || tab.kind === "console") {
    performCloseWorkspaceTab(id);
    return;
  }
  guardDataViewChanges(chenDataViewTargets(tab), () => performCloseWorkspaceTab(id));
}

function tableStructureDirty(tab: ChenTableStructureWorkspaceTab) {
  return tab.columns.some(
    (column) =>
      column.added ||
      column.deleted ||
      column.name !== column.originalName ||
      column.type !== column.originalType ||
      column.size.replaceAll(/\s/g, "") !== column.originalSize.replaceAll(/\s/g, "") ||
      column.nullable !== column.originalNullable
  );
}

function createWorkspaceTab(kind: "query" | "console") {
  const node = currentWorkspaceNode.value;
  if (!canOpenChenQueryConsole(node)) {
    toast.add({
      title: "No database context",
      description: "Select a datasource, database, schema, or table node first, then create a tab.",
      color: "warning"
    });
    return;
  }
  const nodeKey = node.key;

  if (kind === "query") {
    openQueryWorkspace(nodeKey, workspace.nextTabTitle("Query"), false);
    return;
  }

  openConsoleWorkspace(nodeKey, workspace.nextTabTitle("Console"));
}

const dialogVisible = computed({
  get: () => {
    const dialog = session.dialogMessage.value;
    return Boolean(
      dialog && (!session.dialogOpenedDuringStartup.value || dialog.buttons.length || databaseDialogFailed.value)
    );
  },
  set: (open: boolean) => {
    if (!open) session.dismissDialog();
  }
});

const actionMenu = useChenActionMenu<DropdownMenuItem>({
  fetchActions: async (node) => {
    if (!canCreateTableFromNode(node)) return fetchChenActions(auth.chenToken.value, node, endpointUrl.value);

    const createTableAction: ChenActionItem = { key: "__create_table__", label: "New Table" };
    try {
      const actions = await fetchChenActions(auth.chenToken.value, node, endpointUrl.value);
      const otherActions = actions.filter((item) => {
        const key = item.key.trim().toLowerCase().replaceAll("-", "_");
        return key !== "new_table" && item.label.trim().toLowerCase() !== "new table";
      });
      return [createTableAction, ...otherActions];
    } catch {
      return [createTableAction];
    }
  },
  mapItems: mapActionItems,
  onError: (node, cause) => {
    addErrorToast({
      title: "Failed to load actions",
      description: `${node.label || node.name || node.key}: ${cause instanceof Error ? cause.message : String(cause)}`
    });
  }
});
const {
  close: closeActionMenu,
  items: contextMenuItems,
  open: openActionMenu,
  position: contextMenuPosition,
  visible: contextMenuVisible
} = actionMenu;

const ACTION_MENU_ICONS: Record<string, string> = {
  query: "i-lucide-file-code-2",
  new_query: "i-lucide-file-code-2",
  refresh: "i-lucide-refresh-cw",
  refresh_node: "i-lucide-refresh-cw",
  reload: "i-lucide-refresh-cw",
  view_data: "i-lucide-table-properties",
  show: "i-lucide-info",
  property: "i-lucide-info",
  properties: "i-lucide-info",
  __create_table__: "i-lucide-table-2"
};

function resolveActionMenuIcon(item: ChenActionItem) {
  const key = item.key.trim().toLowerCase().replaceAll("-", "_");
  if (ACTION_MENU_ICONS[key]) return ACTION_MENU_ICONS[key];

  const label = item.label.trim().toLowerCase();
  if (label === "new query" || label === "新建查询") return "i-lucide-file-code-2";
  if (label === "refresh" || label === "reload" || label === "刷新") return "i-lucide-refresh-cw";
  if (label === "view data" || label === "查看数据") return "i-lucide-table-properties";
  if (label === "properties" || label === "属性") return "i-lucide-info";

  return undefined;
}

function mapActionItems(node: ChenTreeNode, items: ChenActionItem[]): DropdownMenuItem[] {
  return items.flatMap((item): DropdownMenuItem[] => {
    const onSelect = () => {
      if (item.disabled) return;
      closeActionMenu();
      void applyTreeAction(node, item.key);
    };
    const icon = resolveActionMenuIcon(item);
    const mappedItem: DropdownMenuItem = {
      label: item.label,
      ...(icon ? { icon } : {}),
      ...(item.disabled ? { disabled: true } : {}),
      ...(item.children?.length ? { children: mapActionItems(node, item.children) } : { onSelect })
    };

    return item.divided ? [{ type: "separator" }, mappedItem] : [mappedItem];
  });
}

async function applyTreeAction(node: ChenTreeNode, action: string) {
  if (action === "__create_table__") {
    openCreateTableWorkspace(node);
    return;
  }
  try {
    const response = await tree.runTreeAction(node, action);
    switch (response.event) {
      case "refresh_node":
        clearMetadataCaches();
        await tree.loadNodeChildren(node, true);
        {
          const databaseTab = Object.values(workspace.workspaceTabState).find(
            (tab): tab is ChenDatabaseWorkspaceTab => tab.kind === "database" && tab.nodeKey === node.key
          );
          if (databaseTab?.node.type === "schema") await loadDatabaseCatalog(databaseTab, true);
        }
        break;
      case "new_query":
        openQueryWorkspace(response.data, "Query");
        break;
      case "view_data":
        openDataViewWorkspace(response.data, "Data View");
        recentTables.add(node, tree.findNodePathByKey(node.key), auth.profile.value?.dbType || props.tab.protocol);
        if (!tree.expandedKeys.value.includes(RECENT_TABLES_ROOT_KEY)) {
          tree.expandedKeys.value = [RECENT_TABLES_ROOT_KEY, ...tree.expandedKeys.value];
        }
        break;
      case "new_dialog":
        session.openDialog(response.data);
        break;
      default:
        // No actionable event (e.g. backend returned none for "show" on a
        // folder). Fall back to toggling the node so double-clicking a folder
        // expands it, matching old chen. Leaf nodes have nothing to toggle.
        if (response.event !== "blank") console.warn("Unknown Chen tree action event", response.event);
        if (!node.leaf) tree.toggleTreeNode(node);
        break;
    }
  } catch (cause) {
    addErrorToast({
      title: "Action failed",
      description: cause instanceof Error ? cause.message : String(cause)
    });
  }
}

function isTablesFolder(node: ChenTreeNode) {
  if (node.type === "table") return false;
  const name = String(node.label || node.name || "")
    .trim()
    .toLowerCase();
  return node.type === "tables" || (node.type === "folder" && name === "tables");
}

function canCreateTableFromNode(node: ChenTreeNode) {
  if (isTablesFolder(node) || node.type === "schema") return true;
  const dbType = String(auth.profile.value?.dbType || props.tab.protocol || "").toLowerCase();
  return node.type === "database" && (dbType.includes("mysql") || dbType.includes("mariadb"));
}

function openCreateTableWorkspace(node: ChenTreeNode) {
  const contextNode = [...tree.findNodePathByKey(node.key)]
    .reverse()
    .find(
      (candidate) => candidate.type === "schema" || candidate.type === "database" || candidate.type === "datasource"
    );
  if (!contextNode) {
    toast.add({
      title: "No database context",
      description: "Refresh the database tree and try again.",
      color: "warning"
    });
    return;
  }

  const refreshNode = isTablesFolder(node) ? node : (node.children || []).find(isTablesFolder) || node;
  const tab = workspace.openCreateTableTab(
    contextNode.key,
    refreshNode,
    auth.profile.value?.dbType || props.tab.protocol || ""
  );
  initConsoleSocket(tab);
}

function submitCreateTable(tab: ChenCreateTableWorkspaceTab, sql: string) {
  if (tab.submitting) return;
  tab.generatedSql = sql;
  tab.submitError = "";
  tab.created = false;
  tab.submitting = true;
  tab.executionStarted = false;
  if (!queryConsole.sendSql(tab, sql)) {
    tab.submitting = false;
    tab.submitError = tab.connectionError || "Console websocket is not connected";
  }
}

function addCreateTableColumn(tab: ChenCreateTableWorkspaceTab) {
  tab.columns.push({
    id: newChenWorkspaceId("column"),
    name: "",
    type: tab.columns[0]?.type || "VARCHAR",
    size: "",
    nullable: true,
    primaryKey: false
  });
}

function updateCreateTableColumn(
  tab: ChenCreateTableWorkspaceTab,
  id: string,
  patch: Partial<ChenCreateTableWorkspaceTab["columns"][number]>
) {
  const column = tab.columns.find((item) => item.id === id);
  if (column) Object.assign(column, patch);
}

function updateActiveCreateTableColumn(id: string, patch: Partial<ChenCreateTableWorkspaceTab["columns"][number]>) {
  const tab = activeCreateTableTab.value;
  if (tab) updateCreateTableColumn(tab, id, patch);
}

function openTableStructureWorkspace(tab: ChenDataViewConsoleTab, columns: ChenDataViewColumnPreview[]) {
  const tableName = String(tab.meta?.table || tab.meta?.title || tab.title).trim();
  if (!tableName) {
    toast.add({ title: "Table metadata unavailable", color: "warning" });
    return;
  }
  const structureTab = workspace.openTableStructureTab(
    tab.id,
    tab.nodeKey,
    String(tab.meta?.schema || "").trim(),
    tableName,
    columns,
    auth.profile.value?.dbType || props.tab.protocol || ""
  );
  initConsoleSocket(structureTab);
}

function addTableStructureColumn(tab: ChenTableStructureWorkspaceTab) {
  const fallbackType = tab.columns.find((column) => !column.deleted)?.type || "VARCHAR";
  tab.columns.push({
    id: newChenWorkspaceId("column"),
    name: "",
    type: fallbackType,
    size: "",
    nullable: true,
    primaryKey: false,
    originalName: "",
    originalType: "",
    originalSize: "",
    originalNullable: true,
    added: true,
    deleted: false
  });
}

function updateActiveTableStructureColumn(
  id: string,
  patch: Partial<ChenTableStructureWorkspaceTab["columns"][number]>
) {
  const column = activeTableStructureTab.value?.columns.find((item) => item.id === id);
  if (column) Object.assign(column, patch);
}

function resetTableStructure(tab: ChenTableStructureWorkspaceTab) {
  tab.columns = tab.columns
    .filter((column) => !column.added)
    .map((column) => ({
      ...column,
      name: column.originalName,
      type: column.originalType,
      size: column.originalSize,
      nullable: column.originalNullable,
      deleted: false
    }));
  tab.submitError = "";
  tab.saved = false;
}

function submitTableStructure(tab: ChenTableStructureWorkspaceTab, sql: string) {
  if (tab.submitting) return;
  tab.generatedSql = sql;
  tab.submitError = "";
  tab.saved = false;
  tab.submitting = true;
  tab.executionStarted = false;
  if (!queryConsole.sendSql(tab, sql)) {
    tab.submitting = false;
    tab.submitError = tab.connectionError || "Console websocket is not connected";
  }
}

function executeIndexSql(
  sourceTab: ChenDataViewConsoleTab,
  sql: string,
  operation: "create" | "drop",
  indexName: string
) {
  if (sourceTab.editState.activeRequest || chenDataViewHasDirty(sourceTab.editState)) {
    toast.add({
      title: "Resolve pending row changes first",
      description: "Save or cancel the table's pending row changes before changing its indexes.",
      color: "warning"
    });
    return;
  }
  const activeOperation = [...indexOperations.values()].some((item) => item.sourceTabId === sourceTab.id);
  if (activeOperation) {
    toast.add({ title: "Index operation in progress", color: "warning" });
    return;
  }
  const tab = workspace.openQueryTab(sourceTab.nodeKey, `${operation === "create" ? "Create" : "Drop"} index`, false);
  if (!tab || tab.kind !== "query") return;
  tab.statement = sql;
  indexOperations.set(tab.id, { sourceTabId: sourceTab.id, operation, indexName, started: false, error: "" });
  initConsoleSocket(tab);
  if (!queryConsole.sendSql(tab, sql)) {
    indexOperations.delete(tab.id);
    addErrorToast({ title: `Failed to ${operation} index`, description: tab.connectionError || "Console unavailable" });
  }
}

async function handleNodeClick(node: ChenTreeNode) {
  tree.selectedNodeKey.value = node.key;
  if (node.type === "database" || node.type === "schema") {
    openDatabaseWorkspace(node);
    if (isNarrowScreen.value) resourceTreeOpen.value = false;
    return;
  }
  if (node.type === "recent-table" && node.recentEntry) {
    const recentEntry = node.recentEntry;
    const liveNode =
      (await tree.resolveNodePath(recentEntry.path || [])) || tree.findNodeByKey(recentEntry.node?.key || "");
    if (!liveNode) {
      toast.add({
        title: "Table is no longer available",
        description: "Refresh the database tree and open the table again.",
        color: "warning"
      });
      return;
    }
    await applyTreeAction(liveNode, "view_data");
    if (isNarrowScreen.value) resourceTreeOpen.value = false;
    return;
  }
  const action = chenNodeActivationAction(node);
  if (action) {
    await applyTreeAction(node, action);
    if (isNarrowScreen.value) resourceTreeOpen.value = false;
    return;
  }
  if (!node.leaf) tree.toggleTreeNode(node);
}

async function openNodeMenu(node: ChenTreeNode, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  await openActionMenu(node, event);
}

function clearRecentTables() {
  recentTables.clear();
  tree.expandedKeys.value = tree.expandedKeys.value.filter((key) => key !== RECENT_TABLES_ROOT_KEY);
  if (tree.selectedNodeKey.value.startsWith(RECENT_TABLES_ROOT_KEY)) {
    tree.selectedNodeKey.value = tree.rootNodes.value[0]?.key || "";
  }
}

function runQueryTab(tab: ChenQueryLikeWorkspaceTab, selectedSql = "") {
  if (tab.kind === "console") {
    if (mayChangeSqlMetadata(tab.pendingSql)) clearMetadataCaches();
    queryConsole.runConsoleTab(tab);
    return;
  }
  const statement = selectedSql || tab.statement;
  if (tab.state.loading || tab.state.inQuery || !statement.trim()) {
    queryConsole.runQueryTab(tab, selectedSql);
    return;
  }
  guardDataViewChanges(chenDataViewTargets(tab), () => {
    if (chenUnrestrictedMutations(statement).length) {
      pendingUnrestrictedMutation.value = { kind: "query", tab, sql: statement };
      unrestrictedMutationDialogOpen.value = true;
      return;
    }
    executeQueryTab(tab, statement);
  });
}

function executeQueryTab(tab: ChenQueryConsoleTab, statement: string) {
  queryConsole.runQueryTab(tab, statement);
  if (mayChangeSqlMetadata(statement)) clearMetadataCaches();
}

function updateUnrestrictedMutationDialog(open: boolean) {
  unrestrictedMutationDialogOpen.value = open;
  if (!open) pendingUnrestrictedMutation.value = null;
}

function confirmUnrestrictedMutation() {
  const pending = pendingUnrestrictedMutation.value;
  updateUnrestrictedMutationDialog(false);
  if (!pending) return;
  if (pending.kind === "upload") {
    void performUploadQuerySql(pending.tab, pending.file);
    return;
  }
  executeQueryTab(pending.tab, pending.sql);
}

async function uploadQuerySql(tab: ChenQueryConsoleTab, file: File) {
  if (tab.uploadingSql || tab.state.loading || tab.state.inQuery) return;
  let sql: string;
  try {
    sql = await file.text();
  } catch (cause) {
    addErrorToast({
      title: "SQL file could not be read",
      description: cause instanceof Error ? cause.message : String(cause)
    });
    return;
  }

  guardDataViewChanges(chenDataViewTargets(tab), () => {
    if (chenUnrestrictedMutations(sql).length) {
      pendingUnrestrictedMutation.value = { kind: "upload", tab, sql, file };
      unrestrictedMutationDialogOpen.value = true;
      return;
    }
    void performUploadQuerySql(tab, file);
  });
}

async function performUploadQuerySql(tab: ChenQueryConsoleTab, file: File) {
  if (tab.uploadingSql || tab.state.loading || tab.state.inQuery) return;
  tab.uploadingSql = true;
  try {
    const result = await uploadChenSqlFile(auth.chenToken.value, file, undefined, endpointUrl.value);
    queryConsole.runQueryFile(tab, result.path);
    clearMetadataCaches();
    toast.add({ title: "SQL file uploaded", description: file.name, color: "success" });
  } catch (cause) {
    addErrorToast({
      title: "SQL upload failed",
      description: cause instanceof Error ? cause.message : String(cause)
    });
  } finally {
    tab.uploadingSql = false;
  }
}

function cancelQueryLikeTab(tab: ChenQueryLikeWorkspaceTab) {
  queryConsole.cancelQueryLikeTab(tab);
}

function changeQueryContext(tab: ChenQueryConsoleTab, context: string) {
  queryConsole.changeQueryContext(tab, context);
}

function updateQueryStatement(tab: ChenQueryConsoleTab, value: string) {
  if (tab.statement === value) return;
  tab.statement = value;
  tab.aiRevision += 1;
}

function updateConsolePendingSql(tab: ChenPromptConsoleTab, value: string) {
  tab.pendingSql = value;
}

function mayChangeSqlMetadata(statement: string) {
  return /^\s*(?:create|alter|drop|rename|truncate|comment)\b/i.test(statement);
}

function clearConsoleTranscript(tab: ChenPromptConsoleTab) {
  queryConsole.clearConsoleTranscript(tab);
}

function activateQueryResult(tab: ChenQueryConsoleTab, id: string) {
  tab.activeResultTabId = id;
}

function closeQueryResult(tab: ChenQueryConsoleTab, resultId: string) {
  const target = findChenDataViewTarget(tab, resultId);
  if (!target) return;
  guardDataViewChanges([target], () => queryConsole.closeQueryResult(tab, resultId));
}

function dismissQueryMessage(tab: ChenQueryConsoleTab) {
  queryConsole.dismissQueryMessage(tab);
}

function runQueryDataViewAction(
  tab: ChenQueryConsoleTab,
  result: ChenQueryResultTab,
  action: ChenDataViewAction,
  data?: ChenDataViewActionData
) {
  if ((action === "save_changes_preview" || action === "save_changes") && result.editState.refreshRequiredBeforeSave) {
    toast.add({
      title: "Refresh required",
      description: "Refresh the data before saving again because the previous connection was reset.",
      color: "warning"
    });
    return;
  }
  const send = () => dataView.sendDataViewAction(tab, result, action, data);
  if (GUARDED_DATA_VIEW_ACTIONS.has(action)) {
    guardDataViewChanges([result], send);
    return;
  }
  send();
}

function runStandaloneDataViewAction(
  tab: ChenDataViewConsoleTab,
  action: ChenDataViewAction,
  data?: ChenDataViewActionData
) {
  if ((action === "save_changes_preview" || action === "save_changes") && tab.editState.refreshRequiredBeforeSave) {
    toast.add({
      title: "Refresh required",
      description: "Refresh the data before saving again because the previous connection was reset.",
      color: "warning"
    });
    return;
  }
  const send = () => dataView.sendDataViewAction(tab, tab, action, data);
  if (GUARDED_DATA_VIEW_ACTIONS.has(action)) {
    guardDataViewChanges([tab], send);
    return;
  }
  send();
}

function updateDataViewPanel(tab: Extract<ChenWorkspaceTab, { kind: "data-view" }>, panel: "data" | "properties") {
  tab.activePanel = panel;
}

function updateDataViewPropertyTab(
  tab: Extract<ChenWorkspaceTab, { kind: "data-view" }>,
  propertyTab: Extract<ChenWorkspaceTab, { kind: "data-view" }>["activePropertyTab"]
) {
  tab.activePropertyTab = propertyTab;
}

function updateDataViewWhereCondition(tab: ChenDataViewConsoleTab, condition: string) {
  tab.whereCondition = condition;
}

function startResize(event: PointerEvent) {
  if (event.button !== 0 || isNarrowScreen.value) return;

  event.preventDefault();
  resizing.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = sidebarWidth.value;
  resizeHandle = event.currentTarget as HTMLElement;
  resizePointerId = event.pointerId;
  resizeHandle.setPointerCapture(event.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handlePointerMove(event: PointerEvent) {
  if (!resizing.value) return;
  sidebarWidth.value = Math.min(420, Math.max(220, resizeStartWidth + event.clientX - resizeStartX));
}

function stopResize() {
  if (!resizing.value) return;

  resizing.value = false;
  if (resizeHandle && resizePointerId !== null && resizeHandle.hasPointerCapture(resizePointerId)) {
    resizeHandle.releasePointerCapture(resizePointerId);
  }
  resizeHandle = null;
  resizePointerId = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function focus() {}

async function refreshResourceRoot() {
  clearMetadataCaches();
  await tree.refreshRoot();
}

watch(
  tokenId,
  (id) => {
    if (id) void session.bootstrapSession();
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
});

onBeforeUnmount(() => {
  stopResize();
  closeSqlAiSession();
  closeAllConsoleSockets();
  clearMetadataCaches();
  workspace.closeAllTabs();
  session.cleanupSession();
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
});

defineExpose({ focus });
</script>

<template>
  <div class="relative isolate h-full min-h-0 overflow-hidden bg-[var(--workspace-surface-main)] text-[var(--app-fg)]">
    <div v-if="session.ready.value" class="relative flex h-full min-h-0">
      <ResourceTreePanel
        v-show="!isNarrowScreen || resourceTreeOpen"
        class="z-40 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl"
        :root-nodes="explorerRootNodes"
        :selected-key="tree.selectedNodeKey.value"
        :expanded-keys="tree.expandedKeys.value"
        :children-map="tree.childrenMap"
        :loading-children="tree.loadingChildren"
        :db-type="auth.profile.value?.dbType"
        :width="resourceTreeWidth"
        :tab-title-format="workspacePreferences.tabTitleFormat"
        :sql-keyword-case="workspacePreferences.sqlKeywordCase"
        @close="resourceTreeOpen = false"
        @refresh="refreshResourceRoot"
        @update:tab-title-format="workspacePreferences.tabTitleFormat = $event"
        @update:sql-keyword-case="workspacePreferences.sqlKeywordCase = $event"
        @select="tree.selectedNodeKey.value = $event.key"
        @activate="handleNodeClick"
        @toggle="tree.toggleTreeNode"
        @menu="({ node, event }) => openNodeMenu(node, event)"
        @clear-recent="clearRecentTables"
      />

      <button
        v-if="isNarrowScreen && resourceTreeOpen"
        type="button"
        class="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
        aria-label="Close database explorer"
        @click="resourceTreeOpen = false"
      />

      <div
        role="separator"
        aria-label="Resize database sidebar"
        aria-orientation="vertical"
        :aria-valuenow="sidebarWidth"
        aria-valuemin="220"
        aria-valuemax="420"
        class="group relative z-20 w-px shrink-0 cursor-col-resize touch-none bg-default/60 hover:bg-primary/40 active:bg-primary/60 max-md:hidden"
        @pointerdown="startResize"
      >
        <div class="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex h-9 shrink-0 items-center border-b border-default px-2 md:hidden">
          <UButton
            icon="i-lucide-panel-left"
            label="Database Explorer"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-expanded="resourceTreeOpen"
            @click="resourceTreeOpen = true"
          />
        </div>
        <WorkspaceTabBar
          :tabs="workspace.workspaceTabs.value"
          :active-tab-id="workspace.activeWorkspaceTabId.value"
          :tab-title-format="workspacePreferences.tabTitleFormat"
          :log-open="logConsoleOpen"
          :log-error-count="unreadLogErrorCount"
          @activate="workspace.setActiveTab"
          @close="closeWorkspaceTab"
          @create="createWorkspaceTab"
          @rename="workspace.renameTab"
          @toggle-log="toggleLogConsole"
        />

        <div
          v-if="activeConnectionError"
          class="flex shrink-0 items-center gap-2 border-b border-error/25 bg-error/10 px-3 py-2 text-xs text-error"
        >
          <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
          <span>{{ activeConnectionError }}</span>
        </div>

        <div v-if="workspace.activeWorkspaceTab.value" class="min-h-0 flex-1">
          <QueryConsolePanel
            v-if="activeQueryTab"
            ref="queryConsolePanel"
            :tab="activeQueryTab"
            :db-type="auth.profile.value?.dbType || ''"
            :can-copy="auth.profile.value?.canCopy === true"
            :ai-enabled="auth.profile.value?.chatAiEnabled === true"
            :metadata-store="sqlMetadataStore"
            :sql-keyword-case="workspacePreferences.sqlKeywordCase"
            @run="runQueryTab"
            @cancel="cancelQueryLikeTab"
            @change-context="changeQueryContext"
            @upload-sql="uploadQuerySql"
            @data-view-action="runQueryDataViewAction"
            @dismiss-message="dismissQueryMessage"
            @update-statement="updateQueryStatement"
            @ai-generate="openSqlAi"
            @ai-explain="requestSqlAi('explain')"
            @ai-repair="requestSqlAi('repair')"
            @activate-result="activateQueryResult"
            @close-result="closeQueryResult"
          />

          <ConsolePanel
            v-else-if="activeConsoleTab"
            :tab="activeConsoleTab"
            :context-label="currentContextLabel"
            :prompt-label="consolePromptLabel"
            :can-copy="auth.profile.value?.canCopy === true"
            @run="runQueryTab"
            @cancel="cancelQueryLikeTab"
            @clear="clearConsoleTranscript"
            @update-pending-sql="updateConsolePendingSql"
          />

          <DataViewPanel
            v-else-if="activeDataViewTab"
            :tab="activeDataViewTab"
            :db-type="auth.profile.value?.dbType"
            :protocol="props.tab.protocol"
            :can-copy="auth.profile.value?.canCopy === true"
            @data-view-action="runStandaloneDataViewAction"
            @edit-structure="openTableStructureWorkspace"
            @execute-index-sql="executeIndexSql"
            @update-panel="updateDataViewPanel"
            @update-property-tab="updateDataViewPropertyTab"
            @update-where-condition="updateDataViewWhereCondition"
          />

          <DatabaseOverviewPanel
            v-else-if="activeDatabaseTab"
            :tab="activeDatabaseTab"
            :db-type="auth.profile.value?.dbType"
            @select-section="updateDatabaseSection(activeDatabaseTab, $event)"
            @load-catalog="loadDatabaseCatalog(activeDatabaseTab)"
            @open-table="openSchemaOverviewTable(activeDatabaseTab, $event)"
          />

          <CreateTablePanel
            v-else-if="activeCreateTableTab"
            :tab="activeCreateTableTab"
            @add-column="addCreateTableColumn(activeCreateTableTab)"
            @remove-column="
              activeCreateTableTab.columns = activeCreateTableTab.columns.filter((item) => item.id !== $event)
            "
            @submit="submitCreateTable(activeCreateTableTab, $event)"
            @update-column="updateActiveCreateTableColumn"
            @update-table-name="activeCreateTableTab.tableName = $event"
          />

          <TableStructurePanel
            v-else-if="activeTableStructureTab"
            :tab="activeTableStructureTab"
            @add-column="addTableStructureColumn(activeTableStructureTab)"
            @reset="resetTableStructure(activeTableStructureTab)"
            @submit="submitTableStructure(activeTableStructureTab, $event)"
            @update-column="updateActiveTableStructureColumn"
          />
        </div>

        <ChenSessionState
          v-else
          icon="i-lucide-database-zap"
          title="Database workspace"
          message="Select a database action to begin."
        />

        <LogConsolePanel
          v-show="logConsoleOpen"
          :entries="logConsoleEntries"
          @clear="clearLogConsole"
          @close="closeLogConsole"
        />
      </section>
    </div>

    <ChenSessionState
      v-else
      :icon="startupErrorMessage ? 'i-lucide-circle-alert' : 'i-lucide-database'"
      :loading="!startupErrorMessage"
      :title="startupErrorMessage ? 'Unable to open database workspace' : 'Opening database workspace'"
      :message="startupErrorMessage || startupMessage"
      :action-label="startupErrorMessage ? 'Retry' : undefined"
      @action="emit('reconnect')"
    />

    <UDropdownMenu
      v-model:open="contextMenuVisible"
      :items="contextMenuItems"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="
        (open) => {
          if (!open) closeActionMenu();
        }
      "
    >
      <div
        class="pointer-events-none fixed"
        :style="{
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`,
          width: '1px',
          height: '1px'
        }"
      />
    </UDropdownMenu>

    <ChenWorkspaceModal
      v-model:open="dialogVisible"
      :title="databaseDialogFailed ? '数据库连接失败' : session.dialogMessage.value?.title || 'Message'"
      :close="session.dialogMessage.value?.showClose"
      :dismissible="session.dialogMessage.value?.showClose"
    >
      <template #body>
        <dl v-if="session.dialogMessage.value?.items.length" class="space-y-3 p-4 text-sm">
          <template v-for="item in session.dialogMessage.value.items" :key="item.label">
            <dt class="font-medium text-default">
              {{ item.label }}
            </dt>
            <dd class="whitespace-pre-wrap break-words text-muted">
              {{ formatChenDialogValue(item.value) }}
            </dd>
          </template>
        </dl>
        <pre v-else class="whitespace-pre-wrap break-words p-4 text-sm text-muted">{{ databaseDialogText }}</pre>
      </template>

      <template v-if="session.dialogMessage.value?.buttons.length" #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            v-for="(button, index) in session.dialogMessage.value.buttons"
            :key="`${button.event}-${index}`"
            @click="session.sendDialogEvent(session.dialogMessage.value?.id || null, button.event)"
          >
            {{ button.label }}
          </UButton>
        </div>
      </template>
    </ChenWorkspaceModal>

    <DiscardDataViewChangesDialog
      v-if="discardDialogOpen"
      :open="discardDialogOpen"
      :message="discardDialogMessage"
      @update:open="updateDiscardDialog"
      @confirm="confirmDiscardChanges"
    />

    <ChenWorkspaceModal
      :open="unrestrictedMutationDialogOpen"
      title="Execute statement without WHERE?"
      :dismissible="false"
      :close="false"
      @update:open="updateUnrestrictedMutationDialog"
    >
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-muted">
            One or more UPDATE or DELETE statements have no WHERE clause and may affect every row in a table. Confirm
            that you want to execute them.
          </p>
          <pre
            class="max-h-48 overflow-auto rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs whitespace-pre-wrap text-default"
            >{{ unrestrictedMutationSqlPreview }}</pre>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="updateUnrestrictedMutationDialog(false)">Cancel</UButton>
          <UButton color="error" icon="i-lucide-triangle-alert" @click="confirmUnrestrictedMutation">
            Execute anyway
          </UButton>
        </div>
      </template>
    </ChenWorkspaceModal>
  </div>
</template>
