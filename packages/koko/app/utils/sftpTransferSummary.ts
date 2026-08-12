import type { FileTransferStatus, FileTransferTask } from "~/shared/file-transfer/types";

const terminalStatuses = new Set<FileTransferStatus>(["completed", "skipped", "failed", "canceled"]);
export type SftpTransferGroupStatus = FileTransferStatus | "partial";

export function finishedTransferCount(tasks: FileTransferTask[]) {
  return tasks.filter((task) => terminalStatuses.has(task.status)).length;
}

function groupByTarget(tasks: FileTransferTask[]) {
  const targets = new Map<string, FileTransferTask[]>();
  for (const task of tasks) {
    const targetTasks = targets.get(task.destinationEndpoint.id) || [];
    targetTasks.push(task);
    targets.set(task.destinationEndpoint.id, targetTasks);
  }
  return [...targets.values()];
}

export function completedTargetCount(tasks: FileTransferTask[]) {
  return groupByTarget(tasks).filter((targetTasks) =>
    targetTasks.every((task) => task.status === "completed" || task.status === "skipped")
  ).length;
}

export function failedTargetCount(tasks: FileTransferTask[]) {
  return groupByTarget(tasks).filter((targetTasks) => targetTasks.some((task) => task.status === "failed")).length;
}

export function sftpTransferProgress(tasks: FileTransferTask[]) {
  if (!tasks.length) return 0;
  const totalBytes = tasks.reduce((sum, task) => sum + task.source.size, 0);
  if (!totalBytes) return 0;
  const confirmedBytes = tasks.reduce(
    (sum, task) => sum + (task.status === "skipped" ? task.source.size : task.confirmedBytes),
    0
  );
  return Math.min(100, Math.round((confirmedBytes / totalBytes) * 100));
}

export function sftpTransferGroupStatus(tasks: FileTransferTask[]): SftpTransferGroupStatus {
  if (!tasks.length) return "queued";
  if (tasks.some((task) => task.status === "transferring")) return "transferring";
  if (tasks.some((task) => task.status === "verifying")) return "verifying";
  if (tasks.some((task) => task.status === "preparing")) return "preparing";
  if (tasks.some((task) => task.status === "queued")) return "queued";
  if (tasks.some((task) => task.status === "paused")) return "paused";
  const statuses = new Set(tasks.map((task) => task.status));
  if ([...statuses].every((status) => status === "completed" || status === "skipped")) {
    return statuses.has("completed") ? "completed" : "skipped";
  }
  if (statuses.size > 1) return "partial";
  return tasks[0]?.status || "queued";
}
