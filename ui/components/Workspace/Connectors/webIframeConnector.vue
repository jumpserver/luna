<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

const props = defineProps<{
  tab: WorkspaceSessionTab
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const { activeTabId, markSessionConnected, markSessionFailed } = useWorkspaceTabs();

const iframeSrc = computed(() => String(props.tab.payload?.webUrl || ""));
const frameId = `window-${props.tab.id}`;

let pingTimer: ReturnType<typeof setInterval> | null = null;
let readyTimer: ReturnType<typeof setTimeout> | null = null;

function focus() {
  iframeRef.value?.focus();
}

function postToFrame(message: Record<string, any>) {
  iframeRef.value?.contentWindow?.postMessage(message, "*");
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }
}

function startPing() {
  stopPing();

  pingTimer = setInterval(() => {
    postToFrame({
      name: "PING",
      id: frameId,
      disbaleFileManager: false
    });
  }, 500);

  readyTimer = setTimeout(() => {
    stopPing();
  }, 30000);
}

function handleIframeLoad() {
  startPing();
  focus();
}

function handleFrameMessage(event: MessageEvent) {
  if (event.source !== iframeRef.value?.contentWindow) return;
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.id && message.id !== frameId) return;

  switch (message.name) {
    case "PING":
      postToFrame({ name: "PONG", id: frameId });
      break;
    case "PONG":
      stopPing();
      markSessionConnected(props.tab.id);
      focus();
      break;
    case "CONNECTED":
      markSessionConnected(props.tab.id);
      break;
    case "CLOSE":
      markSessionFailed({
        tabId: props.tab.id,
        assetId: props.tab.assetId,
        protocol: props.tab.protocol,
        account: props.tab.account
      });
      break;
    case "CLICK":
    case "KEYEVENT":
    case "KEYBOARDEVENT":
    case "MOUSEEVENT":
    case "INPUT_ACTIVE":
      break;
  }
}

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId === props.tab.id) {
      nextTick(focus);
    }
  }
);

onMounted(() => {
  window.addEventListener("message", handleFrameMessage);
});

onBeforeUnmount(() => {
  stopPing();
  window.removeEventListener("message", handleFrameMessage);
});

defineExpose({ focus });
</script>

<template>
  <div class="h-full min-h-0 w-full" @mousedown="focus">
    <iframe
      :id="frameId"
      ref="iframeRef"
      :src="iframeSrc"
      class="h-full w-full border-0 bg-white dark:bg-zinc-950"
      allow="clipboard-read; clipboard-write"
      sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-modals"
      title="Web Connector"
      @load="handleIframeLoad"
    />
  </div>
</template>
