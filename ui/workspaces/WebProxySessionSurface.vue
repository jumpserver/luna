<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WebProxyOpenRequest } from "~/composables/useWebProxyManager";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

interface WebProxyState {
  label: string;
  url: string;
  title: string;
  loading: boolean;
  error: string;
}

interface WebProxyAutofillState {
  label: string;
  status: "ready" | "filling" | "submitted" | "unavailable" | "error";
  message: string;
}

interface WebProxyRecordingState {
  label: string;
  status: "recording" | "paused" | "finishing" | "finished" | "error";
  frameCount: number;
  message: string;
  path: string;
}

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { activeTabId, markSessionConnected, tabs } = useWorkspaceTabs();
const { isMacOS } = usePlatform();
const toolbarRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();
const standaloneAssetWindow = ref(false);
const addressValue = ref("");
const loading = ref(true);
const error = ref("");
const autofillStatus = ref<WebProxyAutofillState["status"]>();
const autofillMessage = ref("");
const recordingStatus = ref<WebProxyRecordingState["status"]>();
const recordingFrames = ref(0);
const recordingMessage = ref("");
const recordingPath = ref("");
const resizeObserver = ref<ResizeObserver>();
const overlayOpen = ref(false);
const viewLabel = `web-proxy-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
const devMode = import.meta.dev;
const viewCreated = ref(false);
let viewVisible = false;
let unlistenState: UnlistenFn | undefined;
let unlistenAutofillState: UnlistenFn | undefined;
let unlistenRecordingState: UnlistenFn | undefined;
let overlayObserver: MutationObserver | undefined;

// Nuxt UI teleports interactive overlays into the main webview, but Tauri child
// webviews always render above that DOM. Tooltips are intentionally excluded.
const OVERLAY_SELECTOR = [
  '[role="menu"][data-state="open"]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-reka-popper-content-wrapper] > [data-slot="content"][data-state="open"]:not([role="tooltip"])'
].join(",");

function syncOverlayState() {
  overlayOpen.value = Boolean(document.querySelector(OVERLAY_SELECTOR));
}

async function closeView() {
  if (!viewCreated.value) return true;
  await useTauriCoreInvoke("set_web_proxy_view_active", { label: viewLabel, active: false }).catch(() => undefined);
  await useTauriCoreInvoke("close_web_proxy_view", { label: viewLabel });
  viewCreated.value = false;
  viewVisible = false;
  return true;
}

const unregisterCloseGuard = registerWorkspaceSessionCloseGuard(props.tab.id, closeView);

const request = computed(() => props.tab.payload?.webProxy as WebProxyOpenRequest | undefined);
const ownerTabId = computed(
  () => tabs.value.find((tab) => tab.panes.some((pane) => pane.id === props.tab.id))?.id || props.tab.id
);
const autofillLabel = computed(() => {
  switch (autofillStatus.value) {
    case "ready":
      return "等待代填";
    case "filling":
      return "安全登录中";
    case "submitted":
      return "已触发登录";
    case "unavailable":
      return "未配置代填";
    case "error":
      return "代填失败";
    default:
      return "";
  }
});
const autofillColor = computed(() => {
  if (autofillStatus.value === "submitted") return "success";
  if (autofillStatus.value === "error") return "error";
  if (autofillStatus.value === "filling") return "warning";
  return "neutral";
});
const recordingLabel = computed(() => {
  switch (recordingStatus.value) {
    case "recording":
      return `录像中 · ${recordingFrames.value} 帧`;
    case "paused":
      return `录像暂停 · ${recordingFrames.value} 帧`;
    case "finishing":
      return "正在生成录像";
    case "finished":
      return "录像已生成";
    case "error":
      return "录像失败";
    default:
      return "";
  }
});
const recordingColor = computed(() => {
  if (recordingStatus.value === "recording") return "error";
  if (recordingStatus.value === "finished") return "success";
  if (recordingStatus.value === "error") return "warning";
  return "neutral";
});

function viewBounds() {
  const rect = contentRef.value?.getBoundingClientRect();
  const toolbarBottom = toolbarRef.value?.getBoundingClientRect().bottom || 0;
  const top = Math.max(rect?.top || 0, toolbarBottom);
  const bottom = Math.max(rect?.bottom || top + 1, top + 1);
  return {
    x: rect?.left || 0,
    y: top,
    width: Math.max(rect?.width || 1, 1),
    height: bottom - top
  };
}

function shouldShowView() {
  const rect = contentRef.value?.getBoundingClientRect();
  return Boolean(
    viewCreated.value &&
    activeTabId.value === ownerTabId.value &&
    !overlayOpen.value &&
    document.visibilityState === "visible" &&
    rect &&
    rect.width > 1 &&
    rect.height > 1
  );
}

async function setViewVisible(visible: boolean) {
  if (!viewCreated.value || viewVisible === visible) return;
  viewVisible = visible;
  await useTauriCoreInvoke("set_web_proxy_view_active", { label: viewLabel, active: visible });
}

async function syncView() {
  const visible = shouldShowView();
  await setViewVisible(visible).catch((cause) => {
    error.value = String(cause);
  });
  if (!visible) return;
  await useTauriCoreInvoke("set_web_proxy_view_bounds", { label: viewLabel, ...viewBounds() }).catch((cause) => {
    error.value = String(cause);
  });
}

function handleState(state: WebProxyState) {
  if (state.label !== viewLabel) return;
  if (state.url) addressValue.value = state.url;
  loading.value = state.loading;
  error.value = state.error;
  if (!state.loading && !state.error) markSessionConnected(props.tab.id);
}

async function navigate() {
  let targetUrl = addressValue.value.trim();
  if (!targetUrl) return;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;
  loading.value = true;
  error.value = "";
  try {
    await useTauriCoreInvoke("navigate_web_proxy_view", { label: viewLabel, targetUrl });
  } catch (cause) {
    loading.value = false;
    error.value = String(cause);
  }
}

function history(direction: "back" | "forward") {
  void useTauriCoreInvoke("history_web_proxy_view", { label: viewLabel, direction });
}

function reload() {
  loading.value = true;
  void useTauriCoreInvoke("reload_web_proxy_view", { label: viewLabel });
}

async function startRecording() {
  if (!request.value || !viewCreated.value) return;
  const bounds = viewBounds();
  try {
    await useTauriCoreInvoke("start_web_proxy_recording", {
      label: viewLabel,
      targetUrl: request.value.targetUrl,
      proxyUrl: request.value.proxyUrl,
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    });
  } catch (cause) {
    recordingStatus.value = "error";
    recordingMessage.value = String(cause);
  }
}

async function stopRecording() {
  if (!recordingStatus.value || ["finishing", "finished"].includes(recordingStatus.value)) return;
  recordingStatus.value = "finishing";
  recordingMessage.value = "正在生成 Web 录像";
  try {
    await useTauriCoreInvoke("stop_web_proxy_recording", { label: viewLabel });
  } catch (cause) {
    recordingStatus.value = "error";
    recordingMessage.value = String(cause);
  }
}

function focus() {
  if (shouldShowView()) void setViewVisible(true);
}

watch([activeTabId, ownerTabId, overlayOpen], () => nextTick(syncView));

onMounted(async () => {
  if (!isTauriRuntime()) {
    error.value = "内置 Web Proxy 仅在桌面客户端中可用";
    loading.value = false;
    return;
  }
  standaloneAssetWindow.value = useTauriWebviewWindowGetCurrentWebviewWindow().label.startsWith("asset-");
  if (!request.value) {
    error.value = "Web Proxy 会话参数不完整";
    loading.value = false;
    return;
  }

  overlayObserver = new MutationObserver(syncOverlayState);
  overlayObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-state", "role"],
    childList: true,
    subtree: true
  });
  syncOverlayState();

  addressValue.value = request.value.targetUrl;
  unlistenState = await useTauriEventListen<WebProxyState>("web-proxy-state", ({ payload }) => {
    handleState(payload);
  });
  unlistenAutofillState = await useTauriEventListen<WebProxyAutofillState>(
    "web-proxy-autofill-state",
    ({ payload }) => {
      if (payload.label !== viewLabel) return;
      autofillStatus.value = payload.status;
      autofillMessage.value = payload.message;
    }
  );
  unlistenRecordingState = await useTauriEventListen<WebProxyRecordingState>(
    "web-proxy-recording-state",
    ({ payload }) => {
      if (payload.label !== viewLabel) return;
      recordingStatus.value = payload.status;
      recordingFrames.value = payload.frameCount;
      recordingMessage.value = payload.message;
      recordingPath.value = payload.path;
    }
  );
  resizeObserver.value = new ResizeObserver(() => void syncView());
  if (contentRef.value) resizeObserver.value.observe(contentRef.value);
  document.addEventListener("visibilitychange", syncView);

  await nextTick();
  try {
    await useTauriCoreInvoke("create_web_proxy_view", {
      label: viewLabel,
      targetUrl: request.value.targetUrl,
      proxyUrl: request.value.proxyUrl,
      tokenId: String(props.tab.payload?.id || props.tab.payload?.token?.id || ""),
      tokenValue: String(props.tab.payload?.value || props.tab.payload?.token?.value || ""),
      ...viewBounds()
    });
    viewCreated.value = true;
    viewVisible = true;
    await syncView();
    requestAnimationFrame(() => void syncView());
    await startRecording();
  } catch (cause) {
    loading.value = false;
    error.value = String(cause);
  }
});

onBeforeUnmount(() => {
  unregisterCloseGuard();
  unlistenState?.();
  unlistenAutofillState?.();
  unlistenRecordingState?.();
  resizeObserver.value?.disconnect();
  overlayObserver?.disconnect();
  document.removeEventListener("visibilitychange", syncView);
  if (viewCreated.value) void closeView().catch(() => undefined);
});

defineExpose({ focus });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-default">
    <div
      ref="toolbarRef"
      data-tauri-drag-region
      class="flex h-11 shrink-0 items-center gap-1.5 border-b border-default bg-default px-2"
      :class="isMacOS && standaloneAssetWindow ? 'pl-22' : ''"
    >
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!viewCreated"
        @click="history('back')"
      />
      <UButton
        icon="i-lucide-arrow-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!viewCreated"
        @click="history('forward')"
      />
      <UButton
        icon="i-lucide-rotate-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :loading="loading"
        :disabled="!viewCreated"
        @click="reload"
      />
      <form class="min-w-0 flex-1" @submit.prevent="navigate">
        <UInput
          v-model="addressValue"
          icon="i-lucide-lock-keyhole"
          size="sm"
          class="w-full"
          autocomplete="off"
          spellcheck="false"
          :disabled="!viewCreated"
        />
      </form>
      <UBadge v-if="devMode && request" color="neutral" variant="soft" class="max-w-52 truncate">
        {{ request.proxyUrl }}
      </UBadge>
      <UTooltip v-if="autofillLabel" :text="autofillMessage">
        <UBadge :color="autofillColor" variant="soft">{{ autofillLabel }}</UBadge>
      </UTooltip>
      <UTooltip v-if="recordingLabel" :text="recordingPath || recordingMessage">
        <UButton
          :icon="recordingStatus === 'recording' ? 'i-lucide-circle-stop' : 'i-lucide-video'"
          :color="recordingColor"
          variant="soft"
          size="xs"
          :loading="recordingStatus === 'finishing'"
          :disabled="recordingStatus === 'finishing' || recordingStatus === 'finished' || recordingStatus === 'error'"
          @click="stopRecording"
        >
          {{ recordingLabel }}
        </UButton>
      </UTooltip>
      <UBadge color="primary" variant="soft">经 Koko 代理</UBadge>
    </div>

    <div ref="contentRef" class="relative min-h-0 flex-1 bg-default">
      <div v-if="error" class="absolute inset-0 grid place-items-center p-8 text-center">
        <div class="flex max-w-lg flex-col items-center gap-3 text-sm text-muted">
          <UIcon name="i-lucide-circle-alert" class="size-9" />
          <p>{{ error }}</p>
        </div>
      </div>

      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--workspace-surface-background)] transition-opacity duration-150"
        :class="overlayOpen ? 'opacity-100' : 'opacity-0'"
      >
        <div
          class="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-overlay)] px-3 py-2 text-xs text-[var(--app-muted)] shadow-[var(--theme-shadow-soft)]"
        >
          <UIcon name="i-lucide-panels-top-left" class="size-4" />
          <span>Web 会话暂时置于后台</span>
        </div>
      </div>
    </div>
  </div>
</template>
