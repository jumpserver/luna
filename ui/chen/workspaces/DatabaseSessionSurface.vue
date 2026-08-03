<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  ChenActionItem,
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewActionTarget,
  ChenDataViewConsoleTab,
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenQueryResultTab,
  ChenSaveChangesPreviewResult,
  ChenSaveChangesResult,
  ChenTreeNode,
  ChenWorkspaceTab
} from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { fetchChenActions, fetchChenExport, fetchChenSqlHints, uploadChenSqlFile } from "~/chen/api";
import ChenSessionState from "~/chen/components/ChenSessionState.vue";
import ConsolePanel from "~/chen/components/ConsolePanel.vue";
import DataViewPanel from "~/chen/components/DataViewPanel.vue";
import DiscardDataViewChangesDialog from "~/chen/components/DiscardDataViewChangesDialog.vue";
import QueryConsolePanel from "~/chen/components/QueryConsolePanel.vue";
import ResourceTreePanel from "~/chen/components/ResourceTreePanel.vue";
import WorkspaceTabBar from "~/chen/components/WorkspaceTabBar.vue";
import { useChenActionMenu } from "~/chen/composables/useChenActionMenu";
import { useChenAuth } from "~/chen/composables/useChenAuth";
import { useChenDataView } from "~/chen/composables/useChenDataView";
import { useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";
import { useChenResourceTree } from "~/chen/composables/useChenResourceTree";
import { useChenSession } from "~/chen/composables/useChenSession";
import { useChenSqlHints } from "~/chen/composables/useChenSqlHints";
import { useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { useChenWorkspaceTabs } from "~/chen/composables/useChenWorkspaceTabs";
import { saveChenExport } from "~/chen/runtime/download";
import { formatChenDialogValue, normalizeChenDialogMessage } from "~/chen/utils/chenDialog";
import {
  acceptChenSaveChangesPreviewResult,
  acceptChenSaveChangesResult,
  chenDataViewHasDirty,
  chenDataViewTargets,
  clearChenDataViewEdits,
  findChenDataViewTarget
} from "~/chen/utils/dataViewEditing";
import { chenNodeActivationAction } from "~/chen/utils/resourceTree";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();

const toast = useToast();
const { addErrorToast } = useErrorToast();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const tabRef = toRef(props, "tab");

const sidebarWidth = ref(280);
const resizing = ref(false);
const discardDialogOpen = ref(false);
const pendingDiscard = shallowRef<(() => void) | null>(null);
const GUARDED_DATA_VIEW_ACTIONS = new Set<ChenDataViewAction>([
  "first_page",
  "prev_page",
  "next_page",
  "last_page",
  "refresh",
  "change_limit"
]);

const auth = useChenAuth(tabRef);
const tree = useChenResourceTree(auth.chenToken, {
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
const dataView = useChenDataView(sendConsoleAction);
const consoleConnections = new Map<string, ReturnType<typeof useChenWebSocket>>();

const currentWorkspaceNodeKey = computed(() => {
  return (
    tree.selectedNodeKey.value || workspace.activeWorkspaceTab.value?.nodeKey || tree.rootNodes.value[0]?.key || ""
  );
});
const currentWorkspaceNode = computed(() => tree.findNodeByKey(currentWorkspaceNodeKey.value));
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
const activeConnectionError = computed(() => workspace.activeWorkspaceTab.value?.connectionError || "");

const queryConsole = useChenQueryConsole(sendConsoleAction);
const queryHints = useChenSqlHints(
  (tab, context) => fetchChenSqlHints(auth.chenToken.value, tab.nodeKey, context),
  (cause) => {
    toast.add({
      title: "Failed to load SQL hints",
      description: cause instanceof Error ? cause.message : String(cause),
      color: "warning"
    });
  }
);
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
  },
  onDisconnected: () => closeAllConsoleSockets("Database session disconnected"),
  showMessage: (data) => {
    toast.add({
      title: data?.level || "Message",
      description: data?.message || "",
      color: data?.level?.toLowerCase() === "error" ? "error" : "primary"
    });
  },
  downloadFile: downloadExportFile
});

async function downloadExportFile(fileKey: string) {
  const file = await fetchChenExport(auth.chenToken.value, fileKey);
  const result = await saveChenExport(file.blob, file.fileName);
  toast.add(
    result === "saved"
      ? { title: "Export downloaded", description: file.fileName, color: "success" }
      : { title: "Export canceled", description: file.fileName, color: "neutral" }
  );
}

function initConsoleSocket(tab: ChenWorkspaceTab) {
  const existing = consoleConnections.get(tab.id);
  if (existing) return existing;
  if (!session.ready.value) {
    tab.connectionError = "Database session is not ready";
    return null;
  }

  tab.connectionError = "";
  const connection = useChenWebSocket({
    path: "console",
    onOpen: () => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab) {
        connection.close();
        return;
      }

      connection.sendImmediately({
        type: "connect",
        data: {
          nodeKey: reactiveTab.nodeKey,
          type: reactiveTab.kind === "data-view" ? "data_view" : "query"
        }
      });
    },
    onPacket: (packet) => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab) return;

      handleConsolePacket(reactiveTab, packet);
      if (packet.type === "init") {
        reactiveTab.connectionError = "";
        connection.markReady();
      }
    },
    onError: (socketError) => {
      const reactiveTab = workspace.workspaceTabState[tab.id];
      if (!reactiveTab) return;
      reactiveTab.socket = null;
      reactiveTab.connectionError = socketError.message;
      queryConsole.appendLog(reactiveTab, socketError.message);
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
  queryConsole.appendLog(tab, tab.connectionError);
  return false;
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
  discardDialogOpen.value = true;
}

