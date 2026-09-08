<script setup lang="ts">
import type { WebProxyOpenRequest } from "~/composables/useWebProxyManager";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { desktopWebProxy, desktopWindow } from "~/shared/desktop/bridge";

interface WebProxyState {
  label: string;
  url: string;
  title: string;
  loading: boolean;
  error: string;
  autofillPending: boolean;
  autofillStartedAt: number;
  autofillPreviewFrozen: boolean;
  interactivePending?: boolean;
  interactiveCanComplete?: boolean;
  preview?: string;
}

interface WebProxyAutofillState {
  label: string;
  status: "ready" | "filling" | "submitted" | "interactive" | "success" | "unavailable" | "error";
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
const emit = defineEmits<{ reconnect: [] }>();
const { activeTabId, markSessionConnected, tabs } = useWorkspaceTabs();
const { isMacOS } = usePlatform();
const toolbarRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();
const standaloneAssetWindow = ref(false);
const addressValue = ref("");
const loading = ref(true);
const error = ref("");
const autofillStatus = ref<WebProxyAutofillState["status"]>();
const autofillPending = ref(true);
const autofillPreviewFrozen = ref(false);
const autofillMessage = ref("正在建立安全登录会话");
const preview = ref("");
const interactivePending = ref(false);
const interactiveCanComplete = ref(false);
const verificationCollapsed = ref(false);
const verificationCompletionError = ref("");
interface VerificationFrame {
  image: string;
  width: number;
  height: number;
  revision: number;
  text?: string;
  focusLabel?: string;
  editable?: boolean;
  cursor?: string;
}
const verificationFrame = ref<VerificationFrame | null>(null);
const verificationRenderedRevision = ref<number>();
const verificationHovering = ref(false);
const actionPending = ref(false);
const verificationCursor = computed(() =>
  verificationHovering.value && verificationFrame.value?.revision === verificationRenderedRevision.value
    ? verificationFrame.value?.cursor || "default"
    : "default"
);
const verificationWaitingMessage = computed(() =>
  actionPending.value || autofillStatus.value === "submitted" ? "正在登录…" : "正在加载验证区域…"
);
const verificationInputRef = ref<HTMLTextAreaElement>();
let unlistenInteraction: (() => void) | undefined;
let dragging = false;
const waitingSeconds = ref(0);
let autofillStartedAt = Date.now();
let waitingTimer: ReturnType<typeof setInterval> | undefined;
let disposed = false;
const recordingStatus = ref<WebProxyRecordingState["status"]>();
const resizeObserver = ref<ResizeObserver>();
const overlayOpen = ref(false);
const viewLabel = `web-proxy-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
const viewCreated = ref(false);
const navigationDisabled = computed(() => !viewCreated.value || autofillPending.value || Boolean(error.value));
let viewVisible = false;
let closePromise: Promise<boolean> | undefined;
let unlistenState: (() => void) | undefined;
let unlistenAutofillState: (() => void) | undefined;
let unlistenRecordingState: (() => void) | undefined;
let overlayObserver: MutationObserver | undefined;

// Nuxt UI teleports interactive overlays into the main webview, but desktop child
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
  if (closePromise) return closePromise;
  if (!viewCreated.value) return true;
  // Stop observers and concurrent close guards from using the view while recording finishes.
  viewCreated.value = false;
  viewVisible = false;
  closePromise = (async () => {
    await desktopWebProxy.setActive(viewLabel, false).catch(() => undefined);
    await desktopWebProxy.close(viewLabel);
    return true;
  })();
  return closePromise;
}

const unregisterCloseGuard = registerWorkspaceSessionCloseGuard(props.tab.id, closeView);

const request = computed(() => props.tab.payload?.webProxy as WebProxyOpenRequest | undefined);
const safeMode = computed(() => request.value?.safeMode === true);
const ownerTabId = computed(
  () => tabs.value.find((tab) => tab.panes.some((pane) => pane.id === props.tab.id))?.id || props.tab.id
);
const autofillLabel = computed(() => {
  switch (autofillStatus.value) {
    case "ready":
      return "等待代填";
    case "filling":
      return "安全登录中";
    case "interactive":
      return "等待人工验证";
    case "submitted":
      return "已提交登录";
    case "success":
      return "登录成功";
    case "unavailable":
      return "未配置代填";
    case "error":
      return "代填失败";
    default:
      return "";
  }
});
const recordingLabel = computed(() => {
  switch (recordingStatus.value) {
    case "recording":
      return "录像中";
    case "paused":
      return "录像暂停";
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
const statusSummary = computed(() =>
  [
    error.value ? "代理连接异常" : !viewCreated.value || loading.value ? "正在连接代理" : "已通过代理连接",
    `账号代填：${autofillLabel.value || "等待状态"}`,
    recordingLabel.value || "录像准备中"
  ].join(" · ")
);

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
    !error.value &&
    !verificationCollapsed.value &&
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
  await desktopWebProxy.setActive(viewLabel, visible);
}

async function syncView() {
  const visible = shouldShowView();
  await setViewVisible(visible).catch((cause) => {
    error.value = String(cause);
  });
  if (!visible || !viewCreated.value) return;
  await desktopWebProxy.setBounds(viewLabel, viewBounds()).catch((cause) => {
    error.value = String(cause);
  });
}

function handleState(state: WebProxyState) {
  if (state.label !== viewLabel) return;
  if (state.url) addressValue.value = state.url;
  loading.value = state.loading;
  error.value = state.error;
  autofillPending.value = state.autofillPending;
  interactivePending.value = state.autofillPending && state.interactivePending === true;
  interactiveCanComplete.value = interactivePending.value && state.interactiveCanComplete === true;
  if (!state.autofillPending || state.error) verificationCollapsed.value = false;
  if (!interactivePending.value || state.error) {
    verificationFrame.value = null;
    verificationHovering.value = false;
  }
  autofillPreviewFrozen.value = state.autofillPreviewFrozen;
  autofillStartedAt = state.autofillStartedAt;
  if (state.preview) preview.value = state.preview;
  if (!state.autofillPending) {
    clearInterval(waitingTimer);
    if (!state.error) preview.value = "";
  }
  if (!state.loading && !state.error && !state.autofillPending) markSessionConnected(props.tab.id);
}

function history(direction: "back" | "forward") {
  if (navigationDisabled.value) return;
  void desktopWebProxy.history(viewLabel, direction);
}

function reload() {
  if (navigationDisabled.value) return;
  loading.value = true;
  void desktopWebProxy.reload(viewLabel);
}

async function completeVerification() {
  if (actionPending.value || !interactiveCanComplete.value || verificationCollapsed.value) return;
  actionPending.value = true;
  verificationCompletionError.value = "";
  try {
    if (!(await desktopWebProxy.completeVerification(viewLabel))) {
      verificationCompletionError.value = "暂时无法完成验证，请等待页面稳定后重试";
    }
  } catch {
    verificationCompletionError.value = "完成验证失败，请重试";
  } finally {
    actionPending.value = false;
  }
}

async function collapseVerification() {
  if (actionPending.value || !interactivePending.value) return;
  sendVerificationInput({ type: "cancel" });
  dragging = false;
  verificationCollapsed.value = true;
  verificationHovering.value = false;
  await syncView();
}

async function resumeVerification() {
  verificationCollapsed.value = false;
  await syncView();
}

async function reconnect() {
  if (actionPending.value) return;
  actionPending.value = true;
  try {
    await closeView();
    emit("reconnect");
  } catch (cause) {
    error.value = String(cause);
  } finally {
    actionPending.value = false;
  }
}

async function startRecording() {
  if (!request.value || !viewCreated.value) return;
  const bounds = viewBounds();
  try {
    await desktopWebProxy.startRecording({
      label: viewLabel,
      targetUrl: request.value.targetUrl,
      proxyUrl: request.value.proxyUrl,
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    });
  } catch {
    recordingStatus.value = "error";
  }
}

function sendVerificationInput(input: Record<string, unknown>) {
  const frame = verificationFrame.value;
  if (
    !frame ||
    verificationRenderedRevision.value !== frame.revision ||
    !autofillPending.value ||
    overlayOpen.value ||
    verificationCollapsed.value
  )
    return;
  void desktopWebProxy.interactionInput(viewLabel, { ...input, revision: frame.revision }).catch(() => undefined);
}

function verificationPointer(event: PointerEvent, type: "mouseDown" | "mouseMove" | "mouseUp") {
  if (event.isPrimary === false || event.button > 0) return;
  const image = event.currentTarget as HTMLImageElement;
  const rect = image.getBoundingClientRect();
  const frame = verificationFrame.value;
  if (!frame) return;
  if (event.type === "pointercancel") {
    sendVerificationInput({ type: "cancel" });
    dragging = false;
    verificationHovering.value = false;
    return;
  }
  // object-contain can letterbox the image when the workspace is short.
  const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  const x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
  const y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
  verificationHovering.value = x >= 0 && y >= 0 && x < 1 && y < 1;
  if (type === "mouseDown") {
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return;
    event.preventDefault();
    image.setPointerCapture(event.pointerId);
    verificationInputRef.value?.focus({ preventScroll: true });
    dragging = true;
  }
  if (x < 0 || y < 0 || x >= 1 || y >= 1) {
    if (dragging) sendVerificationInput({ type: "cancel" });
    dragging = false;
  } else {
    sendVerificationInput({ type, x, y });
  }
  if (type === "mouseUp") {
    dragging = false;
    if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
  }
}

function verificationKey(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === " " && verificationFrame.value?.editable === false) {
    event.preventDefault();
    sendVerificationInput({ type: "key", key: "Space" });
    return;
  }
  if (event.key === "Escape") {
    verificationInputRef.value?.blur();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    // Paste is handled through the local textarea's input event; browser/menu
    // shortcuts are never forwarded to the target website.
    if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v")) event.preventDefault();
    return;
  }
  if (
    [
      "Tab",
      "Enter",
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Escape"
    ].includes(event.key)
  ) {
    event.preventDefault();
    sendVerificationInput({ type: "key", key: event.key, shift: event.shiftKey });
  }
}

function verificationText(event: Event) {
  if ((event as InputEvent).isComposing) return;
  const input = event.target as HTMLTextAreaElement;
  if (input.value) sendVerificationInput({ type: "text", text: input.value.slice(0, 256) });
  input.value = "";
}

function focus() {
  if (shouldShowView()) void setViewVisible(true);
}

watch([activeTabId, ownerTabId, overlayOpen, error, verificationCollapsed], () => nextTick(syncView));

onMounted(async () => {
  if (!isDesktopRuntime()) {
    error.value = "内置 Web Proxy 仅在桌面客户端中可用";
    loading.value = false;
    return;
  }
  standaloneAssetWindow.value = desktopWindow.label().startsWith("asset-");
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
  unlistenState = await desktopWebProxy.onState<WebProxyState>(({ payload }) => {
    handleState(payload);
  });
  unlistenAutofillState = await desktopWebProxy.onAutofillState<WebProxyAutofillState>(({ payload }) => {
    if (payload.label !== viewLabel) return;
    autofillStatus.value = payload.status;
    autofillMessage.value = payload.message;
  });
  unlistenInteraction = await desktopWebProxy.onInteraction<{ label: string; frame: VerificationFrame | null }>(
    ({ payload }) => {
      if (payload.label !== viewLabel || !autofillPending.value || error.value) return;
      verificationFrame.value = payload.frame;
      if (!payload.frame) {
        dragging = false;
        verificationHovering.value = false;
      }
    }
  );
  unlistenRecordingState = await desktopWebProxy.onRecordingState<WebProxyRecordingState>(({ payload }) => {
    if (payload.label !== viewLabel) return;
    recordingStatus.value = payload.status;
  });
  if (disposed) {
    unlistenState?.();
    unlistenAutofillState?.();
    unlistenRecordingState?.();
    unlistenInteraction?.();
    return;
  }
  resizeObserver.value = new ResizeObserver(() => void syncView());
  if (contentRef.value) resizeObserver.value.observe(contentRef.value);
  document.addEventListener("visibilitychange", syncView);
  waitingTimer = setInterval(() => {
    if (autofillPending.value && !error.value)
      waitingSeconds.value = Math.max(0, Math.floor((Date.now() - autofillStartedAt) / 1000));
  }, 1000);

  await nextTick();
  if (disposed) return;
  try {
    await desktopWebProxy.create({
      label: viewLabel,
      targetUrl: request.value.targetUrl,
      proxyUrl: request.value.proxyUrl,
      tokenId: String(props.tab.payload?.id || props.tab.payload?.token?.id || ""),
      tokenValue: String(props.tab.payload?.value || props.tab.payload?.token?.value || ""),
      successSelector: request.value.successSelector,
      interactiveSelector: request.value.interactiveSelector,
      safeMode: safeMode.value,
      ...viewBounds()
    });
    viewCreated.value = true;
    if (disposed) {
      await closeView();
      return;
    }
    viewVisible = false;
    await syncView();
    requestAnimationFrame(() => void syncView());
    await startRecording();
  } catch (cause) {
    clearInterval(waitingTimer);
    loading.value = false;
    error.value = String(cause);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  clearInterval(waitingTimer);
  unregisterCloseGuard();
  unlistenState?.();
  unlistenAutofillState?.();
  unlistenRecordingState?.();
  unlistenInteraction?.();
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
      data-desktop-drag-region
      class="flex h-11 shrink-0 items-center gap-1.5 border-b border-default bg-default px-2"
      :class="isMacOS && standaloneAssetWindow ? 'pl-22' : ''"
    >
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="navigationDisabled"
        @click="history('back')"
      />
      <UButton
        icon="i-lucide-arrow-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="navigationDisabled"
        @click="history('forward')"
      />
      <UButton
        icon="i-lucide-rotate-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :loading="loading"
        :disabled="navigationDisabled"
        @click="reload"
      />
      <div class="min-w-0 flex-1">
        <UInput
          :model-value="addressValue"
          icon="i-lucide-lock-keyhole"
          size="sm"
          class="w-full"
          autocomplete="off"
          spellcheck="false"
          :disabled="navigationDisabled"
          readonly
          aria-label="地址栏只读"
          title="当前不支持手动输入地址"
        />
      </div>
      <!-- Keep the tooltip inside the toolbar, above the native desktop webview. -->
      <UTooltip
        :text="statusSummary"
        :content="{ side: 'left', sideOffset: 8, avoidCollisions: false }"
        :ui="{ content: 'h-7 max-w-none whitespace-nowrap' }"
      >
        <UButton
          icon="i-lucide-info"
          color="neutral"
          variant="ghost"
          size="sm"
          class="size-7 shrink-0 cursor-help justify-center"
          :aria-label="`会话状态：${statusSummary}`"
        />
      </UTooltip>
    </div>

    <div
      v-if="autofillPending && !error"
      class="flex min-h-10 shrink-0 items-center gap-2 border-b border-default bg-default px-3 text-xs text-muted"
    >
      <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
      <span role="status" class="min-w-0 flex-1 truncate">{{ autofillMessage }}</span>
      <span class="shrink-0 tabular-nums">已等待 {{ waitingSeconds }} 秒</span>
      <UButton
        v-if="interactiveCanComplete && !verificationCollapsed"
        size="xs"
        :loading="actionPending"
        @click="completeVerification"
      >
        完成交互
      </UButton>
      <UButton v-if="verificationCollapsed" size="xs" @click="resumeVerification">继续验证</UButton>
      <UButton
        v-if="interactivePending && !verificationCollapsed"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="actionPending"
        @click="collapseVerification"
      >
        返回
      </UButton>
    </div>

    <div ref="contentRef" class="relative min-h-0 flex-1 bg-default">
      <!-- The native view is hidden before credentials are released. The frozen
           preview lets the user see the form without exposing the filled values. -->
      <img
        v-if="preview && (!interactivePending || verificationCollapsed)"
        :src="preview"
        alt=""
        aria-hidden="true"
        draggable="false"
        class="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />
      <div
        v-if="error || (autofillPending && !interactivePending && (autofillPreviewFrozen || !viewCreated))"
        class="web-proxy-login-overlay absolute inset-0 grid place-items-center p-6 text-center"
        :aria-busy="autofillPending && !error"
      >
        <div
          class="flex max-w-lg flex-col items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-overlay)] px-6 py-5 text-sm text-[var(--app-fg)] shadow-[var(--theme-shadow-soft)]"
        >
          <UIcon
            :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
            class="size-7 text-muted"
            :class="{ 'animate-spin motion-reduce:animate-none': !error }"
          />
          <p :role="error ? 'alert' : 'status'" aria-live="polite">{{ error || autofillMessage }}</p>
          <p v-if="!error" class="text-xs text-muted">已等待 {{ waitingSeconds }} 秒</p>
          <p v-if="preview && !error" class="text-xs text-muted">安全登录期间显示页面预览</p>
          <div class="flex items-center gap-2">
            <UButton v-if="error && request" icon="i-lucide-rotate-cw" :loading="actionPending" @click="reconnect">
              重新连接
            </UButton>
          </div>
        </div>
      </div>

      <div v-if="verificationCollapsed && !error" class="absolute inset-0 grid place-items-center p-6 text-center">
        <p class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-muted" role="status">
          验证区域已收起，点击“继续验证”可恢复操作。
        </p>
      </div>
      <div
        v-if="interactivePending && !verificationCollapsed && !error"
        class="absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-3 p-4"
      >
        <p v-if="verificationCompletionError" class="shrink-0 text-xs text-error" role="alert">
          {{ verificationCompletionError }}
        </p>
        <img
          v-if="verificationFrame && !overlayOpen"
          :key="verificationFrame.revision"
          :src="verificationFrame.image"
          :width="verificationFrame.width"
          :height="verificationFrame.height"
          alt="目标网站的人工验证区域"
          draggable="false"
          class="min-h-0 max-w-full touch-none select-none object-contain"
          :style="{ cursor: verificationCursor }"
          @load="verificationRenderedRevision = verificationFrame.revision"
          @pointerenter="verificationPointer($event, 'mouseMove')"
          @pointerleave="verificationHovering = false"
          @pointerdown="verificationPointer($event, 'mouseDown')"
          @pointermove="verificationPointer($event, 'mouseMove')"
          @pointerup="verificationPointer($event, 'mouseUp')"
          @pointercancel="verificationPointer($event, 'mouseUp')"
          @contextmenu.prevent
        />
        <div v-else class="flex items-center gap-2 text-sm text-muted" role="status">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin motion-reduce:animate-none" />
          <span>{{ verificationWaitingMessage }}</span>
        </div>
        <p class="sr-only" aria-live="polite">{{ verificationFrame?.text }}</p>
        <textarea
          ref="verificationInputRef"
          class="sr-only"
          :aria-label="verificationFrame?.focusLabel || '人工验证键盘输入，按 Tab 选择验证控件，按 Escape 退出输入'"
          autocomplete="off"
          autocapitalize="off"
          :spellcheck="false"
          @keydown="verificationKey"
          @input="verificationText"
          @compositionend="(event) => nextTick(() => verificationText(event))"
        />
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

<style scoped>
.web-proxy-login-overlay {
  background: color-mix(in srgb, var(--workspace-surface-background) 35%, transparent);
}
</style>
