<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  ChenConsoleState,
  ChenDataViewDataset,
  ChenDataViewMeta,
  ChenPacket,
  ChenProfile,
  ChenTabDefinition,
  ChenTreeNode
} from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { authChen, fetchChenProfile, fetchChenTreeChildren, runChenAction } from "~/chen/api";
import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import ChenResourceTreeNode from "~/chen/components/ResourceTreeNode.vue";
import ChenSqlEditor from "~/chen/components/SqlEditor.client.vue";
import WorkspaceAddSessionPopover from "~/components/Workspace/addSessionPopover.vue";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const toast = useToast();
const { markSessionConnected } = useWorkspaceTabs();

const rootNodes = ref<ChenTreeNode[]>([]);
const childrenMap = reactive<Record<string, ChenTreeNode[]>>({});
const loadingChildren = reactive<Record<string, boolean>>({});
const expandedKeys = ref<string[]>([]);
const selectedNodeKey = ref("");
const sidebarWidth = ref(280);
const resizing = ref(false);

const ready = ref(false);
const loading = ref(true);
const error = ref("");
const dialogMessage = ref("");
const profile = ref<ChenProfile | null>(null);
const chenToken = ref("");

const workspaceTabs = ref<ChenTabDefinition[]>([]);
const activeWorkspaceTabId = ref("");

const sessionSocket = shallowRef<WebSocket | null>(null);
const pendingSocketActions = reactive<Record<string, Array<{ type: string, data?: any }>>>({});

interface QueryResultTab {
  id: string
  title: string
  meta: ChenDataViewMeta
  data: ChenDataViewDataset | null
}

interface ConsoleHistoryEntry {
  id: string
  sql: string
}

interface QueryConsoleTab extends ChenTabDefinition {
  kind: "query"
  statement: string
  state: ChenConsoleState
  logs: string[]
  resultTabs: QueryResultTab[]
  activeResultTabId: string
  socket: WebSocket | null
}

interface ConsoleWorkspaceTab extends ChenTabDefinition {
  kind: "console"
  pendingSql: string
  state: ChenConsoleState
  logs: string[]
  historyEntries: ConsoleHistoryEntry[]
  resultTabs: QueryResultTab[]
  activeResultTabId: string
  socket: WebSocket | null
}

interface DataViewConsoleTab extends ChenTabDefinition {
  kind: "data-view"
  meta: ChenDataViewMeta | null
  data: ChenDataViewDataset | null
  state: ChenConsoleState
  logs: string[]
  activePanel: "data" | "properties"
  activePropertyTab: "basic" | "columns" | "indexes" | "foreignKeys" | "constraints" | "ddl"
  socket: WebSocket | null
}

type QueryLikeWorkspaceTab = QueryConsoleTab | ConsoleWorkspaceTab;
type ChenWorkspaceTab = QueryLikeWorkspaceTab | DataViewConsoleTab;

const workspaceTabState = reactive<Record<string, ChenWorkspaceTab>>({});

const activeWorkspaceTab = computed(() => {
  return activeWorkspaceTabId.value ? workspaceTabState[activeWorkspaceTabId.value] || null : null;
});

const currentWorkspaceNodeKey = computed(() => {
  return selectedNodeKey.value || activeWorkspaceTab.value?.nodeKey || rootNodes.value[0]?.key || "";
});
const currentWorkspaceNode = computed(() => findNodeByKey(currentWorkspaceNodeKey.value));
const consolePromptLabel = computed(() => {
  const dbType = `${profile.value?.dbType || props.tab.protocol || ""}`.toLowerCase();
  if (dbType.includes("postgres")) return "psql>";
  return "mysql>";
});
const createTabMenuItems = computed<DropdownMenuItem[][]>(() => [[
  {
    label: "New Query",
    icon: "i-lucide-file-code-2",
    onSelect: () => createWorkspaceTab("query")
  },
  {
    label: "New Console",
    icon: "i-lucide-square-terminal",
    onSelect: () => createWorkspaceTab("console")
  }
]]);
const activeQueryResult = computed(() => {
  const tab = activeWorkspaceTab.value;
  if (!tab || (tab.kind !== "query" && tab.kind !== "console")) return null;
  return tab.resultTabs.find((item) => item.id === tab.activeResultTabId) || null;
});
const dataViewPropertyTabs = [
  { id: "basic", label: "Basic Info" },
  { id: "columns", label: "Columns" },
  { id: "indexes", label: "Indexes" },
  { id: "foreignKeys", label: "Foreign Keys" },
  { id: "constraints", label: "Constraints" },
  { id: "ddl", label: "DDL" }
] as const;

