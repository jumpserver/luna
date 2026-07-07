<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { appTerminalTheme } from "~/koko/utils/terminalTheme";
import BaseWorkspaceShell from "~/koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "~/koko/workspaces/useBaseWorkspaceSession";
import { toWsOrigin } from "~/shared/connectors/utils/wsQuery";
import "@xterm/xterm/css/xterm.css";

interface K8sNode { label: string, namespace?: string, pod?: string, container?: string, children?: K8sNode[] }
interface ConnectTarget { label: string, namespace: string, pod: string, container: string }
interface TerminalTab { id: string, label: string, namespace: string, pod: string, container: string }

type TreeRowKind = "namespace" | "pod" | "container";
interface TreeRow { kind: TreeRowKind, node: K8sNode, depth: number, expanded: boolean }

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const tab = toRef(props, "tab");
const { context, error: sessionError, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const colorMode = useColorMode();

const tree = ref<K8sNode[]>([]);
const expanded = ref(new Set<string>());
const search = ref("");
const searchVisible = ref(false);
const connectionError = ref("");
const terminalTabs = ref<TerminalTab[]>([]);
const activeTabId = ref("");
const globalTerminalId = ref("");

const terminals = new Map<string, { terminal: Terminal, fit: FitAddon }>();
let socket: WebSocket | null = null;
let themeObserver: MutationObserver | null = null;

const activeTab = computed(() => terminalTabs.value.find((item) => item.id === activeTabId.value) || null);
const assetName = computed(() => tab.value.assetName || "Kubernetes");

function tabIcon(item: TerminalTab) {
  return item.container ? "i-lucide-container" : "i-lucide-boxes";
}

const subTabs = computed(() => terminalTabs.value.map((item) => ({
  id: item.id,
  label: item.label,
  icon: tabIcon(item),
  title: item.label
})));

const keyOf = (node: K8sNode) => [node.namespace, node.pod, node.container, node.label].filter(Boolean).join("/");
const containerLabel = (node: K8sNode) => `${node.namespace}/${node.pod}/${node.container}`;

function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  if (!searchVisible.value) search.value = "";
}

function toggle(node: K8sNode) {
  const key = keyOf(node);
  if (expanded.value.has(key)) expanded.value.delete(key);
  else expanded.value.add(key);
}

function normalizeTree(raw: Record<string, any>): K8sNode[] {
  return Object.entries(raw).map(([namespace, value]) => ({
    label: namespace,
    namespace,
    children: (value.pods || []).map((pod: any) => ({
      label: pod.name,
      namespace,
      pod: pod.name,
      children: (pod.containers || []).map((container: any) => ({ label: container.name, namespace, pod: pod.name, container: container.name }))
    }))
  })).sort((a, b) => a.label.localeCompare(b.label));
}

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const query = search.value.trim().toLowerCase();

  if (query) {
    for (const namespace of tree.value) {
      for (const pod of namespace.children || []) {
        for (const container of pod.children || []) {
          const fullLabel = containerLabel(container);
          if (container.label.toLowerCase().includes(query) || fullLabel.toLowerCase().includes(query)) {
            rows.push({ kind: "container", node: container, depth: 0, expanded: false });
          }
        }
      }
    }
    return rows;
  }

  for (const namespace of tree.value) {
    const nsExpanded = expanded.value.has(keyOf(namespace));
    rows.push({ kind: "namespace", node: namespace, depth: 0, expanded: nsExpanded });
    if (!nsExpanded) continue;
    for (const pod of namespace.children || []) {
      const podExpanded = expanded.value.has(keyOf(pod));
      rows.push({ kind: "pod", node: pod, depth: 1, expanded: podExpanded });
      if (!podExpanded) continue;
      for (const container of pod.children || []) {
        rows.push({ kind: "container", node: container, depth: 2, expanded: false });
      }
    }
  }
  return rows;
});

function rowIcon(row: TreeRow) {
  if (row.kind === "namespace") return row.expanded ? "i-lucide-folder-open" : "i-lucide-folder";
  if (row.kind === "pod") return "i-lucide-box";
  return "i-lucide-container";
}

function handleRowClick(row: TreeRow) {
  if (row.kind === "container") {
    openTerminal({ label: containerLabel(row.node), namespace: row.node.namespace || "", pod: row.node.pod || "", container: row.node.container || "" });
    return;
  }
  toggle(row.node);
}

function isRowActive(row: TreeRow) {
  if (row.kind !== "container" || !activeTab.value) return false;
  return activeTab.value.namespace === row.node.namespace
    && activeTab.value.pod === row.node.pod
    && activeTab.value.container === row.node.container;
}

