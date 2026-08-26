<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";
import type { ClipboardAccess, ClipboardDirection, ClipboardPermission, ClipboardPolicy } from "#koko/types/clipboard";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  KubernetesTerminalMessageType,
  KubernetesTerminalSocketFailureCode
} from "#koko/composables/kubernetes/protocol";
import { useKubernetesTerminalSocket } from "#koko/composables/kubernetes/useKubernetesTerminalSocket";
import {
  registerKokoTerminalDataSender,
  unregisterKokoTerminalDataSender
} from "#koko/composables/useTerminalSessionRegistry";
import { KeyboardKey } from "#koko/constants/keyboard";
import {
  createUnrestrictedClipboardAccess,
  resolveClipboardAccess,
  validateClipboardText as validateClipboardAccess
} from "#koko/utils/clipboardAcl";
import { appTerminalTheme } from "#koko/utils/terminalTheme";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";
import "@xterm/xterm/css/xterm.css";

type TreeRowKind = "recent-root" | "asset-root" | "namespace" | "pod" | "container";

interface K8sNode {
  key?: string;
  label: string;
  namespace?: string;
  pod?: string;
  container?: string;
  children?: K8sNode[];
}
interface ConnectTarget {
  label: string;
  namespace: string;
  pod: string;
  container: string;
}
interface TerminalTab {
  id: string;
  label: string;
  namespace: string;
  pod: string;
  container: string;
}

interface TreeRow {
  kind: TreeRowKind;
  node: K8sNode;
  depth: number;
  expanded: boolean;
}

const props = defineProps<{ tab: KokoWorkspaceTab }>();
const emit = defineEmits<{ reconnect: [] }>();
const RECENT_CONTAINER_LIMIT = 10;
const { t } = useI18n();
const toast = useToast();
const hostAdapter = useKokoHostAdapter();
const tab = toRef(props, "tab");
const { context, error: sessionError, loading, prepareSession, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const colorMode = useColorMode();

const tree = ref<K8sNode[]>([]);
const expanded = ref(new Set<string>());
const manuallyCollapsedPods = new Set<string>();
const search = ref("");
const searchVisible = ref(false);
const recentContainers = useLocalStorage<ConnectTarget[]>(
  `jumpserver-client:kubernetes-recent-containers:${props.tab.assetId}`,
  []
);
recentContainers.value = recentContainers.value.slice(0, RECENT_CONTAINER_LIMIT);
const sidebarWidth = ref(260);
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const resourceTreeOpen = ref(true);
const resourceTreeWidth = computed(() =>
  isNarrowScreen.value ? "min(280px, calc(100vw - 3rem))" : `${sidebarWidth.value}px`
);
const resizingSidebar = ref(false);
const connectionError = ref("");
const terminalTabs = ref<TerminalTab[]>([]);
const activeTabId = ref("");
const globalTerminalId = ref("");

const terminals = new Map<string, { terminal: Terminal; fit: FitAddon; cleanupClipboard: () => void }>();
const defaultClipboardAccess = shallowRef(createUnrestrictedClipboardAccess());
const sessionClipboardAccess = new Map<string, ClipboardAccess>();
let themeObserver: MutationObserver | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizeHandle: HTMLElement | null = null;
let resizePointerId: number | null = null;
const terminalSocket = useKubernetesTerminalSocket();

const activeTab = computed(() => terminalTabs.value.find((item) => item.id === activeTabId.value) || null);
const assetName = computed(() => tab.value.assetName || t("koko.kubernetes.name"));
const resize = useDebounceFn(() => {
  if (activeTabId.value) terminals.get(activeTabId.value)?.fit.fit();
}, 80);

function tabIcon(item: TerminalTab) {
  return item.container ? "i-lucide-container" : "i-lucide-boxes";
}

const subTabs = computed(() =>
  terminalTabs.value.map((item) => ({
    id: item.id,
    label: item.label,
    icon: tabIcon(item),
    title: item.label
  }))
);

const RECENT_ROOT_KEY = "__kubernetes_recent_containers__";
const ASSET_ROOT_KEY = "__kubernetes_asset__";
expanded.value.add(RECENT_ROOT_KEY);
expanded.value.add(ASSET_ROOT_KEY);

const keyOf = (node: K8sNode) =>
  node.key || [node.namespace, node.pod, node.container, node.label].filter(Boolean).join("/");
const containerLabel = (node: K8sNode) => `${node.namespace}/${node.pod}/${node.container}`;

function parseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function canUseClipboardText(direction: ClipboardDirection, text: string, terminalTabId: string) {
  const access = sessionClipboardAccess.get(terminalTabId) || defaultClipboardAccess.value;
  const result = validateClipboardAccess(access, direction, text);
  if (result.allowed) return true;

  toast.add({
    title:
      result.reason === "text_limit"
        ? t("koko.terminal.clipboardTextLimitExceeded", {
            action: t(direction === "copy" ? "koko.actions.copy" : "koko.actions.paste"),
            limit: result.limit
          })
        : t(direction === "copy" ? "koko.terminal.clipboardCopyDenied" : "koko.terminal.clipboardPasteDenied"),
    color: "warning"
  });
  return false;
}

function installClipboardControls(el: HTMLElement, terminal: Terminal, terminalTabId: string) {
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (canUseClipboardText("paste", text, terminalTabId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onCopy = (event: ClipboardEvent) => {
    const text = terminal.getSelection();
    if (!text || canUseClipboardText("copy", text, terminalTabId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  el.addEventListener("paste", onPaste, true);
  el.addEventListener("copy", onCopy, true);
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.key === KeyboardKey.Enter && event.isComposing) return false;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.C && terminal.hasSelection())
      return false;
    return !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.V);
  });

  return () => {
    el.removeEventListener("paste", onPaste, true);
    el.removeEventListener("copy", onCopy, true);
  };
}

function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  if (!searchVisible.value) search.value = "";
}