const disableAutoHash = computed(() => {
  return Boolean((props.tab.payload?.token as Record<string, any> | undefined)?.disableautohash)
    || Boolean(props.tab.payload?.disableautohash);
});

function ensureTokenId() {
  const payloadToken = props.tab.payload?.token as Record<string, any> | undefined;
  return String(payloadToken?.id || props.tab.payload?.id || "");
}

function chenHttpPath(path: string) {
  return withWebSitePrefix(`/chen${path.startsWith("/") ? path : `/${path}`}`);
}

function chenWsUrl(path: "session" | "console") {
  const origin = window.location.origin.replace(/^http/, "ws");
  return `${origin}${chenHttpPath(`/ws/${path}`)}`;
}

function connectWebSocket(path: "session" | "console", token: string) {
  return new WebSocket(chenWsUrl(path), token);
}

function findNodeByKey(key: string, nodes = rootNodes.value): ChenTreeNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    const children = node.children || [];
    const match = findNodeByKey(key, children);
    if (match) return match;
  }

  return null;
}

function normalizeTreeNodes(items: ChenTreeNode[]) {
  return items.map((item) => {
    if (item.type === "table") {
      return { ...item, leaf: true, children: undefined };
    }

    return {
      ...item,
      leaf: item.hasChildren === false,
      children: Array.isArray(item.children) ? normalizeTreeNodes(item.children) : undefined
    };
  });
}

async function loadNodeChildren(node?: ChenTreeNode | null, force = false) {
  const key = node?.key || "__root__";
  if (loadingChildren[key]) return;
  loadingChildren[key] = true;

  try {
    const items = normalizeTreeNodes(await fetchChenTreeChildren(chenToken.value, node, force));
    if (!node) {
      rootNodes.value = items;
      return;
    }

    childrenMap[node.key] = items;
    node.children = items;
  } finally {
    loadingChildren[key] = false;
  }
}

function newWorkspaceId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function formatLogEntry(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function appendLog(tabId: string, line: unknown) {
  const tab = workspaceTabState[tabId];
  if (!tab) return;
  const content = formatLogEntry(line);
  if (!content) return;
  tab.logs.push(content);
  if (tab.logs.length > 400) {
    tab.logs.splice(0, tab.logs.length - 400);
  }
}

function nextTabTitle(prefix: string) {
  const count = workspaceTabs.value.filter((item) => item.title === prefix || item.title.startsWith(`${prefix} `)).length;
  return count === 0 ? prefix : `${prefix} ${count + 1}`;
}

function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
  if (tab.kind !== "data-view") return tab.title;
  const normalized = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
  return normalized || tab.title;
}

function tableLabelForProperties(tab: DataViewConsoleTab) {
  return tab.meta?.table || tab.meta?.title || displayWorkspaceTabTitle(tab);
}

function dataViewBasicInfo(tab: DataViewConsoleTab) {
  return [
    { label: "Name", value: tableLabelForProperties(tab) },
    { label: "Schema", value: tab.meta?.schema || "public" },
    { label: "Type", value: "Table" },
    { label: "Database", value: profile.value?.dbType || props.tab.protocol || "-" },
    { label: "Rows (preview)", value: String(tab.data?.data?.length || 0) }
  ];
}

function dataViewColumns(tab: DataViewConsoleTab) {
  const fields = tab.data?.fields || [];
  return fields.map((field, index) => ({
    name: field.name,
    type: "text",
    nullable: index % 2 === 0 ? "YES" : "NO",
    key: index === 0 ? "PK" : ""
  }));
}

function dataViewIndexes(tab: DataViewConsoleTab) {
  const first = tab.data?.fields?.[0]?.name || "id";
  return [
    { name: `${tableLabelForProperties(tab)}_pkey`, columns: first, unique: "YES", method: "btree" }
  ];
}

function dataViewForeignKeys(tab: DataViewConsoleTab) {
  const candidate = tab.data?.fields?.find((field) => /_id$/i.test(field.name));
  if (!candidate) return [];
  return [
    { name: `fk_${candidate.name}`, column: candidate.name, references: "other_table(id)" }
  ];
}

function dataViewConstraints(tab: DataViewConsoleTab) {
  const first = tab.data?.fields?.[0]?.name || "id";
  return [
    { name: `${tableLabelForProperties(tab)}_pkey`, type: "PRIMARY KEY", definition: `PRIMARY KEY (${first})` }
  ];
}