function sendResize(tabId: string, terminal: Terminal) {
  if (!socket || !globalTerminalId.value) return;
  socket.send(JSON.stringify({
    id: globalTerminalId.value,
    k8s_id: tabId,
    type: "TERMINAL_K8S_RESIZE",
    namespace: "",
    pod: "",
    container: "",
    resizeData: JSON.stringify({ cols: terminal.cols, rows: terminal.rows })
  }));
}

function mountTerminal(tabItem: TerminalTab, target: ConnectTarget) {
  const el = document.getElementById(tabItem.id);
  if (!el || !socket || !globalTerminalId.value) return;

  const terminal = new Terminal({ cursorBlink: true, fontSize: 13, theme: appTerminalTheme() });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(el);
  fit.fit();
  terminals.set(tabItem.id, { terminal, fit });

  terminal.onData((data) => {
    socket?.send(JSON.stringify({
      id: globalTerminalId.value,
      k8s_id: tabItem.id,
      type: "TERMINAL_K8S_DATA",
      namespace: target.namespace,
      pod: target.pod,
      container: target.container,
      data
    }));
  });
  terminal.onResize(() => sendResize(tabItem.id, terminal));

  socket.send(JSON.stringify({
    id: globalTerminalId.value,
    k8s_id: tabItem.id,
    namespace: target.namespace,
    pod: target.pod,
    container: target.container,
    type: "TERMINAL_K8S_INIT",
    data: JSON.stringify({ cols: terminal.cols, rows: terminal.rows, code: "" })
  }));

  if (activeTabId.value === tabItem.id) terminal.focus();
}

function openTerminal(target: ConnectTarget) {
  if (!socket || !globalTerminalId.value) return;

  const tabItem: TerminalTab = {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    label: target.label,
    namespace: target.namespace,
    pod: target.pod,
    container: target.container
  };
  terminalTabs.value.push(tabItem);
  activeTabId.value = tabItem.id;
  nextTick(() => mountTerminal(tabItem, target));
}

function connectCluster() {
  openTerminal({ label: assetName.value, namespace: "", pod: "", container: "" });
}

function closeTab(tabItem: TerminalTab) {
  if (socket && globalTerminalId.value) {
    socket.send(JSON.stringify({ id: globalTerminalId.value, k8s_id: tabItem.id, type: "K8S_CLOSE" }));
  }
  terminals.get(tabItem.id)?.terminal.dispose();
  terminals.delete(tabItem.id);

  const index = terminalTabs.value.findIndex((item) => item.id === tabItem.id);
  if (index === -1) return;
  terminalTabs.value.splice(index, 1);

  if (activeTabId.value === tabItem.id) {
    activeTabId.value = terminalTabs.value[Math.min(index, terminalTabs.value.length - 1)]?.id || "";
  }
}

function focusActiveTerminal() {
  nextTick(() => {
    for (const [tabId, { terminal }] of terminals) {
      if (tabId === activeTabId.value) terminal.focus();
      else terminal.blur();
    }
    terminals.get(activeTabId.value)?.fit.fit();
  });
}

function refreshTree() {
  socket?.send(JSON.stringify({ type: "TERMINAL_K8S_TREE" }));
}

function syncTerminalTheme() {
  for (const { terminal } of terminals.values()) {
    terminal.options.theme = appTerminalTheme();
  }
}

function observeAppTheme() {
  if (!import.meta.client) return;
  themeObserver = new MutationObserver(() => syncTerminalTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme-preset", "style"]
  });
}

function handleSocketMessage(event: MessageEvent) {
  const message = JSON.parse(String(event.data));
  if (message.type === "CONNECT") {
    globalTerminalId.value = message.id;
    socket?.send(JSON.stringify({ type: "TERMINAL_K8S_TREE" }));
    markSessionConnected(props.tab.id);
    connectionError.value = "";
  } else if (message.type === "TERMINAL_K8S_TREE") {
    tree.value = normalizeTree(JSON.parse(message.data || "{}"));
  } else if (message.type === "TERMINAL_K8S_DATA" && terminals.has(message.k8s_id)) {
    terminals.get(message.k8s_id)?.terminal.write(message.data || "");
  } else if (message.type === "TERMINAL_K8S_BINARY" && terminals.has(message.k8s_id)) {
    terminals.get(message.k8s_id)?.terminal.write(Uint8Array.from(atob(message.raw || ""), (char) => char.charCodeAt(0)));
  } else if (message.type === "PING") {
    socket?.send(JSON.stringify({ id: message.id, type: "PONG", data: "pong" }));
  } else if (message.type === "ERROR" || message.type === "TERMINAL_ERROR") {
    connectionError.value = message.err || "Kubernetes connection failed";
  }
}

