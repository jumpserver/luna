<script setup lang="ts">
import type {
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenTreeNode,
  ChenWorkspaceTab
} from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import ChenSessionState from "~/chen/components/ChenSessionState.vue";
import ConsolePanel from "~/chen/components/ConsolePanel.vue";
import DataViewPanel from "~/chen/components/DataViewPanel.vue";
import QueryConsolePanel from "~/chen/components/QueryConsolePanel.vue";
import ResourceTreePanel from "~/chen/components/ResourceTreePanel.vue";
import WorkspaceTabBar from "~/chen/components/WorkspaceTabBar.vue";
import { useChenAuth } from "~/chen/composables/useChenAuth";
import { useChenDataView } from "~/chen/composables/useChenDataView";
import { useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";
import { useChenResourceTree } from "~/chen/composables/useChenResourceTree";
import { useChenSession } from "~/chen/composables/useChenSession";
import { useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { useChenWorkspaceTabs } from "~/chen/composables/useChenWorkspaceTabs";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const toast = useToast();
const { markSessionConnected } = useWorkspaceTabs();
const tabRef = toRef(props, "tab");

const sidebarWidth = ref(280);
const resizing = ref(false);

const auth = useChenAuth(tabRef);
const chenSocket = useChenWebSocket();
const tree = useChenResourceTree(auth.chenToken);
const workspace = useChenWorkspaceTabs();
const dataView = useChenDataView();

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

const queryConsole = useChenQueryConsole(sendConsoleAction);
const session = useChenSession({
  authenticate: auth.authenticate,
  connectSessionSocket: (token) => chenSocket.connectWebSocket("session", token),
  markConnected: () => markSessionConnected(props.tab.id),
  onBeforeReady: async () => {
    await tree.loadNodeChildren(null);
  },
  onAfterReady: async () => {
    await tree.expandInitialTree();
  }
});

function initConsoleSocket(tab: ChenWorkspaceTab) {
  const socket = chenSocket.connectWebSocket("console", auth.chenToken.value);
  tab.socket = socket;

  socket.onopen = () => {
    chenSocket.sendJson(socket, {
      type: "connect",
      data: {
        nodeKey: tab.nodeKey,
        type: tab.kind === "data-view" ? "data_view" : "query"
      }
    });
    chenSocket.flushQueuedActions(tab.id, socket);
  };

  socket.onmessage = (event) => {
    const reactiveTab = workspace.workspaceTabState[tab.id];
    if (!reactiveTab) return;
    handleConsolePacket(reactiveTab, JSON.parse(event.data) as ChenPacket);
  };

  socket.onerror = () => {
    queryConsole.appendLog(tab, "WebSocket error");
  };

  socket.onclose = () => {
    if (workspace.workspaceTabState[tab.id]) workspace.workspaceTabState[tab.id]!.socket = null;
  };
}

function sendConsoleAction(tab: ChenWorkspaceTab, type: string, data?: any) {
  const action = { type, data };
  const socket = tab.socket;

  if (socket?.readyState === WebSocket.OPEN) {
    chenSocket.sendJson(socket, action);
    return;
  }

  if (socket?.readyState === WebSocket.CONNECTING) {
    chenSocket.queueAction(tab.id, action);
    return;
  }

  chenSocket.queueAction(tab.id, action);
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    initConsoleSocket(tab);
  }
}

function handleConsolePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  switch (packet.type) {
    case "init":
      tab.title = packet.data?.title || tab.title;
      break;
    case "log":
      queryConsole.appendLog(tab, packet.data);
      break;
    case "message":
      queryConsole.appendLog(tab, packet.data);
      break;
    case "update_state":
      tab.state = packet.data || {};
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
      if (tab.kind === "query" || tab.kind === "console") queryConsole.handleQueryConsolePacket(tab, packet);
      if (tab.kind === "data-view") dataView.handleDataViewConsolePacket(tab, packet);
      break;
  }
}

function openQueryWorkspace(nodeKey: string, title = "Query", reuseExisting = true) {
  const tab = workspace.openQueryTab(nodeKey, title, reuseExisting);
  if (tab && !tab.socket) initConsoleSocket(tab);
}

function openConsoleWorkspace(nodeKey: string, title = "Console") {
  const tab = workspace.openConsoleTab(nodeKey, title);
  initConsoleSocket(tab);
}

function openDataViewWorkspace(nodeKey: string, title = "Data View") {
  const tab = workspace.openDataViewTab(nodeKey, title);
  if (tab && !tab.socket) initConsoleSocket(tab);
}

function closeWorkspaceTab(id: string) {
  chenSocket.clearQueue(id);
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

async function applyTreeAction(node: ChenTreeNode, action: string) {
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
      session.dialogMessage.value = typeof response.data === "string"
        ? response.data
        : response.data?.body || response.data?.title || JSON.stringify(response.data);
      break;
  }
}

async function handleNodeClick(node: ChenTreeNode) {
  tree.selectedNodeKey.value = node.key;
  if (node.type !== "table") return;
  await applyTreeAction(node, "show");
}

function openNodeMenu(node: ChenTreeNode, event: MouseEvent) {
  event.preventDefault();
  if (node.type === "table") {
    void applyTreeAction(node, "show");
    return;
  }

  toast.add({
    title: "Action unavailable",
    description: "Right-click actions will be expanded after the core Chen workspace is stable.",
    color: "neutral"
  });
}

function runQueryTab(tab: ChenQueryLikeWorkspaceTab) {
  if (tab.kind === "query") queryConsole.runQueryTab(tab);
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
  session.cleanupSession();
  workspace.workspaceTabs.value.forEach((item) => chenSocket.clearQueue(item.id));
  workspace.closeAllTabs();
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
      :message="session.error.value || session.dialogMessage.value || 'Starting database workspace...'"
    />
  </div>
</template>