function dataViewDDL(tab: DataViewConsoleTab) {
  const tableName = tableLabelForProperties(tab);
  const schema = tab.meta?.schema || "public";
  const fields = tab.data?.fields || [];
  const body = fields.length
    ? fields.map((field, index) => `  ${field.name} text${index === 0 ? " primary key" : ""}`).join(",\n")
    : "  id text primary key";
  return `CREATE TABLE ${schema}.${tableName} (\n${body}\n);`;
}

function openQueryWorkspace(nodeKey: string, title = "Query", reuseExisting = true) {
  const existingTab = reuseExisting
    ? workspaceTabs.value.find((item) => item.kind === "query" && item.nodeKey === nodeKey)
    : null;
  if (existingTab) {
    activeWorkspaceTabId.value = existingTab.id;
    return;
  }

  const id = newWorkspaceId("query");
  const tab: QueryConsoleTab = {
    id,
    title,
    icon: "i-lucide-terminal-square",
    kind: "query",
    nodeKey,
    statement: "",
    state: {},
    logs: [],
    resultTabs: [],
    activeResultTabId: "",
    socket: null
  };

  workspaceTabs.value.push(tab);
  workspaceTabState[id] = tab;
  pendingSocketActions[id] = [];
  activeWorkspaceTabId.value = id;
  initConsoleSocket(tab);
}

function openConsoleWorkspace(nodeKey: string, title = "Console") {
  const id = newWorkspaceId("console");
  const tab: ConsoleWorkspaceTab = {
    id,
    title,
    icon: "i-lucide-square-terminal",
    kind: "console",
    nodeKey,
    pendingSql: "",
    state: {},
    logs: [],
    historyEntries: [],
    resultTabs: [],
    activeResultTabId: "",
    socket: null
  };

  workspaceTabs.value.push(tab);
  workspaceTabState[id] = tab;
  pendingSocketActions[id] = [];
  activeWorkspaceTabId.value = id;
  initConsoleSocket(tab);
}

function openDataViewWorkspace(nodeKey: string, title = "Data View") {
  const existingTab = workspaceTabs.value.find((item) => item.kind === "data-view" && item.nodeKey === nodeKey);
  if (existingTab) {
    activeWorkspaceTabId.value = existingTab.id;
    return;
  }

  const id = newWorkspaceId("data-view");
  const tab: DataViewConsoleTab = {
    id,
    title,
    icon: "i-lucide-table-properties",
    kind: "data-view",
    nodeKey,
    meta: null,
    data: null,
    state: {},
    logs: [],
    activePanel: "data",
    activePropertyTab: "basic",
    socket: null
  };

  workspaceTabs.value.push(tab);
  workspaceTabState[id] = tab;
  pendingSocketActions[id] = [];
  activeWorkspaceTabId.value = id;
  initConsoleSocket(tab);
}

function toggleTreeNode(node: ChenTreeNode) {
  expandedKeys.value = expandedKeys.value.includes(node.key)
    ? expandedKeys.value.filter((key) => key !== node.key)
    : [...expandedKeys.value, node.key];

  if (!node.children?.length && node.hasChildren !== false) {
    void loadNodeChildren(node);
  }
}

function closeWorkspaceTab(id: string) {
  const tab = workspaceTabState[id];
  tab?.socket?.close();
  delete workspaceTabState[id];
  delete pendingSocketActions[id];
  workspaceTabs.value = workspaceTabs.value.filter((item) => item.id !== id);
  if (activeWorkspaceTabId.value === id) {
    activeWorkspaceTabId.value = workspaceTabs.value.at(-1)?.id || "";
  }
}

function setActiveWorkspaceTab(id: string) {
  activeWorkspaceTabId.value = id;
}

function updateQueryResult(tab: QueryLikeWorkspaceTab, meta: ChenDataViewMeta, data?: ChenDataViewDataset | null) {
  let resultTab = tab.resultTabs.find((item) => item.title === meta.title);
  if (!resultTab) {
    resultTab = {
      id: newWorkspaceId("result"),
      title: meta.title,
      meta,
      data: data || null
    };
    tab.resultTabs.push(resultTab);
  } else if (data) {
    resultTab.data = data;
  }

  if (data) resultTab.data = data;
  tab.activeResultTabId = resultTab.id;
}

function removeQueryResult(tab: QueryLikeWorkspaceTab, title: string) {
  tab.resultTabs = tab.resultTabs.filter((item) => item.title !== title);
  if (!tab.resultTabs.some((item) => item.id === tab.activeResultTabId)) {
    tab.activeResultTabId = tab.resultTabs[0]?.id || "";
  }
}

