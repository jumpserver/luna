import type {
  CreateFileTransferTaskInput,
  FileTransferBatch,
  FileTransferEndpointRef,
  FileTransferStatus,
  FileTransferTask
} from "~/shared/file-transfer/types";
import { finalizeFileTransferChecksum, updateFileTransferChecksum } from "~/shared/file-transfer/checksum";
import { loadFileTransferState, saveFileTransferState } from "~/shared/file-transfer/persistence";
import { getFileTransferEndpoint } from "~/shared/file-transfer/registry";
import { FileTransferUnavailableError } from "~/shared/file-transfer/types";

const resumableStatuses = new Set<FileTransferStatus>(["queued", "preparing", "transferring", "verifying"]);
const terminalStatuses = new Set<FileTransferStatus>(["completed", "skipped", "failed", "canceled"]);
const transferChunkSize = 2 * 1024 * 1024;
const conflictError = "target_exists";

function taskId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export const useFileTransferStore = defineStore("file-transfer", () => {
  const tasks = ref<FileTransferTask[]>([]);
  const batches = ref<FileTransferBatch[]>([]);
  const restored = ref(false);

  const runningEndpoints = new Set<string>();
  const runningTasks = new Map<string, Promise<void>>();

  let persistRequested = false;
  let persisting = false;
  let persistenceWarningShown = false;

  const activeTasks = computed(() => tasks.value.filter((task) => !terminalStatuses.has(task.status)));
  const completedTasks = computed(() => tasks.value.filter((task) => task.status === "completed"));
  const failedTasks = computed(() => tasks.value.filter((task) => task.status === "failed"));
  const conflictTask = computed(
    () => tasks.value.find((task) => task.status === "paused" && task.error === conflictError) || null
  );
  const destinationQueues = computed(() => {
    const queues = new Map<string, FileTransferTask[]>();
    for (const task of activeTasks.value) {
      const queue = queues.get(task.destinationEndpoint.id) || [];
      queue.push(task);
      queues.set(task.destinationEndpoint.id, queue);
    }
    return queues;
  });

  async function flushPersistedState() {
    if (persisting) return;
    persisting = true;
    while (persistRequested) {
      persistRequested = false;
      try {
        await saveFileTransferState({ batches: batches.value, tasks: tasks.value });
        persistenceWarningShown = false;
      } catch (error) {
        if (!persistenceWarningShown) {
          console.warn("Unable to persist file transfer state", error);
          persistenceWarningShown = true;
        }
      }
    }
    persisting = false;
  }

  function schedulePersist() {
    if (!import.meta.client) return;
    persistRequested = true;
    queueMicrotask(() => void flushPersistedState());
  }

  function patchTask(id: string, patch: Partial<FileTransferTask>) {
    const index = tasks.value.findIndex((task) => task.id === id);
    if (index < 0) return;
    const current = tasks.value[index];
    if (!current) return;
    tasks.value[index] = { ...current, ...patch, updatedAt: Date.now() } as FileTransferTask;
    schedulePersist();
  }

  function enqueueBatch(inputs: CreateFileTransferTaskInput[]) {
    const now = Date.now();
    const batchId = inputs[0]?.batchId || taskId();
    const nextTasks = inputs.map<FileTransferTask>((input) => ({
      id: taskId(),
      batchId,
      sourceEndpoint: input.sourceEndpoint,
      destinationEndpoint: input.destinationEndpoint,
      source: input.source,
      destinationPath: input.destinationPath,
      conflictPolicy: input.conflictPolicy,
      status: "queued",
      confirmedBytes: 0,
      checksumState: "",
      createdAt: now,
      updatedAt: now
    }));

    if (!nextTasks.length) return null;
    batches.value = [...batches.value, { id: batchId, taskIds: nextTasks.map((task) => task.id), createdAt: now }];
    tasks.value = [...tasks.value, ...nextTasks];
    schedulePersist();
    kick();
    return batchId;
  }

  function pauseEndpoint(endpoint: FileTransferEndpointRef) {
    for (const task of tasks.value) {
      if (
        !terminalStatuses.has(task.status)
        && (task.sourceEndpoint.id === endpoint.id || task.destinationEndpoint.id === endpoint.id)
      ) {
        patchTask(task.id, { status: "paused" });
      }
    }
  }

  function pauseTask(id: string) {
    const task = tasks.value.find((item) => item.id === id);
    if (!task || terminalStatuses.has(task.status)) return;
    patchTask(id, { status: "paused" });
  }

  function resumeTask(id: string) {
    const task = tasks.value.find((item) => item.id === id);
    if (!task || task.status !== "paused" || task.error === conflictError) return;
    patchTask(id, { status: "queued", error: undefined });
    kick();
  }

  function resolveBatchConflict(batchId: string, conflictPolicy: Exclude<FileTransferTask["conflictPolicy"], "ask">) {
    for (const task of tasks.value) {
      if (task.batchId !== batchId || terminalStatuses.has(task.status)) continue;
      patchTask(task.id, { conflictPolicy, status: "queued", error: undefined });
    }
    kick();
  }

  function markFailed(id: string, error: unknown) {
    patchTask(id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
  }

  async function cancelTask(id: string) {
    const task = tasks.value.find((item) => item.id === id);
    if (!task || terminalStatuses.has(task.status)) return;
    patchTask(id, { status: "canceled", error: undefined });

    const running = runningTasks.get(id);
    if (running) await running;
    if (tasks.value.find((item) => item.id === id)?.status === "completed") return;

    const destination = getFileTransferEndpoint(task.destinationEndpoint.id);
    if (!destination?.isAvailable()) return;

    try {
      await destination.cancelTransfer({ transferId: task.id, targetPath: targetPath(task), discard: true });
    } catch (error) {
      patchTask(id, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function cancelBatch(batchId: string) {
    const taskIds = tasks.value
      .filter((task) => task.batchId === batchId && !terminalStatuses.has(task.status))
      .map((task) => task.id);

    await Promise.all(taskIds.map((id) => cancelTask(id)));
  }

  function clearFinished() {
    const finished = new Set(tasks.value.filter((task) => terminalStatuses.has(task.status)).map((task) => task.id));
    if (!finished.size) return;
    tasks.value = tasks.value.filter((task) => !finished.has(task.id));
    batches.value = batches.value.filter((batch) => batch.taskIds.some((id) => !finished.has(id)));
    schedulePersist();
  }

  async function restore() {
    if (restored.value) return;
    restored.value = true;
    const persisted = await loadFileTransferState();
    if (!persisted) return;
    batches.value = persisted.batches;
    tasks.value = persisted.tasks.map((task) =>
      resumableStatuses.has(task.status) ? { ...task, status: "paused" as const, updatedAt: Date.now() } : task
    );
    schedulePersist();
  }

  function targetPath(task: FileTransferTask) {
    const base = task.destinationPath.replace(/\/$/, "");
    return `${base || "/"}/${task.source.name}`.replace(/\/+/g, "/");
  }

  function taskStopped(id: string) {
    const status = tasks.value.find((task) => task.id === id)?.status;
    return status === "paused" || status === "canceled";
  }

  async function notifyCommitted(
    destination: NonNullable<ReturnType<typeof getFileTransferEndpoint>>,
    currentTargetPath: string
  ) {
    try {
      await destination.onTransferCommitted?.({ targetPath: currentTargetPath });
    } catch {
      // A committed transfer remains successful even if its visible directory
      // cannot be refreshed. The next manual refresh will reconcile the list.
    }
  }

  async function runTask(taskId: string) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (!task || task.status !== "queued") return;
    const source = getFileTransferEndpoint(task.sourceEndpoint.id);
    const destination = getFileTransferEndpoint(task.destinationEndpoint.id);
    if (!source?.isAvailable() || !destination?.isAvailable()) {
      patchTask(task.id, { status: "paused", error: new FileTransferUnavailableError().message });
      return;
    }

    try {
      patchTask(task.id, { status: "preparing", error: undefined });
      const currentTargetPath = targetPath(task);
      const prepareInput = {
        transferId: task.id,
        targetPath: currentTargetPath,
        fileName: task.source.name,
        size: task.source.size,
        conflictPolicy: task.conflictPolicy
      };
      let prepared = await destination.prepareTransfer(prepareInput);

      if (taskStopped(task.id)) return;
      if (prepared.state === "skipped") {
        patchTask(task.id, { status: "skipped", confirmedBytes: prepared.committedBytes });
        return;
      }
      if (prepared.state === "conflict") {
        for (const batchTask of tasks.value) {
          if (batchTask.batchId === task.batchId && !terminalStatuses.has(batchTask.status)) {
            patchTask(batchTask.id, { status: "paused", error: conflictError });
          }
        }
        return;
      }
      if (prepared.state === "completed") {
        patchTask(task.id, { status: "completed", confirmedBytes: prepared.totalBytes });
        await notifyCommitted(destination, currentTargetPath);
        return;
      }
      if (prepared.state !== "ready" || prepared.totalBytes !== task.source.size) {
        throw new Error("Invalid file transfer preparation response");
      }

      const checksumAligned
        = prepared.committedBytes === task.confirmedBytes
          && (prepared.committedBytes === 0 || Boolean(task.checksumState));
      if (!checksumAligned) {
        await destination.cancelTransfer({
          transferId: task.id,
          targetPath: currentTargetPath,
          discard: true
        });
        prepared = await destination.prepareTransfer(prepareInput);
        if (prepared.state !== "ready" || prepared.committedBytes !== 0 || prepared.totalBytes !== task.source.size) {
          throw new Error("Unable to restart inconsistent file transfer state");
        }
      }

      let offset = prepared.committedBytes;
      let checksumState = offset === 0 ? "" : task.checksumState;
      patchTask(task.id, { status: "transferring", confirmedBytes: offset, checksumState });

      while (offset < task.source.size) {
        const current = tasks.value.find((item) => item.id === task.id);
        if (!current || current.status === "paused" || current.status === "canceled") return;
        if (!source.isAvailable() || !destination.isAvailable()) throw new FileTransferUnavailableError();

        const chunk = await source.readChunk({
          transferId: task.id,
          path: task.source.path,
          offset,
          length: Math.min(transferChunkSize, task.source.size - offset)
        });
        if (taskStopped(task.id)) return;
        if (chunk.offset !== offset || !chunk.data.length || chunk.data.length > task.source.size - offset) {
          throw new Error("Invalid file transfer chunk response");
        }

        const checksum = await updateFileTransferChecksum(checksumState, chunk.data);
        if (taskStopped(task.id)) return;
        if (checksum.chunkChecksum !== chunk.sha256) throw new Error("Source file transfer chunk checksum mismatch");

        const ack = await destination.writeChunk({
          transferId: task.id,
          targetPath: currentTargetPath,
          totalBytes: task.source.size,
          offset,
          data: chunk.data,
          sha256: checksum.chunkChecksum
        });
        if (taskStopped(task.id)) return;
        if (ack.committedBytes < offset + chunk.data.length || ack.committedBytes > task.source.size) {
          throw new Error("Invalid file transfer write acknowledgement");
        }
        offset = ack.committedBytes;
        checksumState = checksum.state;
        patchTask(task.id, { confirmedBytes: offset, checksumState });
      }

      if (taskStopped(task.id)) return;
      patchTask(task.id, { status: "verifying" });
      const checksum = await finalizeFileTransferChecksum(checksumState);
      if (taskStopped(task.id)) return;
      await destination.commitTransfer({
        transferId: task.id,
        targetPath: currentTargetPath,
        totalBytes: task.source.size,
        sha256: checksum,
        conflictPolicy: task.conflictPolicy
      });
      patchTask(task.id, { status: "completed", confirmedBytes: task.source.size, checksum });
      await notifyCommitted(destination, currentTargetPath);
    } catch (error) {
      if (tasks.value.find((item) => item.id === task.id)?.status === "canceled") return;

      if (error instanceof FileTransferUnavailableError) {
        patchTask(task.id, { status: "paused", error: error.message });
      } else {
        markFailed(task.id, error);
      }
    }
  }

  function kick() {
    for (const queue of destinationQueues.value.values()) {
      const next = queue.find(
        (task) =>
          task.status === "queued"
          && !runningEndpoints.has(task.sourceEndpoint.id)
          && !runningEndpoints.has(task.destinationEndpoint.id)
      );
      if (!next) continue;

      runningEndpoints.add(next.sourceEndpoint.id);
      runningEndpoints.add(next.destinationEndpoint.id);

      const execution = runTask(next.id);
      runningTasks.set(next.id, execution);

      void execution.finally(() => {
        if (runningTasks.get(next.id) === execution) runningTasks.delete(next.id);

        runningEndpoints.delete(next.sourceEndpoint.id);
        runningEndpoints.delete(next.destinationEndpoint.id);

        kick();
      });
    }
  }

  return {
    tasks,
    batches,
    restored,
    activeTasks,
    completedTasks,
    failedTasks,
    conflictTask,
    destinationQueues,
    enqueueBatch,
    patchTask,
    pauseEndpoint,
    pauseTask,
    resumeTask,
    resolveBatchConflict,
    cancelBatch,
    markFailed,
    cancelTask,
    clearFinished,
    restore,
    kick
  };
});
