import type { ChenSocketError, ChenSocketPath } from "~/chen/composables/useChenWebSocket";
import type { ChenPacket } from "~/chen/types";

import { ref } from "vue";
import { useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { normalizeChenDialogMessage } from "~/chen/utils/chenDialog";
import { resolveChenSessionCloseFatal } from "~/chen/utils/chenSessionClose";

interface UseChenSessionOptions {
  authenticate: () => Promise<string>;
  markConnected: () => void;
  markFailed: () => void;
  onBeforeReady: () => Promise<void>;
  onAfterReady: () => Promise<void>;
  onDisconnected: () => void;
  onPacket?: (packet: ChenPacket) => void;
  showMessage: (data: any) => void;
  downloadFile?: (fileKey: string) => Promise<void>;
  createSocket?: (url: string, token: string) => WebSocket;
  resolveUrl?: (path: ChenSocketPath) => string;
  translate?: (key: string, values?: Record<string, unknown>) => string;
  readyTimeoutMs?: number;
}

export function isChenStartupFailureDialog(message: { title?: string; text?: string } | null | undefined) {
  const detail = `${message?.title || ""} ${message?.text || ""}`;
  return /连接失败|無法連線|无法连接|请求超时|請求逾時|会话已关闭|會話已關閉|connection (?:attempt )?failed|unable to connect|timed out|panel_(?:closed|expired)|session[^\n]*(?:is |was )?closed/i.test(
    detail
  );
}

function resolveChenStartupFailureMessage(
  message: { title?: string; text?: string },
  translate: (key: string) => string
) {
  const detail = message.text || message.title || "";
  if (/panel_(?:closed|expired)|session[^\n]*(?:is |was )?closed|会话已关闭|會話已關閉/i.test(detail)) {
    return translate("ConnectError.SessionClosed");
  }
  if (/\b(?:etimedout|timeout)\b|timed out|请求超时|請求逾時/i.test(detail)) {
    return translate("ConnectError.RequestTimeout");
  }
  return detail || translate("ConnectError.ConnectFailed");
}

export function useChenSession(options: UseChenSessionOptions) {
  const ready = ref(false);
  const loading = ref(true);
  const error = ref("");
  const errorReason = ref("");
  const dialogMessage = ref<ReturnType<typeof normalizeChenDialogMessage> | null>(null);
  const dialogOpenedDuringStartup = ref(false);

  let bootstrapGeneration = 0;
  let fatalNotified = false;
  let preparingReadyGeneration: number | null = null;

  const sessionConnection = useChenWebSocket({
    path: "session",
    createSocket: options.createSocket,
    resolveUrl: options.resolveUrl,
    readyTimeoutMs: options.readyTimeoutMs,
    onPacket: handlePacket,
    onError: handleSocketError
  });

  function normalizeError(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function handleFatal(cause: unknown, reason = "") {
    if (fatalNotified) return;
    fatalNotified = true;
    bootstrapGeneration += 1;
    preparingReadyGeneration = null;
    ready.value = false;
    loading.value = false;
    error.value = normalizeError(cause);
    errorReason.value = reason;
    options.markFailed();

    // A Chen session owns all of its consoles. Close dependent consoles first
    // so their backend close handlers can still resolve the active session.
    options.onDisconnected();
    sessionConnection.close();
  }

  function handleSocketError(socketError: ChenSocketError) {
    const translate = options.translate ?? ((key: string) => key);
    if (socketError.code.endsWith("_timeout")) {
      handleFatal(translate("ConnectError.RequestTimeout"));
      return;
    }
    if (socketError.code === "abnormal_close") {
      handleFatal(translate("ConnectError.SessionClosed"));
      return;
    }
    handleFatal(`${translate("Chen.WebSocketFailedPrefix")}${socketError.message}`);
  }

  async function handleSetReady() {
    if (sessionConnection.isReady.value) return;
    const currentGeneration = bootstrapGeneration;
    if (preparingReadyGeneration === currentGeneration) return;
    preparingReadyGeneration = currentGeneration;

    try {
      await options.onBeforeReady();
      if (currentGeneration !== bootstrapGeneration || fatalNotified) return;
      if (!sessionConnection.markReady()) return;

      ready.value = true;
      loading.value = false;
      options.markConnected();

      await options.onAfterReady();
    } catch (cause) {
      if (currentGeneration !== bootstrapGeneration) return;
      handleFatal(cause);
    } finally {
      if (preparingReadyGeneration === currentGeneration) preparingReadyGeneration = null;
    }
  }

  async function handleDownload(data: unknown) {
    if (typeof data !== "string" || !data) {
      options.showMessage({ level: "error", message: "Invalid Chen download file key" });
      return;
    }
    if (!options.downloadFile) return;

    try {
      await options.downloadFile(data);
    } catch (cause) {
      options.showMessage({ level: "error", message: normalizeError(cause) });
    }
  }

  function openDialog(payload: unknown) {
    dialogOpenedDuringStartup.value = !ready.value;
    const dialog = normalizeChenDialogMessage(payload);
    dialogMessage.value = dialog;
    return dialog;
  }

  function handlePacket(packet: ChenPacket) {
    switch (packet.type) {
      case "show_dialog":
        if (isChenStartupFailureDialog(openDialog(packet.data)) && !ready.value) {
          const dialog = dialogMessage.value!;
          handleFatal(new Error(resolveChenStartupFailureMessage(dialog, options.translate ?? ((key: string) => key))));
        }
        break;
      case "close_dialog":
        dialogMessage.value = null;
        dialogOpenedDuringStartup.value = false;
        break;
      case "show_message":
        options.showMessage(packet.data);
        break;
      case "download":
        void handleDownload(packet.data);
        break;
      case "set_ready":
        void handleSetReady();
        break;
      case "session_close":
      case "close_session": {
        const translate = options.translate ?? ((key: string) => key);
        const closed = resolveChenSessionCloseFatal(packet.data, translate);
        handleFatal(new Error(closed.reason ? closed.message : translate("ConnectError.SessionClosed")), closed.reason);
        break;
      }
      default:
        options.onPacket?.(packet);
    }
  }

  function sendDialogEvent(dialogId: string | null, event: string) {
    if (!dialogId || !event) return false;

    return sessionConnection.sendWhenReady({
      type: "dialog_event",
      data: { dialogId, event }
    });
  }

  function dismissDialog() {
    if (!dialogMessage.value?.showClose) return false;
    dialogMessage.value = null;
    dialogOpenedDuringStartup.value = false;
    return true;
  }

  async function bootstrapSession() {
    const currentGeneration = ++bootstrapGeneration;
    fatalNotified = false;
    ready.value = false;
    loading.value = true;
    error.value = "";
    errorReason.value = "";
    dialogMessage.value = null;
    dialogOpenedDuringStartup.value = false;
    preparingReadyGeneration = null;

    try {
      const token = await options.authenticate();
      if (currentGeneration !== bootstrapGeneration) return;
      sessionConnection.connect(token);
    } catch (cause) {
      if (currentGeneration !== bootstrapGeneration) return;
      handleFatal(cause);
    }
  }

  function cleanupSession() {
    bootstrapGeneration += 1;
    sessionConnection.close();
  }

  return {
    dialogMessage,
    dialogOpenedDuringStartup,
    error,
    errorReason,
    loading,
    ready,
    sessionConnection,
    sessionSocket: sessionConnection.socket,
    bootstrapSession,
    cleanupSession,
    dismissDialog,
    openDialog,
    sendDialogEvent
  };
}
