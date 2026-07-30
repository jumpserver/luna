import type { ChenSocketError, ChenSocketPath } from "~/chen/composables/useChenWebSocket";
import type { ChenPacket } from "~/chen/types";

import { ref } from "vue";
import { useChenWebSocket } from "~/chen/composables/useChenWebSocket";
import { normalizeChenDialogMessage } from "~/chen/utils/chenDialog";

interface UseChenSessionOptions {
  authenticate: () => Promise<string>;
  markConnected: () => void;
  markFailed: () => void;
  onBeforeReady: () => Promise<void>;
  onAfterReady: () => Promise<void>;
  onDisconnected: () => void;
  showMessage: (data: any) => void;
  downloadFile?: (fileKey: string) => Promise<void>;
  createSocket?: (url: string, token: string) => WebSocket;
  resolveUrl?: (path: ChenSocketPath) => string;
}

export function useChenSession(options: UseChenSessionOptions) {
  const ready = ref(false);
  const loading = ref(true);
  const error = ref("");
  const dialogMessage = ref<ReturnType<typeof normalizeChenDialogMessage> | null>(null);

  let bootstrapGeneration = 0;
  let fatalNotified = false;

  const sessionConnection = useChenWebSocket({
    path: "session",
    createSocket: options.createSocket,
    resolveUrl: options.resolveUrl,
    onPacket: handlePacket,
    onError: handleSocketError
  });

  function normalizeError(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function handleFatal(cause: unknown) {
    if (fatalNotified) return;
    fatalNotified = true;
    ready.value = false;
    loading.value = false;
    error.value = normalizeError(cause);
    options.markFailed();

    // A Chen session owns all of its consoles. Close dependent consoles first
    // so their backend close handlers can still resolve the active session.
    options.onDisconnected();
    sessionConnection.close();
  }

  function handleSocketError(socketError: ChenSocketError) {
    handleFatal(socketError.message);
  }

  async function handleSetReady() {
    if (sessionConnection.isReady.value) return;
    const currentGeneration = bootstrapGeneration;
    if (!sessionConnection.markReady()) return;

    try {
      await options.onBeforeReady();
      if (currentGeneration !== bootstrapGeneration || fatalNotified) return;

      ready.value = true;
      loading.value = false;
      options.markConnected();

      await options.onAfterReady();
    } catch (cause) {
      handleFatal(cause);
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

  function handlePacket(packet: ChenPacket) {
    switch (packet.type) {
      case "show_dialog":
        dialogMessage.value = normalizeChenDialogMessage(packet.data);
        break;
      case "close_dialog":
        dialogMessage.value = null;
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
      case "close_session":
        handleFatal(new Error("Chen session disconnected by backend"));
        break;
    }
  }

  async function bootstrapSession() {
    const currentGeneration = ++bootstrapGeneration;
    fatalNotified = false;
    ready.value = false;
    loading.value = true;
    error.value = "";
    dialogMessage.value = null;

    try {
      const token = await options.authenticate();
      if (currentGeneration !== bootstrapGeneration) return;
      sessionConnection.connect(token);
    } catch (cause) {
      handleFatal(cause);
    }
  }

  function cleanupSession() {
    bootstrapGeneration += 1;
    sessionConnection.close();
  }

  return {
    dialogMessage,
    error,
    loading,
    ready,
    sessionConnection,
    sessionSocket: sessionConnection.socket,
    bootstrapSession,
    cleanupSession
  };
}
