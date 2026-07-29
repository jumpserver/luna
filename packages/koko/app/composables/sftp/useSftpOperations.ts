import type { Ref } from "vue";

import type { SftpDataMessage, SftpFileEntry, SftpFileOperations, SftpIncomingMessage, SftpSocketFailure } from "./protocol";

import type { SftpSocketClient } from "./useSftpSocket";
import { computed, ref } from "vue";
import {
  SftpCommand,

  SftpDataStatus,

  SftpMessageType

} from "./protocol";

interface PendingList {
  background: boolean;
  resolve: (entries: SftpFileEntry[]) => void;
  reject: (error: Error) => void;
}

interface PendingDownload {
  parts: Uint8Array[];
  saveAs: boolean;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading";
}

const messageId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const uploadChunkSize = 5 * 1024 * 1024;

function pathFor(currentPath: string, name: string) {
  return `${currentPath.replace(/\/$/, "")}/${name}`;
}

function decodeRaw(raw: unknown) {
  if (typeof raw === "string") {
    if (!raw) return new Uint8Array();
    const binary = atob(raw);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  return new Uint8Array();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

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
  const pendingMutations = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const pendingUploadAcks = new Map<string, Array<{ resolve: () => void; reject: (error: Error) => void }>>();
  const listListeners = new Set<(result: { entries: SftpFileEntry[]; currentPath?: string; background: boolean }) => void>();
  const errorListeners = new Set<(error: Error) => void>();
  let readQueue: Promise<void> = Promise.resolve();
  let uploadQueue: Promise<void> = Promise.resolve();

  const emitError = (error: Error) => {
    for (const listener of errorListeners) listener(error);
  };

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

  function rejectPending(message: string) {
    const error = new Error(message);
    for (const pending of pendingLists.values()) pending.reject(error);
    for (const pending of pendingDownloads.values()) pending.reject(error);
    for (const pending of pendingMutations.values()) pending.reject(error);
    for (const waiters of pendingUploadAcks.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
    pendingLists.clear();
    pendingDownloads.clear();
    pendingMutations.clear();
    pendingUploadAcks.clear();
    uploadTasks.value = [];
  }

  function send(command: SftpCommand, data: Record<string, unknown>, raw = "", id = messageId()) {
    socket.send({ id, type: SftpMessageType.Data, cmd: command, data: JSON.stringify(data), raw });
    return id;
  }

  function waitForUploadAck(id: string) {
    return new Promise<void>((resolve, reject) => {
      const waiters = pendingUploadAcks.get(id) || [];
      waiters.push({ resolve, reject });
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
    if (message.err) {
      pending.reject(new Error(message.err));
      return;
    }
    try {
      const entries = JSON.parse(message.data || "[]") as SftpFileEntry[];
      pending.resolve(entries);
      for (const listener of listListeners) {
        listener({ entries, currentPath: message.current_path, background: pending.background });
      }
    } catch (cause) {
      pending.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  function handleDownload(message: SftpDataMessage) {
    const pending = pendingDownloads.get(message.id);
    if (!pending) return;
    pendingDownloads.delete(message.id);
    if (message.err) {
      pending.reject(new Error(message.err));
      return;
    }
    const blob = new Blob(pending.parts, { type: "application/octet-stream" });
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
      for (const waiter of waiters) waiter.reject(new Error(message.err));
      pendingUploadAcks.delete(message.id);
      return;
    }
    if (message.data !== SftpDataStatus.Ok) return;
    const waiter = waiters.shift();
    waiter?.resolve();
    if (waiters.length) pendingUploadAcks.set(message.id, waiters);
    else pendingUploadAcks.delete(message.id);
  }

  function handleMutation(message: SftpDataMessage) {
    const pending = pendingMutations.get(message.id);
    if (!pending) return;
    pendingMutations.delete(message.id);
    if (message.err) pending.reject(new Error(message.err));
    else pending.resolve();
  }

  function handleMessage(message: SftpIncomingMessage) {
    if (message.type === SftpMessageType.Binary) {
      pendingDownloads.get(message.id)?.parts.push(decodeRaw(message.raw));
      return;
    }
    if (message.type === SftpMessageType.Error || message.type === SftpMessageType.Close || message.type === SftpMessageType.Closed) {
      const error = new Error(message.err || message.type);
      emitError(error);
      rejectPending(error.message);
      return;
    }
    if (message.type !== SftpMessageType.Data) return;
    if (message.err && !pendingLists.has(message.id) && !pendingDownloads.has(message.id) && !pendingMutations.has(message.id)) {
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

  const listDirectory = (path: string, options: { background?: boolean; messageId?: string } = {}) =>
    enqueueRead(
      () =>
        new Promise<SftpFileEntry[]>((resolve, reject) => {
          const id = options.messageId || messageId();
          pendingLists.set(id, { background: Boolean(options.background), resolve, reject });
          try {
            send(SftpCommand.List, { path }, "", id);
          } catch (cause) {
            pendingLists.delete(id);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );

  const mutatePath = (command: SftpCommand.MakeDirectory | SftpCommand.Rename | SftpCommand.Remove, path: string, extra = {}) =>
    enqueueRead(
      () =>
        new Promise<void>((resolve, reject) => {
          const id = messageId();
          pendingMutations.set(id, { resolve, reject });
          try {
            send(command, { path, ...extra }, "", id);
          } catch (cause) {
            pendingMutations.delete(id);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );

  const readPath = (path: string, saveAs: boolean, isDir = false) =>
    enqueueRead(
      () =>
        new Promise<Blob>((resolve, reject) => {
          const id = messageId();
          pendingDownloads.set(id, { parts: [], saveAs, resolve, reject });
          try {
            send(SftpCommand.Download, { path, is_dir: isDir }, "", id);
          } catch (cause) {
            pendingDownloads.delete(id);
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        })
    );

  const uploadFile = (file: File, targetPath = pathFor(currentPath.value, file.name)) =>
    enqueueUpload(async () => {
      const chunks = Math.max(1, Math.ceil(file.size / uploadChunkSize));
      const id = String(Date.now());
      const task: UploadTask = { id, name: file.name, progress: 0, status: "queued" };
      uploadTasks.value = [...uploadTasks.value, task];
      try {
        task.status = "uploading";
        for (let index = 0; index < chunks; index++) {
          const bytes = new Uint8Array(await file.slice(index * uploadChunkSize, (index + 1) * uploadChunkSize).arrayBuffer());
          await sendUpload(
            id,
            { offSet: index * uploadChunkSize, size: file.size, path: targetPath, chunk: chunks > 1 },
            bytesToBase64(bytes)
          );
          task.progress = Math.round(((index + 1) / chunks) * 100);
          uploadTasks.value = [...uploadTasks.value];
        }
        if (chunks > 1) await sendUpload(id, { offSet: 0, merge: true, size: 0, path: targetPath });
      } finally {
        uploadTasks.value = uploadTasks.value.filter((item) => item.id !== task.id);
      }
    });

  const operations: SftpFileOperations = {
    listDirectory,
    createDirectory: (name) => mutatePath(SftpCommand.MakeDirectory, pathFor(currentPath.value, name)),
    createDirectoryAt: (path) => mutatePath(SftpCommand.MakeDirectory, path),
    createFileAt: (path) =>
      enqueueRead(() => sendUpload(messageId(), { offSet: 0, size: 0, path, chunk: false })),
    renameEntry: (entry, name) => mutatePath(SftpCommand.Rename, pathFor(currentPath.value, entry.name), { new_name: name }),
    renamePath: (path, name) => mutatePath(SftpCommand.Rename, path, { new_name: name }),
    removeEntry: (entry) => mutatePath(SftpCommand.Remove, pathFor(currentPath.value, entry.name)),
    removePath: (path) => mutatePath(SftpCommand.Remove, path),
    downloadEntry: (entry) => readPath(pathFor(currentPath.value, entry.name), true, entry.is_dir).then(() => undefined),
    downloadPath: (path, isDir) => readPath(path, true, isDir).then(() => undefined),
    readFile: (entry, targetPath) => readPath(targetPath || pathFor(currentPath.value, entry.name), false),
    uploadFile,
    uploadBlob: async (fileName, blob, targetPath) => {
      const file = blob instanceof File ? blob : new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      await uploadFile(file, targetPath || pathFor(currentPath.value, fileName));
    }
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