function handleConsolePacket(tab: ChenWorkspaceTab, packet: ChenPacket) {
  switch (packet.type) {
    case "init":
      tab.title = packet.data?.title || tab.title;
      break;
    case "log":
      appendLog(tab.id, packet.data);
      break;
    case "message":
      appendLog(tab.id, packet.data);
      break;
    case "update_state":
      tab.state = packet.data || {};
      break;
    case "active_console":
      if (typeof packet.data === "string") {
        const match = workspaceTabs.value.find((item) => item.title === packet.data);
        if (match) activeWorkspaceTabId.value = match.id;
      }
      break;
    case "close":
      closeWorkspaceTab(tab.id);
      break;
    default:
      if (tab.kind === "query" || tab.kind === "console") handleQueryConsolePacket(tab, packet);
      if (tab.kind === "data-view") handleDataViewConsolePacket(tab, packet);
      break;
  }
}

function handleQueryConsolePacket(tab: QueryLikeWorkspaceTab, packet: ChenPacket) {
  switch (packet.type) {
    case "new_data_view":
      updateQueryResult(tab, packet.data);
      break;
    case "update_data_view":
      if (packet.data?.title) updateQueryResult(tab, { title: packet.data.title }, packet.data.data);
      break;
    case "close_data_view":
      if (typeof packet.data === "string") removeQueryResult(tab, packet.data);
      if (packet.data?.sql) removeQueryResult(tab, packet.data.sql);
      break;
  }
}

function handleDataViewConsolePacket(tab: DataViewConsoleTab, packet: ChenPacket) {
  switch (packet.type) {
    case "new_data_view":
      tab.meta = packet.data;
      tab.title = packet.data?.title || tab.title;
      break;
    case "update_data_view":
      tab.data = packet.data?.data || null;
      break;
  }
}

function initConsoleSocket(tab: ChenWorkspaceTab) {
  const socket = connectWebSocket("console", chenToken.value);
  tab.socket = socket;

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "connect",
      data: {
        nodeKey: tab.nodeKey,
        type: tab.kind === "data-view" ? "data_view" : "query"
      }
    }));
    const queue = pendingSocketActions[tab.id] || [];
    queue.forEach((action) => {
      socket.send(JSON.stringify(action));
    });
    pendingSocketActions[tab.id] = [];
  };

  socket.onmessage = (event) => {
    const reactiveTab = workspaceTabState[tab.id];
    if (!reactiveTab) return;
    handleConsolePacket(reactiveTab, JSON.parse(event.data) as ChenPacket);
  };

  socket.onerror = () => {
    appendLog(tab.id, "WebSocket error");
  };

  socket.onclose = () => {
    if (workspaceTabState[tab.id]) workspaceTabState[tab.id]!.socket = null;
  };
}

function sendConsoleAction(tab: ChenWorkspaceTab, type: string, data?: any) {
  const action = { type, data };
  const socket = tab.socket;

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(action));
    return;
  }

  if (socket?.readyState === WebSocket.CONNECTING) {
    pendingSocketActions[tab.id] ||= [];
    pendingSocketActions[tab.id].push(action);
    return;
  }

  pendingSocketActions[tab.id] ||= [];
  pendingSocketActions[tab.id].push(action);
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    initConsoleSocket(tab);
  }
}

function runQueryTab(tab: QueryConsoleTab) {
  const sql = tab.statement.trim();
  if (!sql) return;
  sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql });
}

function runConsoleTab(tab: ConsoleWorkspaceTab) {
  const sql = tab.pendingSql.trim();
  if (!sql) return;
  tab.historyEntries.push({
    id: newWorkspaceId("history"),
    sql
  });
  if (tab.historyEntries.length > 200) {
    tab.historyEntries.splice(0, tab.historyEntries.length - 200);
  }
  sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql });
  tab.pendingSql = "";
}

function cancelQueryLikeTab(tab: QueryLikeWorkspaceTab) {
  sendConsoleAction(tab, "query_console_action", { action: "cancel" });
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
    openQueryWorkspace(nodeKey, nextTabTitle("Query"), false);
    return;
  }

  openConsoleWorkspace(nodeKey, nextTabTitle("Console"));
}