function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0 || isNarrowScreen.value) return;

  event.preventDefault();
  resizingSidebar.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = sidebarWidth.value;
  resizeHandle = event.currentTarget as HTMLElement;
  resizePointerId = event.pointerId;
  resizeHandle.setPointerCapture(event.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function resizeSidebar(event: PointerEvent) {
  if (!resizingSidebar.value) return;
  sidebarWidth.value = Math.min(420, Math.max(220, resizeStartWidth + event.clientX - resizeStartX));
  resize();
}

function stopSidebarResize() {
  if (!resizingSidebar.value) return;

  resizingSidebar.value = false;
  if (resizeHandle && resizePointerId !== null && resizeHandle.hasPointerCapture(resizePointerId)) {
    resizeHandle.releasePointerCapture(resizePointerId);
  }
  resizeHandle = null;
  resizePointerId = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function toggleRow(row: TreeRow) {
  const key = keyOf(row.node);
  if (expanded.value.has(key)) {
    expanded.value.delete(key);
    if (row.kind === "pod") manuallyCollapsedPods.add(key);
    return;
  }

  expanded.value.add(key);
  if (row.kind === "pod") manuallyCollapsedPods.delete(key);
  if (row.kind !== "namespace") return;

  for (const pod of row.node.children || []) {
    const podKey = keyOf(pod);
    if (pod.children?.length === 1 && !manuallyCollapsedPods.has(podKey)) {
      expanded.value.add(podKey);
    }
  }
}

function normalizeTree(raw: Record<string, any>): K8sNode[] {
  return Object.entries(raw)
    .map(([namespace, value]) => ({
      label: namespace,
      namespace,
      children: (value.pods || []).map((pod: any) => ({
        label: pod.name,
        namespace,
        pod: pod.name,
        children: (pod.containers || []).map((container: any) => ({
          label: container.name,
          namespace,
          pod: pod.name,
          container: container.name
        }))
      }))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
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

  const recentRoot: K8sNode = {
    key: RECENT_ROOT_KEY,
    label: t("koko.kubernetes.recentContainers"),
    children: recentContainers.value.map((container) => ({
      ...container,
      key: `recent:${container.namespace}/${container.pod}/${container.container}`
    }))
  };
  const assetRoot: K8sNode = { key: ASSET_ROOT_KEY, label: assetName.value, children: tree.value };

  const recentExpanded = expanded.value.has(RECENT_ROOT_KEY);
  rows.push({ kind: "recent-root", node: recentRoot, depth: 0, expanded: recentExpanded });
  if (recentExpanded) {
    for (const container of recentRoot.children || []) {
      rows.push({ kind: "container", node: container, depth: 1, expanded: false });
    }
  }

  const assetExpanded = expanded.value.has(ASSET_ROOT_KEY);
  rows.push({ kind: "asset-root", node: assetRoot, depth: 0, expanded: assetExpanded });
  if (!assetExpanded) return rows;

  for (const namespace of tree.value) {
    const nsExpanded = expanded.value.has(keyOf(namespace));
    rows.push({ kind: "namespace", node: namespace, depth: 1, expanded: nsExpanded });
    if (!nsExpanded) continue;
    for (const pod of namespace.children || []) {
      const podExpanded = expanded.value.has(keyOf(pod));
      rows.push({ kind: "pod", node: pod, depth: 2, expanded: podExpanded });
      if (!podExpanded) continue;
      for (const container of pod.children || []) {
        rows.push({ kind: "container", node: container, depth: 3, expanded: false });
      }
    }
  }
  return rows;
});

function rowIcon(row: TreeRow) {
  if (row.kind === "recent-root") return "i-lucide-history";
  if (row.kind === "namespace") return row.expanded ? "i-lucide-folder-open" : "i-lucide-folder";
  if (row.kind === "pod") return "i-lucide-box";
  return "i-lucide-container";
}

function handleRowClick(row: TreeRow) {
  if (row.kind === "container") {
    openTerminal({
      label: containerLabel(row.node),
      namespace: row.node.namespace || "",
      pod: row.node.pod || "",
      container: row.node.container || ""
    });
    if (isNarrowScreen.value) resourceTreeOpen.value = false;
    return;
  }
  toggleRow(row);
}

function isRowActive(row: TreeRow) {
  if (row.kind !== "container" || !activeTab.value) return false;
  return (
    activeTab.value.namespace === row.node.namespace &&
    activeTab.value.pod === row.node.pod &&
    activeTab.value.container === row.node.container
  );
}

function sendResize(tabId: string, terminal: Terminal) {
  if (!terminalSocket.connected.value || !globalTerminalId.value) return;
  terminalSocket.resizeTerminal(globalTerminalId.value, tabId, terminal.cols, terminal.rows);
}

function mountTerminal(tabItem: TerminalTab, target: ConnectTarget) {
  const el = document.getElementById(tabItem.id);
  if (!el || !terminalSocket.connected.value || !globalTerminalId.value) return;

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: hostAdapter.theme.codeFontSize(),
    theme: appTerminalTheme()
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(el);
  fit.fit();
  const cleanupClipboard = installClipboardControls(el, terminal, tabItem.id);
  terminals.set(tabItem.id, { terminal, fit, cleanupClipboard });

  terminal.onData((data) => {
    if (!globalTerminalId.value) return;
    terminalSocket.sendTerminalData(globalTerminalId.value, tabItem.id, target, data);
  });
  terminal.onResize(() => sendResize(tabItem.id, terminal));

  terminalSocket.initializeTerminal(
    globalTerminalId.value,
    tabItem.id,
    target,
    JSON.stringify({ cols: terminal.cols, rows: terminal.rows, code: "" })
  );

  if (activeTabId.value === tabItem.id) terminal.focus();
}

function openTerminal(target: ConnectTarget) {
  if (!terminalSocket.connected.value || !globalTerminalId.value) return;

  if (target.container) {
    recentContainers.value = [
      target,
      ...recentContainers.value.filter(
        (item) => item.namespace !== target.namespace || item.pod !== target.pod || item.container !== target.container
      )
    ].slice(0, RECENT_CONTAINER_LIMIT);
  }

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

function clearRecentContainers() {
  recentContainers.value = [];
}

function connectCluster() {
  openTerminal({ label: assetName.value, namespace: "", pod: "", container: "" });
  if (isNarrowScreen.value) resourceTreeOpen.value = false;
}

function sendVirtualKeyboardData(data: string) {
  const item = activeTab.value;
  if (!item || !terminalSocket.connected.value || !globalTerminalId.value) return false;
  terminalSocket.sendTerminalData(globalTerminalId.value, item.id, item, data);
  return true;
}

function closeTab(tabItem: TerminalTab) {
  if (terminalSocket.connected.value && globalTerminalId.value) {
    terminalSocket.closeTerminal(globalTerminalId.value, tabItem.id);
  }
  terminals.get(tabItem.id)?.cleanupClipboard();
  terminals.get(tabItem.id)?.terminal.dispose();
  terminals.delete(tabItem.id);
  sessionClipboardAccess.delete(tabItem.id);

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
  if (terminalSocket.connected.value) terminalSocket.requestTree();
}

function retryConnection() {
  terminalSocket.close();
  emit("reconnect");
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
    attributeFilter: ["class", "data-theme-preset", "data-terminal-theme-preset", "style"]
  });
}

const stopMessageListener = terminalSocket.onMessage((message) => {
  if (message.type === KubernetesTerminalMessageType.Connect) {
    const info = parseJson<{
      permission?: ClipboardPermission | null;
      clipboard_policy?: ClipboardPolicy | null;
    }>(message.data);
    defaultClipboardAccess.value = resolveClipboardAccess(info?.permission, info?.clipboard_policy);
    globalTerminalId.value = message.id;
    terminalSocket.requestTree();
    markSessionConnected(props.tab.id);
    connectionError.value = "";
  } else if (message.type === KubernetesTerminalMessageType.Tree) {
    tree.value = normalizeTree(JSON.parse(message.data || "{}"));
    connectionError.value = "";
    markSessionConnected(props.tab.id);
  } else if (message.type === KubernetesTerminalMessageType.Data && terminals.has(message.k8s_id)) {
    terminals.get(message.k8s_id)?.terminal.write(message.data || "");
  } else if (message.type === KubernetesTerminalMessageType.Binary && terminals.has(message.k8s_id)) {
    const data =
      message.raw instanceof Uint8Array
        ? message.raw
        : Uint8Array.from(atob(message.raw || ""), (char) => char.charCodeAt(0));
    terminals.get(message.k8s_id)?.terminal.write(data);
  } else if (message.type === KubernetesTerminalMessageType.TerminalSession) {
    const sessionInfo = parseJson<{
      permission?: ClipboardPermission | null;
      clipboard_policy?: ClipboardPolicy | null;
    }>(message.data);
    sessionClipboardAccess.set(
      message.k8s_id,
      resolveClipboardAccess(sessionInfo?.permission, sessionInfo?.clipboard_policy)
    );
  } else if (
    message.type === KubernetesTerminalMessageType.Error ||
    message.type === KubernetesTerminalMessageType.TerminalError
  ) {
    connectionError.value = message.err || t("koko.kubernetes.connectionFailed");
  }
});

const stopFailureListener = terminalSocket.onFailure((failure) => {
  if (
    failure.code !== KubernetesTerminalSocketFailureCode.ConnectionClosed &&
    failure.code !== KubernetesTerminalSocketFailureCode.ConnectionFailed
  ) {
    console.warn(`[kubernetes] ${failure.code}`, failure.cause);
    return;
  }

  connectionError.value = t("koko.kubernetes.websocketConnectionFailed");
  markSessionFailed({
    tabId: props.tab.id,
    assetId: props.tab.assetId,
    protocol: props.tab.protocol || "",
    account: props.tab.account || ""
  });
});

watch(tokenId, () => void prepareSession(), { immediate: true });
watch(
  context,
  (ctx) => {
    if (!ctx) return;
    connectionError.value = "";
    terminalSocket.connect(ctx);
  },
  { immediate: true }
);
watch(activeTabId, () => focusActiveTerminal());
watch(() => colorMode.value, syncTerminalTheme);
watch(
  () => hostAdapter.theme.codeFontSize(),
  (size) => {
    for (const { terminal, fit } of terminals.values()) {
      terminal.options.fontSize = size;
      fit.fit();
    }
  }
);
useEventListener(window, "resize", resize);
useEventListener(window, "pointermove", resizeSidebar);
useEventListener(window, "pointerup", stopSidebarResize);
useEventListener(window, "pointercancel", stopSidebarResize);
onMounted(() => {
  observeAppTheme();
  registerKokoTerminalDataSender(props.tab.id, sendVirtualKeyboardData);
});
onUnmounted(() => {
  unregisterKokoTerminalDataSender(props.tab.id);
  stopSidebarResize();
  themeObserver?.disconnect();
  stopFailureListener();
  stopMessageListener();
  for (const { terminal, cleanupClipboard } of terminals.values()) {
    cleanupClipboard();
    terminal.dispose();
  }
  terminals.clear();
  sessionClipboardAccess.clear();
  terminalSocket.close();
});
</script>

<template>
  <BaseWorkspaceShell
    :ready="Boolean(context) && !sessionError && !connectionError"
    :loading="loading"
    :error="sessionError || connectionError"
    :loading-text="t('koko.kubernetes.preparingConnection')"
    :retry-label="t('koko.actions.retry')"
    @retry="retryConnection"
  >
    <div
      class="relative flex h-full min-h-0 bg-(--app-main-bg) text-(--app-fg)"
      :class="resizingSidebar ? 'cursor-col-resize select-none' : ''"
    >
      <aside
        v-show="!isNarrowScreen || resourceTreeOpen"
        class="z-40 flex min-h-0 shrink-0 flex-col bg-(--workspace-surface-sidebar) max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl"
        :style="{ width: resourceTreeWidth }"
      >
        <div class="flex h-9 min-w-0 shrink-0 items-center gap-1 border-b border-default px-2.5">
          <span
            class="min-w-0 flex-1 truncate px-1 text-left text-xs font-medium text-muted"
            :title="t('koko.kubernetes.name')"
          >
            {{ t("koko.kubernetes.name") }}
          </span>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            class="md:hidden"
            :aria-label="t('koko.actions.close')"
            @click="void (resourceTreeOpen = false)"
          />
          <UTooltip :text="t('koko.kubernetes.connectCluster')" :delay-duration="150">
            <button
              type="button"
              class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-(--app-hover-strong) hover:text-highlighted"
              :aria-label="t('koko.kubernetes.connectCluster')"
              @click="connectCluster"
            >
              <UIcon name="i-lucide-square-terminal" class="size-3.5" />
            </button>
          </UTooltip>
          <UTooltip :text="t('koko.actions.search')" :delay-duration="150">
            <button
              type="button"
              class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-(--app-hover-strong) hover:text-highlighted"
              :class="searchVisible ? 'bg-(--app-hover-strong) text-highlighted' : ''"
              :aria-label="t('koko.actions.search')"
              :aria-pressed="searchVisible"
              @click="toggleSearch"
            >
              <UIcon name="i-lucide-search" class="size-3.5" />
            </button>
          </UTooltip>
          <UTooltip :text="t('koko.kubernetes.refreshTree')" :delay-duration="150">
            <button
              type="button"
              class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-(--app-hover-strong) hover:text-highlighted"
              :aria-label="t('koko.kubernetes.refreshTree')"
              @click="refreshTree"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
            </button>
          </UTooltip>
        </div>
        <div
          v-if="searchVisible"
          class="shrink-0 border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-tree) p-2"
        >
          <UInput
            v-model="search"
            icon="i-lucide-search"
            size="xs"
            :placeholder="t('koko.kubernetes.filterContainers')"
            class="w-full"
          />
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
          <template v-for="row in treeRows" :key="`${row.kind}:${keyOf(row.node)}`">
            <div class="group relative">
              <button
                class="flex h-7 w-full items-center gap-1 rounded-lg pr-1 text-left text-xs text-(--app-fg) hover:bg-(--app-hover-soft)"
                :class="[
                  isRowActive(row) ? 'bg-(--app-selected-soft) text-primary' : '',
                  row.kind === 'recent-root' && recentContainers.length ? 'pr-6' : ''
                ]"
                :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
                :title="row.kind === 'container' ? containerLabel(row.node) : row.node.label"
                @click="handleRowClick(row)"
              >
                <span class="grid size-3 shrink-0 place-items-center">
                  <UIcon
                    v-if="row.kind !== 'container'"
                    name="i-lucide-chevron-right"
                    class="sidebar-icon-sm transition-transform"
                    :class="row.expanded ? 'rotate-90' : ''"
                  />
                </span>
                <img v-if="row.kind === 'asset-root'" src="/icons/kubernetes.svg" alt="" class="size-3.5 shrink-0" />
                <UIcon
                  v-else
                  :name="rowIcon(row)"
                  class="size-3.5 shrink-0"
                  :class="row.kind === 'namespace' ? 'tree-folder-icon' : ''"
                />
                <span class="min-w-0 flex-1 truncate">
                  {{ row.kind === "container" && search.trim() ? containerLabel(row.node) : row.node.label }}
                </span>
              </button>
              <button
                v-if="row.kind === 'recent-root' && recentContainers.length"
                type="button"
                class="absolute top-1 right-1 grid size-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 hover:bg-(--app-hover-strong) hover:text-highlighted focus-visible:opacity-100"
                :aria-label="t('koko.kubernetes.clearRecentContainers')"
                :title="t('koko.kubernetes.clearRecentContainers')"
                @click.stop="clearRecentContainers"
              >
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
              </button>
            </div>
          </template>
          <div v-if="search.trim() && !treeRows.length" class="px-3 py-2 text-xs text-(--app-muted)">
            {{ t("koko.kubernetes.noMatchingContainers") }}
          </div>
        </div>
      </aside>

      <button
        v-if="isNarrowScreen && resourceTreeOpen"
        type="button"
        class="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
        :aria-label="t('koko.actions.close')"
        @click="resourceTreeOpen = false"
      />

      <div
        role="separator"
        :aria-label="t('koko.kubernetes.resizeSidebar')"
        aria-orientation="vertical"
        :aria-valuenow="sidebarWidth"
        aria-valuemin="220"
        aria-valuemax="420"
        class="group relative z-20 w-px shrink-0 cursor-col-resize touch-none bg-(--workspace-surface-sub-border) hover:bg-primary/60 active:bg-primary max-md:hidden"
        @pointerdown="startSidebarResize"
      >
        <div class="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex h-9 shrink-0 items-center border-b border-default px-2 md:hidden">
          <UButton
            icon="i-lucide-panel-left"
            :label="t('koko.kubernetes.name')"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-expanded="resourceTreeOpen"
            @click="void (resourceTreeOpen = true)"
          />
        </div>
        <WorkspaceSubTabStrip
          :tabs="subTabs"
          :active-id="activeTabId"
          @select="activeTabId = $event"
          @close="
            (id) => {
              const item = terminalTabs.find((tab) => tab.id === id);
              if (item) closeTab(item);
            }
          "
        />
        <div class="relative min-h-0 flex-1 bg-(--workspace-surface-sub-panel)">
          <div
            v-for="item in terminalTabs"
            :id="item.id"
            :key="item.id"
            class="kubernetes-terminal absolute inset-0"
            :class="activeTabId === item.id ? '' : 'pointer-events-none invisible'"
          />
          <div v-if="!terminalTabs.length" class="grid h-full place-items-center p-6 text-sm text-(--app-muted)">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-square-terminal" class="size-10" />
              <span>{{ t("koko.kubernetes.empty") }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </BaseWorkspaceShell>
</template>

<style scoped>
.kubernetes-terminal {
  background: var(--terminal-background);
  --xterm-scrollbar-top: 4px;
  --xterm-scrollbar-bottom: 4px;
}

.kubernetes-terminal :deep(.terminal) {
  height: 100%;
  padding: 4px 4px 4px 12px;
}

.kubernetes-terminal :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
