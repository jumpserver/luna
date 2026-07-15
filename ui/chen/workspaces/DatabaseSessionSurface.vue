<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  ChenActionItem,
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenTreeNode,
  ChenWorkspaceTab
} from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { fetchChenActions } from "~/chen/api";
import ChenSessionState from "~/chen/components/ChenSessionState.vue";
import ConsolePanel from "~/chen/components/ConsolePanel.vue";
import DataViewPanel from "~/chen/components/DataViewPanel.vue";
import QueryConsolePanel from "~/chen/components/QueryConsolePanel.vue";
import ResourceTreePanel from "~/chen/components/ResourceTreePanel.vue";
import WorkspaceTabBar from "~/chen/components/WorkspaceTabBar.vue";
import { useChenActionMenu } from "~/chen/composables/useChenActionMenu";
import { useChenAuth } from "~/chen/composables/useChenAuth";
import { useChenDataView } from "~/chen/composables/useChenDataView";
import { useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";
import { useChenResourceTree } from "~/chen/composables/useChenResourceTree";
import { useChenSession } from "~/chen/composables/useChenSession";
import { useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { useChenWorkspaceTabs } from "~/chen/composables/useChenWorkspaceTabs";
import { formatChenDialogValue, normalizeChenDialogMessage } from "~/chen/utils/chenDialog";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const emit = defineEmits<{ reconnect: [] }>();

const toast = useToast();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const tabRef = toRef(props, "tab");

const sidebarWidth = ref(280);
const resizing = ref(false);

const auth = useChenAuth(tabRef);
const tree = useChenResourceTree(auth.chenToken, {
  onLoadError: (node) => {
    // Root failures propagate to the session fatal state; only per-node
    // load failures surface as a toast here.
    if (!node) return;
    toast.add({
      title: "Failed to load node",
      description: node.label || node.name || node.key,
      color: "error"
    });
  }
});
const workspace = useChenWorkspaceTabs();
const dataView = useChenDataView();
const consoleConnections = new Map<string, ReturnType<typeof useChenWebSocket>>();

const currentWorkspaceNodeKey = computed(() => {
  return tree.selectedNodeKey.value || workspace.activeWorkspaceTab.value?.nodeKey || tree.rootNodes.value[0]?.key || "";
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
const session = useChenSession({
  authenticate: auth.authenticate,
  markConnected: () => markSessionConnected(props.tab.id),
  markFailed: () => markSessionFailed({
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
  }
});

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
  if (connection?.sendWhenReady(action)) return;

  tab.connectionError ||= "Console websocket is not connected";
  queryConsole.appendLog(tab, tab.connectionError);
}

function handleConsolePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  if (tab.kind === "query" || tab.kind === "console") {
    queryConsole.handleQueryConsolePacket(tab, packet);
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
    case "update_state":
      if (tab.kind === "data-view") tab.state = packet.data || {};
      break;
    case "active_console":
      if (typeof packet.data === "string") {
        const match = workspace.workspaceTabs.value.find((item) => item.title === packet.data);
        if (match) workspace.setActiveTab(match.id);
      }
      break;
    case "close":
      closeWorkspaceTab(tab.id);
      break;
    default:
      if (tab.kind === "data-view") dataView.handleDataViewConsolePacket(tab, packet);
      break;
  }
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

function closeWorkspaceTab(id: string) {
  closeConsoleSocket(id);
  workspace.closeTab(id);
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
    toast.add({
      title: "Failed to load actions",
      description: `${node.label || node.name || node.key}: ${cause instanceof Error ? cause.message : String(cause)}`,
      color: "error"
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
    toast.add({
      title: "Action failed",
      description: cause instanceof Error ? cause.message : String(cause),
      color: "error"
    });
  }
}

async function handleNodeClick(node: ChenTreeNode) {
  tree.selectedNodeKey.value = node.key;
  await applyTreeAction(node, "show");
}

async function openNodeMenu(node: ChenTreeNode, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  await openActionMenu(node, event);
}

function runQueryTab(tab: ChenQueryLikeWorkspaceTab, selectedSql = "") {
  if (tab.kind === "query") queryConsole.runQueryTab(tab, selectedSql);
  if (tab.kind === "console") queryConsole.runConsoleTab(tab);
}

function cancelQueryLikeTab(tab: ChenQueryLikeWorkspaceTab) {
  queryConsole.cancelQueryLikeTab(tab);
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
  queryConsole.closeQueryResult(tab, title);
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

function downloadDataViewCsv(tab: Parameters<typeof dataView.downloadDataViewCsv>[0]) {
  dataView.downloadDataViewCsv(tab);
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

      <div class="w-1 shrink-0 cursor-col-resize bg-default/60 hover:bg-primary/40" @pointerdown.prevent="startResize" />

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
            :context-label="currentContextLabel"
            @run="runQueryTab"
            @cancel="cancelQueryLikeTab"
            @download="downloadDataViewCsv"
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
            @download="downloadDataViewCsv"
            @update-pending-sql="updateConsolePendingSql"
            @activate-result="activateQueryResult"
          />

          <DataViewPanel
            v-else-if="activeDataViewTab"
            :tab="activeDataViewTab"
            :db-type="auth.profile.value?.dbType"
            :protocol="props.tab.protocol"
            @download="downloadDataViewCsv"
            @update-panel="updateDataViewPanel"
            @update-property-tab="updateDataViewPropertyTab"
          />
        </div>

        <ChenSessionState
          v-else
          icon="i-lucide-database-zap"
          message="Select a database action to begin."
        />
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
      @update:open="(open) => { if (!open) closeActionMenu() }"
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
        <pre v-else class="whitespace-pre-wrap break-words p-4 text-sm text-muted">{{ session.dialogMessage.value?.text }}</pre>
      </template>
    </UModal>
  </div>
</template>
