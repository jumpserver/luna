<script setup lang="ts">
import type { KokoWorkspaceTab } from "@jumpserver/koko/host";
import type { ClipboardAccess, ClipboardDirection, ClipboardPermission, ClipboardPolicy } from "#koko/types";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  KubernetesTerminalMessageType,
  KubernetesTerminalSocketFailureCode
} from "#koko/composables/kubernetes/protocol";
import { useKubernetesTerminalSocket } from "#koko/composables/kubernetes/useKubernetesTerminalSocket";
import {
  createUnrestrictedClipboardAccess,
  resolveClipboardAccess,
  validateClipboardText as validateClipboardAccess
} from "#koko/utils/clipboardAcl";
import { appTerminalTheme } from "#koko/utils/terminalTheme";
import BaseWorkspaceShell from "#koko/workspaces/BaseWorkspaceShell.vue";
import { useBaseWorkspaceSession } from "#koko/workspaces/useBaseWorkspaceSession";
import "@xterm/xterm/css/xterm.css";

interface K8sNode {
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

type TreeRowKind = "namespace" | "pod" | "container";
interface TreeRow {
  kind: TreeRowKind;
  node: K8sNode;
  depth: number;
  expanded: boolean;
}

const props = defineProps<{ tab: KokoWorkspaceTab }>();
const { t } = useI18n();
const toast = useToast();
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

const terminals = new Map<string, { terminal: Terminal; fit: FitAddon; cleanupClipboard: () => void }>();
const defaultClipboardAccess = shallowRef(createUnrestrictedClipboardAccess());
const sessionClipboardAccess = new Map<string, ClipboardAccess>();
let themeObserver: MutationObserver | null = null;
const terminalSocket = useKubernetesTerminalSocket();

const activeTab = computed(() => terminalTabs.value.find((item) => item.id === activeTabId.value) || null);
const assetName = computed(() => tab.value.assetName || t("koko.kubernetes.name"));

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

const keyOf = (node: K8sNode) => [node.namespace, node.pod, node.container, node.label].filter(Boolean).join("/");
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
    if (event.key === "Enter" && event.isComposing) return false;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && terminal.hasSelection()) return false;
    return !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v");
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

function toggle(node: K8sNode) {
  const key = keyOf(node);
  if (expanded.value.has(key)) expanded.value.delete(key);
  else expanded.value.add(key);
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
    openTerminal({
      label: containerLabel(row.node),
      namespace: row.node.namespace || "",
      pod: row.node.pod || "",
      container: row.node.container || ""
    });
    return;
  }
  toggle(row.node);
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

  const terminal = new Terminal({ cursorBlink: true, fontSize: 13, theme: appTerminalTheme() });
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
  } else if (message.type === KubernetesTerminalMessageType.Data && terminals.has(message.k8s_id)) {
    terminals.get(message.k8s_id)?.terminal.write(message.data || "");
  } else if (message.type === KubernetesTerminalMessageType.Binary && terminals.has(message.k8s_id)) {
    terminals
      .get(message.k8s_id)
      ?.terminal.write(Uint8Array.from(atob(message.raw || ""), (char) => char.charCodeAt(0)));
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
  connectionError.value =
    failure.code === KubernetesTerminalSocketFailureCode.ConnectionClosed ||
    failure.code === KubernetesTerminalSocketFailureCode.ConnectionFailed
      ? t("koko.kubernetes.websocketConnectionFailed")
      : t("koko.kubernetes.connectionFailed");
  markSessionFailed({
    tabId: props.tab.id,
    assetId: props.tab.assetId,
    protocol: props.tab.protocol || "",
    account: props.tab.account || ""
  });
});

const resize = useDebounceFn(() => {
  if (activeTabId.value) terminals.get(activeTabId.value)?.fit.fit();
}, 80);

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
useEventListener(window, "resize", resize);
onMounted(observeAppTheme);
onUnmounted(() => {
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
    :ready="Boolean(context)"
    :loading="loading"
    :error="sessionError"
    :loading-text="t('koko.kubernetes.preparingConnection')"
  >
    <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-(--app-main-bg) text-(--app-fg)">
      <aside
        class="flex min-h-0 flex-col border-r border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-sidebar)"
      >
        <div
          class="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-header) px-2"
        >
          <span class="min-w-0 flex-1 truncate px-1 text-left font-ui-mono text-[10px]" :title="assetName">
            {{ assetName }}
          </span>
          <UButton
            icon="i-lucide-square-terminal"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="t('koko.kubernetes.connectCluster')"
            @click="connectCluster"
          />
          <UButton
            icon="i-lucide-search"
            size="xs"
            color="neutral"
            :variant="searchVisible ? 'soft' : 'ghost'"
            :title="t('koko.actions.search')"
            @click="toggleSearch"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="t('koko.kubernetes.refreshTree')"
            @click="refreshTree"
          />
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
        <div class="min-h-0 flex-1 overflow-auto bg-(--workspace-surface-sub-tree) py-1">
          <div v-if="connectionError" class="px-3 py-2 text-xs text-error">
            {{ connectionError }}
          </div>
          <template v-for="row in treeRows" :key="`${row.kind}:${keyOf(row.node)}`">
            <button
              class="flex h-7 w-full items-center gap-1 pr-2 text-left text-xs text-(--app-fg) hover:bg-(--app-hover-soft)"
              :class="isRowActive(row) ? 'bg-(--app-selected-soft) text-primary' : ''"
              :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
              :title="row.kind === 'container' ? containerLabel(row.node) : row.node.label"
              @click="handleRowClick(row)"
            >
              <UIcon
                v-if="row.kind !== 'container'"
                :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 shrink-0 text-(--app-muted)"
              />
              <span v-else class="w-3 shrink-0" />
              <UIcon :name="rowIcon(row)" class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">
                {{ row.kind === "container" && search.trim() ? containerLabel(row.node) : row.node.label }}
              </span>
            </button>
          </template>
          <div v-if="!treeRows.length && !connectionError" class="px-3 py-2 text-xs text-(--app-muted)">
            {{ tree.length ? t("koko.kubernetes.noMatchingContainers") : t("koko.kubernetes.loadingPods") }}
          </div>
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col">
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
            class="absolute inset-0 p-1"
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