function updateDiscardDialog(open: boolean) {
  discardDialogOpen.value = open;
  if (!open) pendingDiscard.value = null;
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
    toast.add({
      title: "Save outcome is unknown",
      description:
        "The connection was reset. Refresh to verify the database state before retrying; transaction and session state were lost.",
      color: "warning"
    });
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
  dataView.sendDataViewAction(tab, target, "refresh");
}

function handleConsolePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  const previousContext = tab.kind === "query" ? tab.state.currentContext : undefined;
  if (tab.kind === "query" || tab.kind === "console") {
    queryConsole.handleQueryConsolePacket(tab, packet);
  }
  if (tab.kind === "query" && packet.type === "update_state") {
    const currentContext = tab.state.currentContext || "";
    if (currentContext && currentContext !== previousContext) void queryHints.load(tab, currentContext);
  }

  switch (packet.type) {
    case "init":
      if (tab.kind === "data-view") tab.title = packet.data?.title || tab.title;
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

function openQueryWorkspace(nodeKey: string, title = "Query", reuseExisting = true) {
  const tab = workspace.openQueryTab(nodeKey, title, reuseExisting);
  if (tab && !consoleConnections.has(tab.id)) initConsoleSocket(tab);
}

function openConsoleWorkspace(nodeKey: string, title = "Console") {
  const tab = workspace.openConsoleTab(nodeKey, title);
  initConsoleSocket(tab);
}

function openDataViewWorkspace(nodeKey: string, title = "Data View") {
  const tab = workspace.openDataViewTab(nodeKey, title);
  if (tab && !consoleConnections.has(tab.id)) initConsoleSocket(tab);
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
  closeConsoleSocket(id);
  workspace.closeTab(id);
}

function closeWorkspaceTab(id: string) {
  const tab = workspace.workspaceTabState[id];
  if (!tab || tab.kind === "console") {
    performCloseWorkspaceTab(id);
    return;
  }
  guardDataViewChanges(chenDataViewTargets(tab), () => performCloseWorkspaceTab(id));
}

function createWorkspaceTab(kind: "query" | "console") {
  const nodeKey = currentWorkspaceNodeKey.value;
  if (!nodeKey) {
    toast.add({
      title: "No database context",
      description: "Select a database or schema node first, then create a tab.",
      color: "warning"
    });
    return;
  }

  if (kind === "query") {
    openQueryWorkspace(nodeKey, workspace.nextTabTitle("Query"), false);
    return;
  }

  openConsoleWorkspace(nodeKey, workspace.nextTabTitle("Console"));
}

const dialogVisible = computed({
  get: () => Boolean(session.dialogMessage.value),
  set: (open: boolean) => {
    if (!open) session.dialogMessage.value = null;
  }
});

const actionMenu = useChenActionMenu<DropdownMenuItem>({
  fetchActions: (node) => fetchChenActions(auth.chenToken.value, node),
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

function mapActionItems(node: ChenTreeNode, items: ChenActionItem[]): DropdownMenuItem[] {
  return items.flatMap((item): DropdownMenuItem[] => {
    const onSelect = () => {
      if (item.disabled) return;
      closeActionMenu();
      void applyTreeAction(node, item.key);
    };
    const mappedItem: DropdownMenuItem = {
      label: item.label,
      ...(item.icon ? { icon: item.icon } : {}),
      ...(item.disabled ? { disabled: true } : {}),
      ...(item.children?.length ? { children: mapActionItems(node, item.children) } : { onSelect })
    };

    return item.divided ? [{ type: "separator" }, mappedItem] : [mappedItem];
  });
}

async function applyTreeAction(node: ChenTreeNode, action: string) {
  try {
    const response = await tree.runTreeAction(node, action);
    switch (response.event) {
      case "refresh_node":
        await tree.loadNodeChildren(node, true);
        break;
      case "new_query":
        openQueryWorkspace(response.data, "Query");
        break;
      case "view_data":
        openDataViewWorkspace(response.data, "Data View");
        break;
      case "new_dialog":
        session.dialogMessage.value = normalizeChenDialogMessage(response.data);
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

async function handleNodeClick(node: ChenTreeNode) {
  tree.selectedNodeKey.value = node.key;
  const action = chenNodeActivationAction(node);
  if (action) {
    await applyTreeAction(node, action);
    return;
  }
  if (!node.leaf) tree.toggleTreeNode(node);
}

async function openNodeMenu(node: ChenTreeNode, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  await openActionMenu(node, event);
}

function runQueryTab(tab: ChenQueryLikeWorkspaceTab, selectedSql = "") {
  if (tab.kind === "console") {
    queryConsole.runConsoleTab(tab);
    return;
  }
  if (tab.state.loading || tab.state.inQuery || !(selectedSql || tab.statement).trim()) {
    queryConsole.runQueryTab(tab, selectedSql);
    return;
  }
  guardDataViewChanges(chenDataViewTargets(tab), () => queryConsole.runQueryTab(tab, selectedSql));
}

function uploadQuerySql(tab: ChenQueryConsoleTab, file: File) {
  if (tab.uploadingSql || tab.state.loading || tab.state.inQuery) return;
  guardDataViewChanges(chenDataViewTargets(tab), () => void performUploadQuerySql(tab, file));
}

async function performUploadQuerySql(tab: ChenQueryConsoleTab, file: File) {
  tab.uploadingSql = true;
  try {
    const result = await uploadChenSqlFile(auth.chenToken.value, file);
    queryConsole.runQueryFile(tab, result.path);
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
  tab.statement = value;
}

function updateConsolePendingSql(tab: ChenPromptConsoleTab, value: string) {
  tab.pendingSql = value;
}

function activateQueryResult(tab: ChenQueryLikeWorkspaceTab, id: string) {
  tab.activeResultTabId = id;
}

function closeQueryResult(tab: ChenQueryLikeWorkspaceTab, title: string) {
  if (tab.kind === "console") {
    queryConsole.closeQueryResult(tab, title);
    return;
  }
  const target = findChenDataViewTarget(tab, title);
  if (!target) return;
  guardDataViewChanges([target], () => queryConsole.closeQueryResult(tab, title));
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

function startResize() {
  resizing.value = true;
}

function handlePointerMove(event: PointerEvent) {
  if (!resizing.value) return;
  sidebarWidth.value = Math.min(420, Math.max(220, event.clientX));
}

function stopResize() {
  resizing.value = false;
}

function focus() {}

onMounted(() => {
  void session.bootstrapSession();
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopResize);
});

onBeforeUnmount(() => {
  closeAllConsoleSockets();
  workspace.closeAllTabs();
  session.cleanupSession();
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopResize);
});

defineExpose({ focus });
</script>

<template>
  <div class="h-full min-h-0 bg-[var(--workspace-surface-main)] text-[var(--app-fg)]">
    <div v-if="session.ready.value" class="flex h-full min-h-0">
      <ResourceTreePanel
        :root-nodes="tree.rootNodes.value"
        :selected-key="tree.selectedNodeKey.value"
        :expanded-keys="tree.expandedKeys.value"
        :children-map="tree.childrenMap"
        :loading-children="tree.loadingChildren"
        :db-type="auth.profile.value?.dbType"
        :width="sidebarWidth"
        @refresh="tree.refreshRoot"
        @select="tree.selectedNodeKey.value = $event.key"
        @activate="handleNodeClick"
        @toggle="tree.toggleTreeNode"
        @menu="({ node, event }) => openNodeMenu(node, event)"
      />

      <div
        class="w-1 shrink-0 cursor-col-resize bg-default/60 hover:bg-primary/40"
        @pointerdown.prevent="startResize"
      />

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceTabBar
          :tabs="workspace.workspaceTabs.value"
          :active-tab-id="workspace.activeWorkspaceTabId.value"
          @activate="workspace.setActiveTab"
          @close="closeWorkspaceTab"
          @create="createWorkspaceTab"
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
            :tab="activeQueryTab"
            :db-type="auth.profile.value?.dbType || ''"
            :can-copy="auth.profile.value?.canCopy === true"
            @run="runQueryTab"
            @cancel="cancelQueryLikeTab"
            @change-context="changeQueryContext"
            @upload-sql="uploadQuerySql"
            @data-view-action="runQueryDataViewAction"
            @dismiss-message="dismissQueryMessage"
            @update-statement="updateQueryStatement"
            @activate-result="activateQueryResult"
            @close-result="closeQueryResult"
          />

          <ConsolePanel
            v-else-if="activeConsoleTab"
            :tab="activeConsoleTab"
            :context-label="currentContextLabel"
            :prompt-label="consolePromptLabel"
            @run="runQueryTab"
            @cancel="cancelQueryLikeTab"
            @update-pending-sql="updateConsolePendingSql"
            @activate-result="activateQueryResult"
          />

          <DataViewPanel
            v-else-if="activeDataViewTab"
            :tab="activeDataViewTab"
            :db-type="auth.profile.value?.dbType"
            :protocol="props.tab.protocol"
            :can-copy="auth.profile.value?.canCopy === true"
            @data-view-action="runStandaloneDataViewAction"
            @update-panel="updateDataViewPanel"
            @update-property-tab="updateDataViewPropertyTab"
          />
        </div>

        <ChenSessionState v-else icon="i-lucide-database-zap" message="Select a database action to begin." />
      </section>
    </div>

    <ChenSessionState
      v-else
      :icon="session.error.value ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
      :loading="!session.error.value"
      :message="session.error.value || 'Starting database workspace...'"
      :action-label="session.error.value ? 'Retry' : undefined"
      @action="emit('reconnect')"
    />

    <UDropdownMenu
      v-model:open="contextMenuVisible"
      :items="contextMenuItems"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{ content: 'w-48 p-1' }"
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

    <UModal v-model:open="dialogVisible" :title="session.dialogMessage.value?.title || 'Message'">
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
        <pre v-else class="whitespace-pre-wrap break-words p-4 text-sm text-muted">{{
          session.dialogMessage.value?.text
        }}</pre>
      </template>
    </UModal>

    <DiscardDataViewChangesDialog
      v-if="discardDialogOpen"
      :open="discardDialogOpen"
      @update:open="updateDiscardDialog"
      @confirm="confirmDiscardChanges"
    />
  </div>
</template>
