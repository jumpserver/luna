import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";

import type { SftpFileEntry } from "./protocol";

import { onUnmounted, ref, watch } from "vue";
import { SftpMessageType, SftpSocketFailureCode } from "./protocol";
import { useSftpOperations } from "./useSftpOperations";
import { useSftpRetry } from "./useSftpRetry";
import { useSftpSocket } from "./useSftpSocket";

export type { SftpFileEntry } from "./protocol";

function errorMessage(code: SftpSocketFailureCode, t: (key: string) => string) {
  switch (code) {
    case SftpSocketFailureCode.ConnectionFailed:
      return t("koko.fileManagement.connectionFailed");
    case SftpSocketFailureCode.ConnectionClosed:
      return t("koko.fileManagement.connectionClosed");
    case SftpSocketFailureCode.ConnectionReset:
      return t("koko.fileManagement.connectionReset");
    default:
      return t("koko.fileManagement.sessionExpired");
  }
}

export function useSftpFileManager(ctx: Ref<ConnectorSessionContext | null>) {
  const { t } = useI18n();

  const error = ref("");
  const currentPath = ref("");
  const initialPath = ref("");
  const loading = ref(true);

  const entries = ref<SftpFileEntry[]>([]);
  const activeContext = ref<ConnectorSessionContext | null>(null);

  const socket = useSftpSocket();
  const operationClient = useSftpOperations(currentPath, socket);
  const retry = useSftpRetry(activeContext, socket, {
    beforeReconnect: () => operationClient.rejectPending(SftpSocketFailureCode.ConnectionReset)
  });

  function setList(items: SftpFileEntry[]) {
    const atRoot = currentPath.value === "/" || currentPath.value === initialPath.value;
    entries.value = atRoot
      ? items
      : [{ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true }, ...items];
    loading.value = false;
  }

  async function loadCurrentDirectory(path = currentPath.value, messageId?: string) {
    loading.value = true;
    error.value = "";
    try {
      await operationClient.operations.listDirectory(path, { messageId });
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      loading.value = false;
      return false;
    }
  }

  function changeDirectory(entry: SftpFileEntry) {
    const path =
      entry.name === ".."
        ? currentPath.value.replace(/\/?[^/]+\/?$/, "") || "/"
        : `${currentPath.value.replace(/\/$/, "")}/${entry.name}`;
    void loadCurrentDirectory(path);
  }

  const stopListListener = operationClient.onList(({ entries: nextEntries, currentPath: nextPath, background }) => {
    if (background) return;
    if (nextPath !== undefined) {
      currentPath.value = nextPath;
      if (!initialPath.value) initialPath.value = nextPath;
    }

    setList(nextEntries);
  });

  const stopErrorListener = operationClient.onError((cause) => {
    error.value = cause.message;
    loading.value = false;
  });

  const stopMessageListener = socket.onMessage((message) => {
    if (message.type === SftpMessageType.Connect) void loadCurrentDirectory(currentPath.value || "", message.id);
  });

  const stopFailureListener = socket.onFailure((failure) => {
    error.value = errorMessage(failure.code, t);
    loading.value = false;
  });

  watch(
    ctx,
    (context) => {
      operationClient.rejectPending(SftpSocketFailureCode.ConnectionReset);
      activeContext.value = context ? { ...context } : null;
      entries.value = [];
      currentPath.value = "";
      initialPath.value = "";
      error.value = "";
      loading.value = Boolean(context);
      if (activeContext.value) socket.connect(activeContext.value);
      else socket.close();
    },
    { immediate: true }
  );

  onUnmounted(() => {
    stopListListener();
    stopErrorListener();
    stopMessageListener();
    stopFailureListener();
  });

  return {
    entries,
    currentPath,
    loading,
    error,
    connected: socket.connected,
    uploadProgress: operationClient.uploadProgress,
    currentUploadName: operationClient.currentUploadName,
    queuedUploadCount: operationClient.queuedUploadCount,
    operations: operationClient.operations,
    retry,
    loadCurrentDirectory,
    changeDirectory
  };
}
