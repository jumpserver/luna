import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";
import type { SftpFileEntry } from "./protocol";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";

import { computed, onUnmounted, ref, watch } from "vue";
import { SftpMessageType, SftpSocketFailureCode } from "./protocol";
import { useSftpOperations } from "./useSftpOperations";
import { useSftpRetry } from "./useSftpRetry";
import { useSftpSocket } from "./useSftpSocket";
import { useSftpTransferEndpoint } from "./useSftpTransferEndpoint";

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

export function useSftpFileManager(ctx: Ref<ConnectorSessionContext | null>, transferRef?: FileTransferEndpointRef) {
  const { t } = useI18n();

  const error = ref("");
  const currentPath = ref("");
  const initialPath = ref("");
  const loading = ref(true);

  const entries = ref<SftpFileEntry[]>([]);
  const activeContext = ref<ConnectorSessionContext | null>(null);
  const navigationHistory = ref<string[]>([]);
  const navigationIndex = ref(-1);
  const canGoBack = computed(() => navigationIndex.value > 0);
  const canGoForward = computed(() => navigationIndex.value >= 0 && navigationIndex.value < navigationHistory.value.length - 1);
  const canGoHome = computed(() => Boolean(initialPath.value) && currentPath.value !== initialPath.value);

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

  function recordNavigation(path: string) {
    if (!path) return;
    if (navigationHistory.value[navigationIndex.value] === path) return;
    navigationHistory.value = [...navigationHistory.value.slice(0, navigationIndex.value + 1), path];
    navigationIndex.value = navigationHistory.value.length - 1;
  }

  async function loadCurrentDirectory(path = currentPath.value, messageId?: string, record = true) {
    loading.value = true;
    error.value = "";
    try {
      await operationClient.operations.listDirectory(path, { messageId });
      if (record) recordNavigation(currentPath.value || path);
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      loading.value = false;
      return false;
    }
  }

  const transferEndpoint = transferRef
    ? useSftpTransferEndpoint(socket, transferRef, async ({ targetPath }) => {
      const normalizedTarget = targetPath.replace(/\/+$/, "");
      const separator = normalizedTarget.lastIndexOf("/");
      const destinationDirectory = normalizedTarget.slice(0, separator) || "/";
      const displayedDirectory = currentPath.value.replace(/\/+$/, "") || "/";

      if (destinationDirectory !== displayedDirectory) return;

      await loadCurrentDirectory(currentPath.value, undefined, false);
    })
    : null;

  function changeDirectory(entry: SftpFileEntry) {
    const path =
      entry.name === ".."
        ? currentPath.value.replace(/\/?[^/]+\/?$/, "") || "/"
        : `${currentPath.value.replace(/\/$/, "")}/${entry.name}`;
    void loadCurrentDirectory(path);
  }

  async function goBack() {
    if (!canGoBack.value) return false;
    const index = navigationIndex.value - 1;
    const path = navigationHistory.value[index];
    if (!path || !(await loadCurrentDirectory(path, undefined, false))) return false;
    navigationIndex.value = index;
    return true;
  }

  async function goForward() {
    if (!canGoForward.value) return false;
    const index = navigationIndex.value + 1;
    const path = navigationHistory.value[index];
    if (!path || !(await loadCurrentDirectory(path, undefined, false))) return false;
    navigationIndex.value = index;
    return true;
  }

  function goHome() {
    if (!canGoHome.value) return false;

    return loadCurrentDirectory(initialPath.value);
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
      navigationHistory.value = [];
      navigationIndex.value = -1;
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
    canGoBack,
    canGoForward,
    canGoHome,
    operations: operationClient.operations,
    transferEndpoint,
    retry,
    loadCurrentDirectory,
    changeDirectory,
    goBack,
    goForward,
    goHome
  };
}