async function startSocket(ctx: ConnectorSessionContext) {
  if (socket) return;
  connectionError.value = "";

  try {
    const params = new URLSearchParams({ token: ctx.tokenId, type: "k8s" });
    if (ctx.ticket) params.set("ticket", ctx.ticket);
    socket = new WebSocket(`${toWsOrigin(ctx.endpointUrl)}/koko/ws/terminal/?${params}`, ["JMS-KOKO"]);
    socket.onmessage = handleSocketMessage;
    socket.onerror = () => {
      connectionError.value = "Kubernetes WebSocket connection failed";
    };
  } catch (cause) {
    connectionError.value = String(cause);
    markSessionFailed({ tabId: props.tab.id, assetId: props.tab.assetId, protocol: props.tab.protocol, account: props.tab.account });
  }
}

const resize = useDebounceFn(() => {
  if (activeTabId.value) terminals.get(activeTabId.value)?.fit.fit();
}, 80);

watch(tokenId, () => void prepareSession(), { immediate: true });
watch(context, (ctx) => {
  if (ctx) void startSocket(ctx);
}, { immediate: true });
watch(activeTabId, () => focusActiveTerminal());
watch(() => colorMode.value, syncTerminalTheme);
useEventListener(window, "resize", resize);
onMounted(observeAppTheme);
onUnmounted(() => {
  themeObserver?.disconnect();
  for (const { terminal } of terminals.values()) terminal.dispose();
  terminals.clear();
  socket?.close();
});
</script>

<template>
  <BaseWorkspaceShell :ready="Boolean(context)" :loading="loading" :error="sessionError" loading-text="正在准备 Kubernetes 连接...">
    <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-[var(--app-main-bg)] text-[var(--app-fg)]">
      <aside class="flex min-h-0 flex-col border-r border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-sidebar)]">
        <div class="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-2">
          <span class="min-w-0 flex-1 truncate px-1 text-left font-ui-mono text-[10px]" :title="assetName">{{ assetName }}</span>
          <UButton icon="i-lucide-square-terminal" size="xs" color="neutral" variant="ghost" title="连接集群" @click="connectCluster" />
          <UButton icon="i-lucide-search" size="xs" color="neutral" :variant="searchVisible ? 'soft' : 'ghost'" title="搜索" @click="toggleSearch" />
          <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" title="刷新目录树" @click="refreshTree" />
        </div>
        <div v-if="searchVisible" class="shrink-0 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-tree)] p-2">
          <UInput v-model="search" icon="i-lucide-search" size="xs" placeholder="筛选 container" class="w-full" />
        </div>
        <div class="min-h-0 flex-1 overflow-auto bg-[var(--workspace-surface-sub-tree)] py-1">
          <div v-if="connectionError" class="px-3 py-2 text-xs text-error">
            {{ connectionError }}
          </div>
          <template v-for="row in treeRows" :key="`${row.kind}:${keyOf(row.node)}`">
            <button
              class="flex h-7 w-full items-center gap-1 pr-2 text-left text-xs text-[var(--app-fg)] hover:bg-[var(--app-hover-soft)]"
              :class="isRowActive(row) ? 'bg-[var(--app-selected-soft)] text-primary' : ''"
              :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
              :title="row.kind === 'container' ? containerLabel(row.node) : row.node.label"
              @click="handleRowClick(row)"
            >
              <UIcon v-if="row.kind !== 'container'" :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3 shrink-0 text-[var(--app-muted)]" />
              <span v-else class="w-3 shrink-0" />
              <UIcon :name="rowIcon(row)" class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{{ row.kind === "container" && search.trim() ? containerLabel(row.node) : row.node.label }}</span>
            </button>
          </template>
          <div v-if="!treeRows.length && !connectionError" class="px-3 py-2 text-xs text-[var(--app-muted)]">
            {{ tree.length ? "没有匹配的 container" : "加载 pod 列表中..." }}
          </div>
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col">
        <WorkspaceSubTabStrip
          :tabs="subTabs"
          :active-id="activeTabId"
          @select="activeTabId = $event"
          @close="(id) => { const item = terminalTabs.find((tab) => tab.id === id); if (item) closeTab(item); }"
        />
        <div class="relative min-h-0 flex-1 bg-[var(--workspace-surface-sub-panel)]">
          <div
            v-for="item in terminalTabs"
            :id="item.id"
            :key="item.id"
            class="absolute inset-0 p-1"
            :class="activeTabId === item.id ? '' : 'pointer-events-none invisible'"
          />
          <div v-if="!terminalTabs.length" class="grid h-full place-items-center p-6 text-sm text-[var(--app-muted)]">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-square-terminal" class="size-10" />
              <span>从左侧选择 container 或连接集群</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </BaseWorkspaceShell>
</template>
