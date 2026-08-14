import type { Ref } from "vue";
import type {
  SftpDataMessage,
  SftpFileEntry,
  SftpFileOperations,
  SftpIncomingMessage,
  SftpSocketFailure
} from "./protocol";
import type { SftpSocketClient } from "./useSftpSocket";

import { computed, ref } from "vue";
import { createSftpMessageId, decodeSftpRawBytes, encodeSftpBytes, joinSftpPath } from "./core/codec";
import { rejectPendingRequests } from "./core/pending";
import { createSerialTaskQueue } from "./core/queues";
import {
  SFTP_FILE_CONFLICT_ERROR,
  SFTP_REQUEST_TIMEOUT_ERROR,
  SftpCommand,
  SftpDataStatus,
  SftpMessageType
} from "./protocol";

interface PendingList {
  background: boolean;
  requestedPath: string;
  resolve: (entries: SftpFileEntry[]) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface PendingDownload {
  parts: Uint8Array[];
  saveAs: boolean;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface PendingMutation {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface PendingUploadAck {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface PendingSave {
  resolve: (entry: SftpFileEntry) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export class SftpFileConflictError extends Error {
  constructor() {
    super(SFTP_FILE_CONFLICT_ERROR);
    this.name = "SftpFileConflictError";
  }
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading";
}

const uploadChunkSize = 5 * 1024 * 1024;
const requestTimeoutMs = 30_000;
const saveRequestTimeoutMs = 120_000;
const transferCommands = new Set<SftpCommand>([
  SftpCommand.TransferPrepare,
  SftpCommand.TransferRead,
  SftpCommand.TransferWrite,
  SftpCommand.TransferStatus,
  SftpCommand.TransferCommit,
  SftpCommand.TransferCancel
]);

export function useSftpOperations(currentPath: Ref<string>, socket: SftpSocketClient) {
  const uploadTasks = ref<UploadTask[]>([]);
  const uploadProgress = computed(() => {
    const active = uploadTasks.value.find((task) => task.status === "uploading") || uploadTasks.value[0];
    return active?.progress || 0;
  });
  const currentUploadName = computed(() => {
    const active = uploadTasks.value.find((task) => task.status === "uploading") || uploadTasks.value[0];
    return active?.name || "";
  });
  const queuedUploadCount = computed(() => uploadTasks.value.filter((task) => task.status === "queued").length);

  const pendingLists = new Map<string, PendingList>();
  const pendingDownloads = new Map<string, PendingDownload>();
  const pendingMutations = new Map<string, PendingMutation>();
  const pendingUploadAcks = new Map<string, PendingUploadAck[]>();
  const pendingSaves = new Map<string, PendingSave>();
  const listListeners = new Set<
    (result: { entries: SftpFileEntry[]; currentPath?: string; background: boolean }) => void
  >();
  const errorListeners = new Set<(error: Error) => void>();

  const navigationQueue = createSerialTaskQueue();
  const mutationQueue = createSerialTaskQueue();
  const uploadQueue = createSerialTaskQueue();

  const emitError = (error: Error) => {
    for (const listener of errorListeners) listener(error);
  };

  function armDownloadTimeout(id: string, pending: PendingDownload) {
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      if (pendingDownloads.get(id) !== pending) return;
      pendingDownloads.delete(id);
      pending.reject(new Error(SFTP_REQUEST_TIMEOUT_ERROR));
    }, requestTimeoutMs);
  }

  function rejectPending(message: string) {
    const error = new Error(message);
    rejectPendingRequests(pendingLists.values(), error);
    rejectPendingRequests(pendingDownloads.values(), error);
    rejectPendingRequests(pendingMutations.values(), error);
    for (const waiters of pendingUploadAcks.values()) {
      rejectPendingRequests(waiters, error);
    }
    rejectPendingRequests(pendingSaves.values(), error);
    pendingLists.clear();
    pendingDownloads.clear();
    pendingMutations.clear();
    pendingUploadAcks.clear();
    pendingSaves.clear();
    uploadTasks.value = [];
  }

  function send(command: SftpCommand, data: Record<string, unknown>, raw = "", id: string = createSftpMessageId()) {
    socket.send({ id, type: SftpMessageType.Data, cmd: command, data: JSON.stringify(data), raw });
    return id;
  }

  function waitForUploadAck(id: string) {
    return new Promise<void>((resolve, reject) => {
      const waiter: PendingUploadAck = { resolve, reject };
      const waiters = pendingUploadAcks.get(id) || [];
      waiter.timeout = setTimeout(() => {
        const active = pendingUploadAcks.get(id) || [];
        const remaining = active.filter((item) => item !== waiter);
        if (remaining.length) pendingUploadAcks.set(id, remaining);
        else pendingUploadAcks.delete(id);
        reject(new Error(SFTP_REQUEST_TIMEOUT_ERROR));
      }, requestTimeoutMs);
      waiters.push(waiter);
      pendingUploadAcks.set(id, waiters);
    });
  }

  async function sendUpload(id: string, data: Record<string, unknown>, raw = "") {
    const ack = waitForUploadAck(id);
    try {
      send(SftpCommand.Upload, data, raw, id);
      await ack;
    } catch (cause) {
      const waiters = pendingUploadAcks.get(id) || [];
      const waiter = waiters[0];
      clearTimeout(waiter?.timeout);
      const remaining = waiters.slice(1);
      if (remaining.length) pendingUploadAcks.set(id, remaining);
      else pendingUploadAcks.delete(id);
      throw cause;
    }
  }

  function handleList(message: SftpDataMessage) {
    const pending = pendingLists.get(message.id);
    if (!pending) return;
    pendingLists.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.err) {
      pending.reject(new Error(message.err));
      return;
    }
    try {
      const entries = JSON.parse(message.data || "[]") as SftpFileEntry[];
      pending.resolve(entries);
      for (const listener of listListeners) {
        listener({
          entries,
          currentPath: pending.requestedPath || message.current_path,
          background: pending.background
        });
      }
    } catch (cause) {
      pending.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  function handleDownload(message: SftpDataMessage) {
    const pending = pendingDownloads.get(message.id);
    if (!pending) return;
    pendingDownloads.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.err) {
      pending.reject(new Error(message.err));
      return;
    }
    const parts = pending.parts.map((part) => {
      const copy = new Uint8Array(part.byteLength);
      copy.set(part);
      return copy.buffer as ArrayBuffer;
    });
    const blob = new Blob(parts, { type: "application/octet-stream" });
    if (pending.saveAs && message.data) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = message.data;
      link.click();
      URL.revokeObjectURL(link.href);
    }
    pending.resolve(blob);
  }

  function handleUpload(message: SftpDataMessage) {
    const waiters = pendingUploadAcks.get(message.id) || [];
    if (message.err) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error(message.err));
      }
      pendingUploadAcks.delete(message.id);
      return;
    }
    if (message.data !== SftpDataStatus.Ok) return;
    const waiter = waiters.shift();
    clearTimeout(waiter?.timeout);
    waiter?.resolve();
    if (waiters.length) pendingUploadAcks.set(message.id, waiters);
    else pendingUploadAcks.delete(message.id);
  }

  function handleSave(message: SftpDataMessage) {
    const pending = pendingSaves.get(message.id);
    if (!pending) return;
    pendingSaves.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error_code === SFTP_FILE_CONFLICT_ERROR) {
      pending.reject(new SftpFileConflictError());
      return;
    }
    if (message.err) {
      pending.reject(new Error(message.err));
      return;
    }
    try {
      pending.resolve(JSON.parse(message.data || "{}") as SftpFileEntry);
    } catch (cause) {
      pending.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  function handleMutation(message: SftpDataMessage) {
    const pending = pendingMutations.get(message.id);
    if (!pending) return;
    pendingMutations.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.err) pending.reject(new Error(message.err));
    else pending.resolve();
  }

  function handleMessage(message: SftpIncomingMessage) {
    if (message.type === SftpMessageType.Binary) {
      const pending = pendingDownloads.get(message.id);
      if (pending) {
        pending.parts.push(decodeSftpRawBytes(message.raw));
        armDownloadTimeout(message.id, pending);
      }
      return;
    }
    if (
      message.type === SftpMessageType.Error ||
      message.type === SftpMessageType.Close ||
      message.type === SftpMessageType.Closed
    ) {
      const error = new Error(message.err || message.type);
      emitError(error);
      rejectPending(error.message);
      return;
    }
    if (message.type !== SftpMessageType.Data) return;
    if (
      message.err &&
      !transferCommands.has(message.cmd) &&
      !pendingLists.has(message.id) &&
      !pendingDownloads.has(message.id) &&
      !pendingMutations.has(message.id) &&
      !pendingSaves.has(message.id)
    ) {
      emitError(new Error(message.err));
    }

    switch (message.cmd) {
      case SftpCommand.List:
        handleList(message);
        break;
      case SftpCommand.Download:
        handleDownload(message);
        break;
      case SftpCommand.Upload:
        handleUpload(message);
        break;
      case SftpCommand.Save:
        handleSave(message);
        break;
      case SftpCommand.MakeDirectory:
      case SftpCommand.Rename:
      case SftpCommand.Remove:
        handleMutation(message);
        break;
    }
  }

  socket.onMessage(handleMessage);
  socket.onFailure((failure: SftpSocketFailure) => {
    rejectPending(failure.message);
  });

  const listDirectory = (path: string, options: { background?: boolean; messageId?: string } = {}) => {
    const request = () =>
      new Promise<SftpFileEntry[]>((resolve, reject) => {
        const id = options.messageId || createSftpMessageId();
        const pending: PendingList = {
          background: Boolean(options.background),
          requestedPath: path,
          resolve,
          reject
        };
        pending.timeout = setTimeout(() => {
          if (pendingLists.get(id) !== pending) return;
          pendingLists.delete(id);
          reject(new Error(SFTP_REQUEST_TIMEOUT_ERROR));
        }, requestTimeoutMs);
        pendingLists.set(id, pending);
        try {
          send(SftpCommand.List, { path }, "", id);
        } catch (cause) {
          pendingLists.delete(id);
          clearTimeout(pending.timeout);
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      });

    return options.background ? Promise.resolve().then(request) : navigationQueue.enqueue(request);
  };

  const mutatePath = (
    command: SftpCommand.MakeDirectory | SftpCommand.Rename | SftpCommand.Remove,
    path: string,
    extra = {}
  ) =>
    mutationQueue.enqueue(
      () =>
        new Promise<void>((resolve, reject) => {
          const id = createSftpMessageId();
          const pending: PendingMutation = { resolve, reject };
          pending.timeout = setTimeout(() => {
            if (pendingMutations.get(id) !== pending) return;
            pendingMutations.delete(id);
            reject(new Error(SFTP_REQUEST_TIMEOUT_ERROR));
          }, requestTimeoutMs);
          pendingMutations.set(id, pending);
          try {
            send(command, { path, ...extra }, "", id);
          } catch (cause) {
            pendingMutations.delete(id);
            clearTimeout(pending.timeout);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );

  const readPath = (path: string, saveAs: boolean, isDir = false) =>
    new Promise<Blob>((resolve, reject) => {
      const id = createSftpMessageId();
      const pending: PendingDownload = { parts: [], saveAs, resolve, reject };
      pendingDownloads.set(id, pending);
      armDownloadTimeout(id, pending);
      try {
        send(SftpCommand.Download, { path, is_dir: isDir }, "", id);
      } catch (cause) {
        pendingDownloads.delete(id);
        clearTimeout(pending.timeout);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });

  const uploadFile = (file: File, targetPath = joinSftpPath(currentPath.value, file.name)) =>
    uploadQueue.enqueue(async () => {
      const chunks = Math.max(1, Math.ceil(file.size / uploadChunkSize));
      const id = String(Date.now());
      const task: UploadTask = { id, name: file.name, progress: 0, status: "queued" };
      uploadTasks.value = [...uploadTasks.value, task];
      try {
        task.status = "uploading";
        for (let index = 0; index < chunks; index++) {
          const bytes = new Uint8Array(
            await file.slice(index * uploadChunkSize, (index + 1) * uploadChunkSize).arrayBuffer()
          );

          await sendUpload(
            id,
            { offSet: index * uploadChunkSize, size: file.size, path: targetPath, chunk: chunks > 1 },
            encodeSftpBytes(bytes)
          );
          task.progress = Math.round(((index + 1) / chunks) * 100);
          uploadTasks.value = [...uploadTasks.value];
        }
        if (chunks > 1) await sendUpload(id, { offSet: 0, merge: true, size: 0, path: targetPath });
      } finally {
        uploadTasks.value = uploadTasks.value.filter((item) => item.id !== task.id);
      }
    });

  const saveFile = (path: string, bytes: Uint8Array, options: { expectedVersion?: string; force?: boolean } = {}) =>
    uploadQueue.enqueue(
      () =>
        new Promise<SftpFileEntry>((resolve, reject) => {
          const id = createSftpMessageId();
          const pending: PendingSave = { resolve, reject };
          pending.timeout = setTimeout(() => {
            if (pendingSaves.get(id) !== pending) return;
            pendingSaves.delete(id);
            reject(new Error(SFTP_REQUEST_TIMEOUT_ERROR));
          }, saveRequestTimeoutMs);
          pendingSaves.set(id, pending);
          try {
            send(
              SftpCommand.Save,
              {
                path,
                size: bytes.byteLength,
                expected_version: options.expectedVersion,
                force: Boolean(options.force)
              },
              encodeSftpBytes(bytes),
              id
            );
          } catch (cause) {
            pendingSaves.delete(id);
            clearTimeout(pending.timeout);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );

  const operations: SftpFileOperations = {
    listDirectory,
    createDirectory: (name) => mutatePath(SftpCommand.MakeDirectory, joinSftpPath(currentPath.value, name)),
    createDirectoryAt: (path) => mutatePath(SftpCommand.MakeDirectory, path),
    // koko parses upload message IDs as integers, including empty-file uploads.
    createFileAt: (path) =>
      uploadQueue.enqueue(() => sendUpload(String(Date.now()), { offSet: 0, size: 0, path, chunk: false })),
    renameEntry: (entry, name) =>
      mutatePath(SftpCommand.Rename, joinSftpPath(currentPath.value, entry.name), { new_name: name }),
    renamePath: (path, name) => mutatePath(SftpCommand.Rename, path, { new_name: name }),
    removeEntry: (entry) => mutatePath(SftpCommand.Remove, joinSftpPath(currentPath.value, entry.name)),
    removePath: (path) => mutatePath(SftpCommand.Remove, path),
    downloadEntry: (entry) =>
      readPath(joinSftpPath(currentPath.value, entry.name), true, entry.is_dir).then(() => undefined),
    downloadPath: (path, isDir) => readPath(path, true, isDir).then(() => undefined),
    readFile: (entry, targetPath) => readPath(targetPath || joinSftpPath(currentPath.value, entry.name), false),
    uploadFile,
    uploadBlob: async (fileName, blob, targetPath) => {
      const file =
        blob instanceof File ? blob : new File([blob], fileName, { type: blob.type || "application/octet-stream" });

      await uploadFile(file, targetPath || joinSftpPath(currentPath.value, fileName));
    },
    saveFile
  };

  function onList(listener: (result: { entries: SftpFileEntry[]; currentPath?: string; background: boolean }) => void) {
    listListeners.add(listener);
    return () => listListeners.delete(listener);
  }

  function onError(listener: (error: Error) => void) {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }

  return {
    operations,
    uploadProgress,
    currentUploadName,
    queuedUploadCount,
    onError,
    onList,
    rejectPending
  };
}
