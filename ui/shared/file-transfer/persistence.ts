import type { FileTransferBatch, FileTransferTask } from "./types";

const databaseName = "jumpserver-file-transfer";
const storeName = "tasks";
const recordKey = "state";

export interface PersistedFileTransferState {
  batches: FileTransferBatch[];
  tasks: FileTransferTask[];
}

function createPersistedSnapshot(state: PersistedFileTransferState): PersistedFileTransferState {
  return {
    batches: state.batches.map((batch) => ({
      id: batch.id,
      taskIds: [...batch.taskIds],
      createdAt: batch.createdAt
    })),
    tasks: state.tasks.map((task) => ({
      id: task.id,
      batchId: task.batchId,
      sourceEndpoint: { ...task.sourceEndpoint },
      destinationEndpoint: { ...task.destinationEndpoint },
      source: { ...task.source },
      destinationPath: task.destinationPath,
      conflictPolicy: task.conflictPolicy,
      status: task.status,
      confirmedBytes: task.confirmedBytes,
      checksumState: task.checksumState,
      checksum: task.checksum,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }))
  };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open file transfer storage"));
  });
}

export async function loadFileTransferState(): Promise<PersistedFileTransferState | null> {
  if (!import.meta.client || !globalThis.indexedDB) return null;
  const database = await openDatabase();
  try {
    return await new Promise<PersistedFileTransferState | null>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
      request.onsuccess = () => resolve((request.result as PersistedFileTransferState | undefined) || null);
      request.onerror = () => reject(request.error || new Error("Unable to read file transfer storage"));
    });
  } finally {
    database.close();
  }
}

export async function saveFileTransferState(state: PersistedFileTransferState) {
  if (!import.meta.client || !globalThis.indexedDB) return;
  const snapshot = createPersistedSnapshot(state);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(snapshot, recordKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Unable to save file transfer storage"));
    });
  } finally {
    database.close();
  }
}
