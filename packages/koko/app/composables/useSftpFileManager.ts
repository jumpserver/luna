import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { resolveWsUrl } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";

export interface SftpFileEntry {
  name: string;
  size: string;
  perm: string;
  mod_time: string;
  type: string;
  is_dir: boolean;
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading";
}

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export function useSftpFileManager(ctx: Ref<ConnectorSessionContext | null>) {
  const hostAdapter = useKokoHostAdapter();
  const { t } = useI18n();
  const entries = ref<SftpFileEntry[]>([]);
  const currentPath = ref("");
  const initialPath = ref("");
  const loading = ref(true);
  const error = ref("");
  const connected = ref(false);
  const uploadProgress = ref(0);
  let socket: WebSocket | null = null;
  let downloadParts: Uint8Array[] = [];
  let readQueue: Promise<void> = Promise.resolve();
  let uploadQueue: Promise<void> = Promise.resolve();
  const pendingReads = new Map<
    string,
    { parts: Uint8Array[]; resolve: (blob: Blob) => void; reject: (error: Error) => void }
  >();
  const pendingLists = new Map<
    string,
    { resolve: (entries: SftpFileEntry[]) => void; reject: (error: Error) => void }
  >();
  const pendingMutations = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const pendingUploadAcks = new Map<string, Array<{ resolve: () => void; reject: (error: Error) => void }>>();
  const uploadTasks = ref<UploadTask[]>([]);
  const currentUploadName = ref("");
  const queuedUploadCount = ref(0);
  const activeContext = ref<ConnectorSessionContext | null>(null);

  // Koko's WebSFTP handler keeps the active message on the connection object.
  // Serializing reads prevents a tree listing from overwriting a file download
  // (or vice versa) while the server dispatch goroutine is still running.
  const enqueueRead = <T>(operation: () => Promise<T>) => {
    const result = readQueue.then(operation, operation);
    readQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const enqueueUpload = <T>(operation: () => Promise<T>) => {
    const result = uploadQueue.then(operation, operation);
    uploadQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const syncUploadState = () => {
    const active = uploadTasks.value.find((task) => task.status === "uploading") || uploadTasks.value[0] || null;
    currentUploadName.value = active?.name || "";
    uploadProgress.value = active?.progress || 0;
    queuedUploadCount.value = uploadTasks.value.filter((task) => task.status === "queued").length;
  };

  const rejectPendingUploads = (message: string) => {
    for (const waiters of pendingUploadAcks.values()) {
      for (const waiter of waiters) waiter.reject(new Error(message));
    }
    pendingUploadAcks.clear();
    uploadTasks.value = [];
    syncUploadState();
  };

  const rejectPendingRead = (message: string) => {
    for (const pending of pendingReads.values()) pending.reject(new Error(message));
    pendingReads.clear();
    downloadParts = [];
    for (const pending of pendingLists.values()) pending.reject(new Error(message));
    pendingLists.clear();
    for (const pending of pendingMutations.values()) pending.reject(new Error(message));
    pendingMutations.clear();
    rejectPendingUploads(message);
  };

  const decodeRaw = (raw: unknown) => {
    if (typeof raw === "string") {
      if (!raw) return new Uint8Array();
      const binary = atob(raw);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    if (Array.isArray(raw)) return Uint8Array.from(raw);
    return new Uint8Array();
  };

  const send = (cmd: string, data: Record<string, unknown>, raw = "", messageId = id()) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error(t("koko.fileManagement.connectionNotReady"));
    socket.send(JSON.stringify({ id: messageId, type: "SFTP_DATA", cmd, data: JSON.stringify(data), raw }));
  };

  const waitForUploadAck = (messageId: string) =>
    new Promise<void>((resolve, reject) => {
      const waiters = pendingUploadAcks.get(messageId) || [];
      waiters.push({ resolve, reject });
      pendingUploadAcks.set(messageId, waiters);
    });

  const sendUpload = async (messageId: string, data: Record<string, unknown>, raw = "") => {
    const ack = waitForUploadAck(messageId);
    try {
      send("upload", data, raw, messageId);
      await ack;
    } catch (cause) {
      const waiters = pendingUploadAcks.get(messageId) || [];
      const remaining = waiters.slice(1);
      if (remaining.length) pendingUploadAcks.set(messageId, remaining);
      else pendingUploadAcks.delete(messageId);
      throw cause;
    }
  };

  const list = (path = currentPath.value) => {
    loading.value = true;
    send("list", { path });
  };

  const setList = (items: SftpFileEntry[]) => {
    const atRoot = currentPath.value === "/" || currentPath.value === initialPath.value;
    entries.value = atRoot
      ? items
      : [{ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true }, ...items];
    loading.value = false;
  };

  const connect = () => {
    const context = activeContext.value;
    if (!context) return;
    rejectPendingRead(t("koko.fileManagement.connectionReset"));
    socket?.close();
    loading.value = true;
    error.value = "";
    socket = new WebSocket(resolveWsUrl(context.component, "sftp", context), ["JMS-KOKO"]);
    socket.onopen = () => {
      connected.value = true;
    };
    socket.onerror = () => {
      error.value = t("koko.fileManagement.connectionFailed");
      loading.value = false;
      rejectPendingRead(error.value);
    };
    socket.onclose = () => {
      connected.value = false;
      rejectPendingRead(t("koko.fileManagement.connectionClosed"));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const isBackgroundList = message.cmd === "list" && pendingLists.has(message.id);
        if (message.current_path !== undefined && !isBackgroundList) {
          currentPath.value = message.current_path;
          if (!initialPath.value) initialPath.value = message.current_path;
        }
        if (message.type === "CONNECT") {
          send("list", { path: currentPath.value || "" }, "", message.id);
        } else if (message.type === "PING") {
          socket?.send(JSON.stringify({ id: id(), type: "PONG", data: "pong" }));
        } else if (message.type === "SFTP_BINARY") {
          const pending = pendingReads.get(message.id);
          if (pending) pending.parts.push(decodeRaw(message.raw));
          else downloadParts.push(decodeRaw(message.raw));
        } else if (message.type === "SFTP_DATA") {
          const mutation = pendingMutations.get(message.id);
          if (message.cmd === "upload") {
            const waiters = pendingUploadAcks.get(message.id) || [];
            if (message.err) {
              for (const waiter of waiters) waiter.reject(new Error(message.err));
              pendingUploadAcks.delete(message.id);
            } else if (message.data === "ok") {
              const waiter = waiters.shift();
              waiter?.resolve();
              if (waiters.length) pendingUploadAcks.set(message.id, waiters);
              else pendingUploadAcks.delete(message.id);
            }
          }
          if (mutation && ["mkdir", "rename", "rm"].includes(message.cmd)) {
            if (message.err) {
              mutation.reject(new Error(message.err));
              pendingMutations.delete(message.id);
            } else {
              mutation.resolve();
              pendingMutations.delete(message.id);
            }
          }
          if (message.cmd === "list") {
            const items = JSON.parse(message.data || "[]") as SftpFileEntry[];
            const pending = pendingLists.get(message.id);
            if (pending) {
              if (message.err) pending.reject(new Error(message.err));
              else pending.resolve(items);
              pendingLists.delete(message.id);
            } else {
              setList(items);
            }
          } else if (message.cmd === "download") {
            if (message.err) {
              error.value = message.err;
              const pending = pendingReads.get(message.id);
              if (pending) {
                pending.reject(new Error(message.err));
                pendingReads.delete(message.id);
              }
            } else {
              const pending = pendingReads.get(message.id);
              const blob = new Blob(pending?.parts || downloadParts, { type: "application/octet-stream" });
              if (pending) {
                pending.resolve(blob);
                pendingReads.delete(message.id);
              } else if (message.data) {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = message.data;
                link.click();
                URL.revokeObjectURL(link.href);
                downloadParts = [];
              } else {
                downloadParts = [];
              }
            }
          } else if (!mutation && ["mkdir", "rm", "rename"].includes(message.cmd) && message.data === "ok") {
            list();
          } else if (message.err) {
            error.value = message.err;
          }
        } else if (message.type === "ERROR" || message.type === "CLOSE" || message.type === "closed") {
          error.value = message.err || t("koko.fileManagement.sessionExpired");
          rejectPendingRead(error.value);
          loading.value = false;
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        error.value = message;
        rejectPendingRead(message);
      }
    };
  };

  const syncContext = (context: ConnectorSessionContext | null) => {
    activeContext.value = context ? { ...context } : null;
  };

  const refreshContextToken = async () => {
    const context = activeContext.value;
    if (!context?.tokenId) throw new Error(t("koko.fileManagement.missingConnectionToken"));

    const token = await hostAdapter.sftp.exchangeConnectToken(context.tokenId);
    let ticket = context.ticket || "";
    try {
      ticket = String(
        (
          await hostAdapter.createTicket({
            baseUrl: context.endpointUrl,
            tokenId: token.id
          })
        ).ticket || ""
      );
    } catch (cause) {
      if (hostAdapter.isTauriRuntime()) throw cause;
      console.warn("[sftp] refresh connect ticket failed, fallback to cookie auth:", cause);
      ticket = "";
    }

    activeContext.value = {
      ...context,
      tokenId: token.id,
      ticket
    };

    return activeContext.value;
  };

  const changeDirectory = (entry: SftpFileEntry) => {
    const path =
      entry.name === ".."
        ? currentPath.value.replace(/\/?[^/]+\/?$/, "") || "/"
        : `${currentPath.value.replace(/\/$/, "")}/${entry.name}`;
    list(path);
  };
  const listDirectory = (path: string) =>
    enqueueRead(
      () =>
        new Promise<SftpFileEntry[]>((resolve, reject) => {
          const messageId = id();
          pendingLists.set(messageId, { resolve, reject });
          try {
            send("list", { path }, "", messageId);
          } catch (cause) {
            pendingLists.delete(messageId);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );
  const createDirectory = (name: string) => send("mkdir", { path: `${currentPath.value.replace(/\/$/, "")}/${name}` });
  const createDirectoryAt = (path: string) =>
    enqueueRead(
      () =>
        new Promise<void>((resolve, reject) => {
          const messageId = id();
          pendingMutations.set(messageId, { resolve, reject });
          try {
            send("mkdir", { path }, "", messageId);
          } catch (cause) {
            pendingMutations.delete(messageId);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );
  const createFileAt = (path: string) =>
    enqueueRead(
      () =>
        new Promise<void>((resolve, reject) => {
          const messageId = id();
          sendUpload(messageId, { offSet: 0, size: 0, path, chunk: false })
            .then(resolve)
            .catch((cause) => reject(cause instanceof Error ? cause : new Error(String(cause))));
        })
    );
  const mutatePath = (cmd: "rename" | "rm", path: string, extra: Record<string, unknown> = {}) =>
    enqueueRead(
      () =>
        new Promise<void>((resolve, reject) => {
          const messageId = id();
          pendingMutations.set(messageId, { resolve, reject });
          try {
            send(cmd, { path, ...extra }, "", messageId);
          } catch (cause) {
            pendingMutations.delete(messageId);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );
  const renamePath = (path: string, name: string) => mutatePath("rename", path, { new_name: name });
  const removePath = (path: string) => mutatePath("rm", path);
  const renameEntry = (entry: SftpFileEntry, name: string) =>
    send("rename", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, new_name: name });
  const removeEntry = (entry: SftpFileEntry) =>
    send("rm", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}` });
  const downloadEntry = (entry: SftpFileEntry) => {
    downloadParts = [];
    send("download", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, is_dir: entry.is_dir });
  };
  const downloadPath = (path: string, isDir: boolean) => {
    downloadParts = [];
    send("download", { path, is_dir: isDir });
  };
  const readFile = (entry: SftpFileEntry, targetPath?: string) =>
    enqueueRead(
      () =>
        new Promise<Blob>((resolve, reject) => {
          const messageId = id();
          pendingReads.set(messageId, { parts: [], resolve, reject });
          try {
            send(
              "download",
              { path: targetPath || `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, is_dir: false },
              "",
              messageId
            );
          } catch (cause) {
            pendingReads.delete(messageId);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );
  const uploadFile = (file: File, targetPath?: string) =>
    enqueueUpload(async () => {
      const chunkSize = 5 * 1024 * 1024;
      const chunks = Math.max(1, Math.ceil(file.size / chunkSize));
      const path = targetPath || `${currentPath.value.replace(/\/$/, "")}/${file.name}`;
      // koko uses this id as the numeric key for chunked uploads.
      const messageId = String(Date.now());
      const task: UploadTask = { id: messageId, name: file.name, progress: 0, status: "queued" };
      uploadTasks.value = [...uploadTasks.value, task];
      syncUploadState();
      try {
        task.status = "uploading";
        syncUploadState();
        for (let index = 0; index < chunks; index++) {
          const bytes = new Uint8Array(await file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          await sendUpload(
            messageId,
            {
              offSet: index * chunkSize,
              size: file.size,
              path,
              chunk: chunks > 1
            },
            btoa(binary)
          );
          task.progress = Math.round(((index + 1) / chunks) * 100);
          syncUploadState();
        }
        if (chunks > 1) await sendUpload(messageId, { offSet: 0, merge: true, size: 0, path }, "");
        list();
      } finally {
        uploadTasks.value = uploadTasks.value.filter((item) => item.id !== task.id);
        syncUploadState();
      }
    });
  const uploadBlob = async (fileName: string, blob: Blob) => {
    const file =
      blob instanceof File ? blob : new File([blob], fileName, { type: blob.type || "application/octet-stream" });
    await uploadFile(file);
  };

  watch(
    ctx,
    (context) => {
      syncContext(context);
      connect();
    },
    { immediate: true }
  );
  onUnmounted(() => socket?.close());
  return {
    entries,
    currentPath,
    loading,
    error,
    connected,
    uploadProgress,
    currentUploadName,
    queuedUploadCount,
    list,
    listDirectory,
    changeDirectory,
    createDirectory,
    createDirectoryAt,
    createFileAt,
    renameEntry,
    renamePath,
    removeEntry,
    removePath,
    downloadEntry,
    downloadPath,
    readFile,
    uploadFile,
    uploadBlob,
    reconnect: async () => {
      await refreshContextToken();
      connect();
    }
  };
}