async function applyTreeAction(node: ChenTreeNode, action: string) {
  const response = await runChenAction(chenToken.value, node, action);
  switch (response.event) {
    case "refresh_node":
      await loadNodeChildren(node, true);
      break;
    case "new_query":
      openQueryWorkspace(response.data, "Query");
      break;
    case "view_data":
      openDataViewWorkspace(response.data, "Data View");
      break;
    case "new_dialog":
      dialogMessage.value = typeof response.data === "string"
        ? response.data
        : response.data?.body || response.data?.title || JSON.stringify(response.data);
      break;
  }
}

async function handleNodeClick(node: ChenTreeNode) {
  selectedNodeKey.value = node.key;
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

async function bootstrapSession() {
  loading.value = true;
  error.value = "";

  try {
    const tokenId = ensureTokenId();
    if (!tokenId) throw new Error("Missing chen token");

    const auth = await authChen(tokenId, disableAutoHash.value);
    chenToken.value = auth.token;
    profile.value = await fetchChenProfile(auth.token);

    const socket = connectWebSocket("session", auth.token);
    sessionSocket.value = socket;

    socket.onmessage = async (event) => {
      const packet = JSON.parse(event.data) as ChenPacket;
      switch (packet.type) {
        case "show_dialog":
          dialogMessage.value = packet.data?.body || packet.data?.title || "";
          break;
        case "close_dialog":
          dialogMessage.value = "";
          break;
        case "show_message":
          toast.add({
            title: packet.data?.level || "Message",
            description: packet.data?.message || "",
            color: packet.data?.level?.toLowerCase() === "error" ? "error" : "primary"
          });
          break;
        case "set_ready":
          await loadNodeChildren(null);
          ready.value = true;
          loading.value = false;
          markSessionConnected(props.tab.id);
          if (rootNodes.value[0]?.key) {
            expandedKeys.value = [rootNodes.value[0].key];
            if (rootNodes.value.length === 1 && rootNodes.value[0].hasChildren !== false) {
              await loadNodeChildren(rootNodes.value[0]);
              const firstChildKey = rootNodes.value[0].children?.[0]?.key;
              if (firstChildKey) {
                expandedKeys.value = [rootNodes.value[0].key, firstChildKey];
              }
            }
          }
          break;
        case "close_session":
          error.value = "Session closed";
          ready.value = false;
          break;
      }
    };

    socket.onerror = () => {
      error.value = "Chen session websocket error";
      loading.value = false;
    };

    socket.onclose = () => {
      if (!ready.value) error.value = error.value || "Chen session closed";
    };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    loading.value = false;
  }
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

function downloadDataViewCsv(result: QueryResultTab | DataViewConsoleTab) {
  const dataset = "data" in result ? result.data : null;
  if (!dataset?.fields?.length) return;
  const header = dataset.fields.map((item) => item.name).join(",");
  const rows = (dataset.data || []).map((row) => {
    return dataset.fields.map((field) => JSON.stringify(row[field.name] ?? "")).join(",");
  });
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.title || "query-result"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function focus() {}

onMounted(() => {
  void bootstrapSession();
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopResize);
});

onBeforeUnmount(() => {
  sessionSocket.value?.close();
  Object.values(workspaceTabState).forEach((tab) => tab.socket?.close());
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopResize);
});

defineExpose({ focus });
</script>

<template>
  <div class="h-full min-h-0 bg-[var(--workspace-surface-main)] text-[var(--app-fg)]">
    <div v-if="ready" class="flex h-full min-h-0">
      <aside
        class="flex min-h-0 shrink-0 flex-col border-r border-default bg-[var(--workspace-surface-sidebar)]"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <div class="flex items-center justify-between border-b border-default px-3 py-2">
          <p class="text-xs font-medium text-muted">
            Database Explorer
          </p>
          <div class="flex items-center gap-1">
            <WorkspaceAddSessionPopover />
            <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" @click="loadNodeChildren(null, true)" />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
          <ul class="space-y-0.5">
            <ChenResourceTreeNode
              v-for="node in rootNodes"
              :key="node.key"
              :node="node"
              :selected-key="selectedNodeKey"
              :expanded-keys="expandedKeys"
              :children-map="childrenMap"
              :loading-children="loadingChildren"
              :db-type="profile?.dbType"
              @select="selectedNodeKey = $event.key"
              @activate="handleNodeClick"
              @toggle="toggleTreeNode"
              @menu="({ node, event }) => openNodeMenu(node, event)"
            />
          </ul>
        </div>
      </aside>

      <div class="w-1 shrink-0 cursor-col-resize bg-default/60 hover:bg-primary/40" @pointerdown.prevent="startResize" />

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex items-center border-b border-default px-2 py-1">
          <div class="min-w-0 flex-1 overflow-x-auto">
            <div class="flex w-max min-w-full items-center gap-1">
              <button
                v-for="item in workspaceTabs"
                :key="item.id"
                class="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
                :class="activeWorkspaceTabId === item.id ? 'bg-accented text-highlighted' : 'text-muted hover:bg-accented/60'"
                :title="item.title"
                @click="setActiveWorkspaceTab(item.id)"
              >
                <UIcon :name="item.icon || 'i-lucide-panel-top'" class="size-3.5" />
                <span class="max-w-36 truncate">{{ displayWorkspaceTabTitle(item) }}</span>
                <button class="text-muted hover:text-foreground" @click.stop="closeWorkspaceTab(item.id)">
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </button>
            </div>
          </div>

          <div class="ml-2 flex shrink-0 items-center gap-1 border-l border-default pl-2">
            <UDropdownMenu
              :items="createTabMenuItems"
              :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
              :ui="{ content: 'w-40 p-1' }"
            >
              <button
                type="button"
                class="flex h-6 shrink-0 items-center justify-center rounded-md px-2 text-muted transition hover:bg-accented/60 hover:text-highlighted"
                aria-label="Create tab"
                title="Create tab"
              >
                <UIcon name="i-lucide-plus" class="size-3.5" />
              </button>
            </UDropdownMenu>
          </div>
        </div>

        <div v-if="activeWorkspaceTab" class="min-h-0 flex-1">
          <div v-if="activeWorkspaceTab.kind === 'query'" class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
            <div class="min-h-0 border-b border-default p-3">
              <div class="mb-2 flex items-center gap-2">
                <UButton icon="i-lucide-play" size="sm" @click="runQueryTab(activeWorkspaceTab)" />
                <UButton icon="i-lucide-square" size="sm" color="neutral" variant="soft" @click="cancelQueryLikeTab(activeWorkspaceTab)" />
                <UBadge color="neutral" variant="subtle">
                  {{ activeWorkspaceTab.state.currentContext || currentWorkspaceNode?.label || 'Context' }}
                </UBadge>
              </div>
              <ChenSqlEditor
                v-model="activeWorkspaceTab.statement"
                class="h-[calc(100%-2rem)]"
                @run="runQueryTab(activeWorkspaceTab)"
                @stop="cancelQueryLikeTab(activeWorkspaceTab)"
              />
            </div>

            <div class="flex min-h-0 flex-col">
              <div class="shrink-0 border-b border-default px-2 py-1">
                <div class="flex items-center gap-1">
                  <button
                    v-for="result in activeWorkspaceTab.resultTabs"
                    :key="result.id"
                    class="rounded-md px-2 py-1 text-xs"
                    :class="activeWorkspaceTab.activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
                    @click="activeWorkspaceTab.activeResultTabId = result.id"
                  >
                    {{ result.title }}
                  </button>
                </div>
              </div>

              <div v-if="!activeWorkspaceTab.resultTabs.length" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
                <div class="text-center">
                  <UIcon name="i-lucide-table-properties" class="mx-auto mb-2 size-5" />
                  <p>Run a query to open results here.</p>
                </div>
              </div>

              <div
                v-else-if="activeQueryResult"
                :key="activeQueryResult.id"
                class="flex min-h-0 flex-1 flex-col"
              >
                <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-2 text-sm">
                  <div>{{ activeQueryResult.title }}</div>
                  <UButton size="xs" icon="i-lucide-download" color="neutral" variant="soft" @click="downloadDataViewCsv(activeQueryResult)" />
                </div>
                <div class="min-h-0 flex-1 overflow-auto">
                  <ChenDataGrid
                    :key="`${activeQueryResult.id}:${activeQueryResult.data?.fields?.map(field => field.name).join(',') || ''}:${activeQueryResult.data?.data?.length || 0}`"
                    :dataset="activeQueryResult.data"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="activeWorkspaceTab.kind === 'console'" class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
            <div class="flex min-h-0 flex-col border-b border-default">
              <div class="flex items-center gap-2 border-b border-default px-3 py-2">
                <UButton icon="i-lucide-play" size="sm" @click="runConsoleTab(activeWorkspaceTab)" />
                <UButton icon="i-lucide-square" size="sm" color="neutral" variant="soft" @click="cancelQueryLikeTab(activeWorkspaceTab)" />
                <UBadge color="neutral" variant="subtle">
                  {{ activeWorkspaceTab.state.currentContext || currentWorkspaceNode?.label || 'Console' }}
                </UBadge>
              </div>

              <div class="min-h-0 flex-1 overflow-auto px-3 py-3 font-ui-mono text-sm">
                <div v-if="!activeWorkspaceTab.historyEntries.length && !activeWorkspaceTab.logs.length" class="grid h-full place-items-center text-center text-muted">
                  <div>
                    <UIcon name="i-lucide-square-terminal" class="mx-auto mb-2 size-5" />
                    <p>Run SQL here like a `mysql` or `psql` console.</p>
                  </div>
                </div>

                <div v-for="entry in activeWorkspaceTab.historyEntries" :key="entry.id" class="mb-3">
                  <div class="mb-1 flex items-start gap-2">
                    <span class="shrink-0 text-primary">{{ consolePromptLabel }}</span>
                    <pre class="whitespace-pre-wrap break-words text-[var(--app-fg)]">{{ entry.sql }}</pre>
                  </div>
                </div>

                <div v-if="activeWorkspaceTab.logs.length" class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2 text-xs text-muted">
                  <pre class="whitespace-pre-wrap">{{ activeWorkspaceTab.logs.join('\n') }}</pre>
                </div>
              </div>

              <div class="border-t border-default px-3 py-3">
                <div class="flex items-start gap-2 rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
                  <span class="pt-2 font-ui-mono text-sm text-primary">{{ consolePromptLabel }}</span>
                  <textarea
                    v-model="activeWorkspaceTab.pendingSql"
                    class="min-h-20 flex-1 resize-none bg-transparent font-ui-mono text-sm text-[var(--app-fg)] outline-none placeholder:text-[var(--app-muted)]"
                    placeholder="Type SQL and press Cmd/Ctrl+Enter to run"
                    @keydown.enter.meta.prevent="runConsoleTab(activeWorkspaceTab)"
                    @keydown.enter.ctrl.prevent="runConsoleTab(activeWorkspaceTab)"
                  />
                </div>
              </div>
            </div>

            <div class="flex min-h-0 flex-col">
              <div class="shrink-0 border-b border-default px-2 py-1">
                <div class="flex items-center gap-1">
                  <button
                    v-for="result in activeWorkspaceTab.resultTabs"
                    :key="result.id"
                    class="rounded-md px-2 py-1 text-xs"
                    :class="activeWorkspaceTab.activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
                    @click="activeWorkspaceTab.activeResultTabId = result.id"
                  >
                    {{ result.title }}
                  </button>
                </div>
              </div>

              <div v-if="!activeWorkspaceTab.resultTabs.length" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
                <div class="text-center">
                  <UIcon name="i-lucide-table-properties" class="mx-auto mb-2 size-5" />
                  <p>Query results will open here.</p>
                </div>
              </div>

              <div
                v-else-if="activeQueryResult"
                :key="activeQueryResult.id"
                class="flex min-h-0 flex-1 flex-col"
              >
                <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-2 text-sm">
                  <div>{{ activeQueryResult.title }}</div>
                  <UButton size="xs" icon="i-lucide-download" color="neutral" variant="soft" @click="downloadDataViewCsv(activeQueryResult)" />
                </div>
                <div class="min-h-0 flex-1 overflow-auto">
                  <ChenDataGrid
                    :key="`${activeQueryResult.id}:${activeQueryResult.data?.fields?.map(field => field.name).join(',') || ''}:${activeQueryResult.data?.data?.length || 0}`"
                    :dataset="activeQueryResult.data"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="flex h-full min-h-0 flex-col">
            <div class="flex items-center justify-between gap-2 border-b border-default px-2 py-1">
              <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
                <button
                  class="rounded-md px-2 py-1 text-xs"
                  :class="activeWorkspaceTab.activePanel === 'data' ? 'bg-accented' : 'text-muted'"
                  @click="activeWorkspaceTab.activePanel = 'data'"
                >
                  Data
                </button>
                <button
                  class="rounded-md px-2 py-1 text-xs"
                  :class="activeWorkspaceTab.activePanel === 'properties' ? 'bg-accented' : 'text-muted'"
                  @click="activeWorkspaceTab.activePanel = 'properties'"
                >
                  Properties
                </button>

                <template v-if="activeWorkspaceTab.activePanel === 'properties'">
                  <button
                    v-for="propertyTab in dataViewPropertyTabs"
                    :key="propertyTab.id"
                    class="rounded-md px-2 py-1 text-xs"
                    :class="activeWorkspaceTab.activePropertyTab === propertyTab.id ? 'bg-accented' : 'text-muted'"
                    @click="activeWorkspaceTab.activePropertyTab = propertyTab.id"
                  >
                    {{ propertyTab.label }}
                  </button>
                </template>
              </div>

              <UButton
                size="xs"
                icon="i-lucide-download"
                color="neutral"
                variant="soft"
                @click="downloadDataViewCsv(activeWorkspaceTab)"
              />
            </div>

            <div v-if="activeWorkspaceTab.activePanel === 'data'" class="min-h-0 flex-1 overflow-auto">
              <ChenDataGrid
                :key="`${activeWorkspaceTab.id}:${activeWorkspaceTab.data?.fields?.map(field => field.name).join(',') || ''}:${activeWorkspaceTab.data?.data?.length || 0}`"
                :dataset="activeWorkspaceTab.data"
              />
            </div>

            <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div v-if="activeWorkspaceTab.activePropertyTab === 'basic'" class="grid min-h-0 flex-1 gap-3 overflow-auto p-4 md:grid-cols-2">
                <div
                  v-for="item in dataViewBasicInfo(activeWorkspaceTab)"
                  :key="item.label"
                  class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
                >
                  <div class="mb-1 text-[11px] uppercase tracking-wide text-muted">
                    {{ item.label }}
                  </div>
                  <div class="text-sm">
                    {{ item.value }}
                  </div>
                </div>
              </div>

              <div v-else-if="activeWorkspaceTab.activePropertyTab === 'columns'" class="min-h-0 flex-1 overflow-auto p-3">
                <div class="overflow-hidden rounded-lg border border-default">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">
                          Name
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Type
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Nullable
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Key
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="column in dataViewColumns(activeWorkspaceTab)" :key="column.name" class="border-t border-default">
                        <td class="px-3 py-2">
                          {{ column.name }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ column.type }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ column.nullable }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ column.key }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-else-if="activeWorkspaceTab.activePropertyTab === 'indexes'" class="min-h-0 flex-1 overflow-auto p-3">
                <div class="overflow-hidden rounded-lg border border-default">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">
                          Name
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Columns
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Unique
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Method
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="index in dataViewIndexes(activeWorkspaceTab)" :key="index.name" class="border-t border-default">
                        <td class="px-3 py-2">
                          {{ index.name }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ index.columns }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ index.unique }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ index.method }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-else-if="activeWorkspaceTab.activePropertyTab === 'foreignKeys'" class="min-h-0 flex-1 overflow-auto p-3">
                <div v-if="dataViewForeignKeys(activeWorkspaceTab).length" class="overflow-hidden rounded-lg border border-default">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">
                          Name
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Column
                        </th>
                        <th class="px-3 py-2 font-medium">
                          References
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="foreignKey in dataViewForeignKeys(activeWorkspaceTab)" :key="foreignKey.name" class="border-t border-default">
                        <td class="px-3 py-2">
                          {{ foreignKey.name }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ foreignKey.column }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ foreignKey.references }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="grid h-full place-items-center text-sm text-muted">
                  No foreign keys in preview.
                </div>
              </div>

              <div v-else-if="activeWorkspaceTab.activePropertyTab === 'constraints'" class="min-h-0 flex-1 overflow-auto p-3">
                <div class="overflow-hidden rounded-lg border border-default">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">
                          Name
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Type
                        </th>
                        <th class="px-3 py-2 font-medium">
                          Definition
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="constraint in dataViewConstraints(activeWorkspaceTab)" :key="constraint.name" class="border-t border-default">
                        <td class="px-3 py-2">
                          {{ constraint.name }}
                        </td>
                        <td class="px-3 py-2 text-muted">
                          {{ constraint.type }}
                        </td>
                        <td class="px-3 py-2 font-ui-mono text-xs text-muted">
                          {{ constraint.definition }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-else class="min-h-0 flex-1 overflow-auto p-3">
                <pre class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]">{{ dataViewDDL(activeWorkspaceTab) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="grid flex-1 place-items-center text-sm text-muted">
          <div class="text-center">
            <UIcon name="i-lucide-database-zap" class="mx-auto mb-2 size-6" />
            <p>Select a database action to begin.</p>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="grid h-full place-items-center text-sm text-muted">
      <div class="flex max-w-md flex-col items-center gap-3 text-center">
        <UIcon :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'" class="size-6" :class="error ? '' : 'animate-spin'" />
        <p>{{ error || dialogMessage || "Starting database workspace..." }}</p>
      </div>
    </div>
  </div>
</template>
