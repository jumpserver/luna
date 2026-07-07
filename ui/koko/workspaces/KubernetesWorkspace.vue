<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { appTerminalTheme } from "~/koko/utils/terminalTheme";
import { useBaseWorkspaceSession } from "~/koko/workspaces/useBaseWorkspaceSession";
import { toWsOrigin } from "~/shared/connectors/utils/wsQuery";
import "@xterm/xterm/css/xterm.css";

interface K8sNode { label: string, namespace?: string, pod?: string, container?: string, children?: K8sNode[] }
const props = defineProps<{ tab: WorkspaceSessionTab }>();
const tab = toRef(props, "tab");
const { error: sessionError, fetchEndpointUrl, fetchTicket, tokenId } = useBaseWorkspaceSession(tab);
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const colorMode = useColorMode();
const terminalEl = ref<HTMLElement | null>(null);
const tree = ref<K8sNode[]>([]);
const expanded = ref(new Set<string>());
const activeLabel = ref("");
const terminalId = ref("");
const k8sId = ref("");
let socket: WebSocket | null = null;
let terminal: Terminal | null = null;
let fit: FitAddon | null = null;

const keyOf = (node: K8sNode) => [node.namespace, node.pod, node.container, node.label].filter(Boolean).join("/");
const toggle = (node: K8sNode) => expanded.value.has(keyOf(node)) ? expanded.value.delete(keyOf(node)) : expanded.value.add(keyOf(node));

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

function sendResize() {
  if (!socket || !terminal || !k8sId.value) return;
  socket.send(JSON.stringify({ id: terminalId.value, k8s_id: k8sId.value, type: "TERMINAL_K8S_RESIZE", namespace: "", pod: "", container: "", resizeData: JSON.stringify({ cols: terminal.cols, rows: terminal.rows }) }));
}

function connectNode(node: K8sNode) {
  if (!node.container || !socket || !terminalId.value) return;
  activeLabel.value = `${node.namespace}/${node.pod}/${node.container}`;
  k8sId.value = globalThis.crypto?.randomUUID?.() || String(Date.now());
  terminal?.dispose();
  terminal = new Terminal({ cursorBlink: true, fontSize: 13, theme: appTerminalTheme() });
  fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(terminalEl.value!);
  fit.fit();
  terminal.onData((data) => socket?.send(JSON.stringify({ id: terminalId.value, k8s_id: k8sId.value, type: "TERMINAL_K8S_DATA", namespace: node.namespace, pod: node.pod, container: node.container, data })));
  terminal.onResize(sendResize);
  socket.send(JSON.stringify({ id: terminalId.value, k8s_id: k8sId.value, namespace: node.namespace, pod: node.pod, container: node.container, type: "TERMINAL_K8S_INIT", data: JSON.stringify({ cols: terminal.cols, rows: terminal.rows, code: "" }) }));
  terminal.focus();
}

async function prepare() {
  if (!tokenId.value) {
    sessionError.value = "Missing connection token";
    return;
  }
  try {
    const endpointUrl = await fetchEndpointUrl();
    const ticket = await fetchTicket(endpointUrl);
    const params = new URLSearchParams({ token: tokenId.value, type: "k8s" });
    if (ticket) params.set("ticket", ticket);
    socket = new WebSocket(`${toWsOrigin(endpointUrl)}/koko/ws/terminal/?${params}`, ["JMS-KOKO"]);
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "CONNECT") {
        terminalId.value = message.id;
        socket?.send(JSON.stringify({ type: "TERMINAL_K8S_TREE" }));
        markSessionConnected(props.tab.id);
      } else if (message.type === "TERMINAL_K8S_TREE") {
 tree.value = normalizeTree(JSON.parse(message.data || "{}"));
} else if (message.type === "TERMINAL_K8S_DATA" && message.k8s_id === k8sId.value) {
 terminal?.write(message.data || "");
} else if (message.type === "TERMINAL_K8S_BINARY" && message.k8s_id === k8sId.value) {
 terminal?.write(Uint8Array.from(atob(message.raw || ""), (char) => char.charCodeAt(0)));
} else if (message.type === "PING") {
 socket?.send(JSON.stringify({ id: message.id, type: "PONG", data: "pong" }));
} else if (message.type === "ERROR" || message.type === "TERMINAL_ERROR") {
 sessionError.value = message.err || "Kubernetes connection failed";
}
    };
    socket.onerror = () => {
 sessionError.value = "Kubernetes WebSocket connection failed";
};
  } catch (cause) {
    sessionError.value = String(cause);
    markSessionFailed({ tabId: props.tab.id, assetId: props.tab.assetId, protocol: props.tab.protocol, account: props.tab.account });
  }
}

const resize = useDebounceFn(() => fit?.fit(), 80);
useEventListener(window, "resize", resize);
watch(tokenId, prepare, { immediate: true });
watch(() => colorMode.value, () => {
  if (!terminal) return;
  terminal.options.theme = appTerminalTheme();
});
onUnmounted(() => {
  terminal?.dispose();
  socket?.close();
});
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-default">
    <aside class="min-h-0 overflow-auto border-r border-default p-2 text-xs">
      <div class="mb-2 flex items-center justify-between px-1 font-medium">
        <span>Kubernetes</span><UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" @click="socket?.send(JSON.stringify({ type: 'TERMINAL_K8S_TREE' }))" />
      </div>
      <div v-if="sessionError" class="p-2 text-error">
        {{ sessionError }}
      </div>
      <template v-for="namespace in tree" :key="keyOf(namespace)">
        <button class="flex w-full items-center gap-1 rounded px-1.5 py-1 hover:bg-elevated" @click="toggle(namespace)">
          <UIcon :name="expanded.has(keyOf(namespace)) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" /><UIcon name="i-lucide-folder" />{{ namespace.label }}
        </button>
        <template v-if="expanded.has(keyOf(namespace))">
          <template v-for="pod in namespace.children" :key="keyOf(pod)">
            <button class="flex w-full items-center gap-1 rounded py-1 pl-6 hover:bg-elevated" @click="toggle(pod)">
              <UIcon :name="expanded.has(keyOf(pod)) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" /><UIcon name="i-lucide-box" />{{ pod.label }}
            </button>
            <button v-for="container in expanded.has(keyOf(pod)) ? pod.children : []" :key="keyOf(container)" class="flex w-full items-center gap-1 rounded py-1 pl-11 hover:bg-elevated" @click="connectNode(container)">
              <UIcon name="i-lucide-container" />{{ container.label }}
            </button>
          </template>
        </template>
      </template>
    </aside>
    <main class="flex min-h-0 min-w-0 flex-col">
      <div class="h-8 shrink-0 border-b border-default px-3 py-1.5 text-xs text-muted">
        {{ activeLabel || "选择一个 container 建立连接" }}
      </div><div ref="terminalEl" class="min-h-0 flex-1 p-1" />
    </main>
  </div>
</template>
