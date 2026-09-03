import type { FileTransferStatus, FileTransferTask } from "@jumpserver/connectors-core";
import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

export interface SftpTransferTargetGroup {
  endpointId: string;
  label: string;
  destinationPath: string;
  tasks: FileTransferTask[];
  allTasks: FileTransferTask[];
}

export interface SftpTransferBatchGroup {
  id: string;
  batchIds: string[];
  sourceLabel: string;
  createdAt: number;
  targets: SftpTransferTargetGroup[];
  tasks: FileTransferTask[];
  displayTasks: FileTransferTask[];
  targetCount: number;
}

export type SftpTransferTaskFilter = "all" | "active" | "failed" | "completed" | "canceled";

export const sftpTransferConflictError = "target_exists";
export const sftpTransferEndpointUnavailableError = "endpoint_unavailable";
export const sftpTransferTerminalStatuses = new Set<FileTransferStatus>(["completed", "skipped", "failed", "canceled"]);

export function selectSftpTransferTasks(tasks: FileTransferTask[] | null | undefined): FileTransferTask[] {
  return (tasks ?? []).filter(
    (task) => task.sourceEndpoint.id.startsWith("sftp:") || task.destinationEndpoint.id.startsWith("sftp:")
  );
}

export function filterSftpTransferTasks(tasks: FileTransferTask[], filter: SftpTransferTaskFilter): FileTransferTask[] {
  const list = tasks ?? [];
  if (filter === "active") return list.filter((task) => !sftpTransferTerminalStatuses.has(task.status));
  if (filter === "failed") return list.filter((task) => task.status === "failed");
  if (filter === "completed") return list.filter((task) => task.status === "completed");
  if (filter === "canceled") return list.filter((task) => task.status === "canceled");
  return list;
}

export function countActiveTransferTargets(tasks: FileTransferTask[]): number {
  return new Set(
    tasks.filter((task) => !sftpTransferTerminalStatuses.has(task.status)).map((task) => task.destinationEndpoint.id)
  ).size;
}

export function hasFinishedTransferTasks(tasks: FileTransferTask[]): boolean {
  return tasks.some((task) => sftpTransferTerminalStatuses.has(task.status));
}

function toBatchGroupId(batchId: string): string {
  const separatorIndex = batchId.indexOf("::target::");
  return separatorIndex >= 0 ? batchId.slice(0, separatorIndex) : batchId;
}

export function groupSftpTransferBatches(
  allTasks: FileTransferTask[],
  displayTasks: FileTransferTask[]
): SftpTransferBatchGroup[] {
  const groups = new Map<string, FileTransferTask[]>();
  const displayTaskIds = new Set((displayTasks ?? []).map((task) => task.id));

  for (const task of allTasks ?? []) {
    const groupId = toBatchGroupId(task.batchId);
    const groupedTasks = groups.get(groupId) || [];
    groupedTasks.push(task);
    groups.set(groupId, groupedTasks);
  }

  return [...groups.entries()]
    .map(([id, batchTasks]) => {
      const filteredDisplayTasks = batchTasks.filter((task) => displayTaskIds.has(task.id));
      if (!filteredDisplayTasks.length) return null;

      const targetMap = new Map<string, FileTransferTask[]>();
      for (const task of filteredDisplayTasks) {
        const targetTasks = targetMap.get(task.destinationEndpoint.id) || [];
        targetTasks.push(task);
        targetMap.set(task.destinationEndpoint.id, targetTasks);
      }

      return {
        id,
        batchIds: [...new Set(batchTasks.map((task) => task.batchId))],
        sourceLabel: batchTasks[0]?.sourceEndpoint.label || "SFTP",
        createdAt: Math.min(...batchTasks.map((task) => task.createdAt)),
        tasks: batchTasks,
        displayTasks: filteredDisplayTasks,
        targetCount: new Set(batchTasks.map((task) => task.destinationEndpoint.id)).size,
        targets: [...targetMap.entries()].map(([endpointId, targetTasks]) => ({
          endpointId,
          label: targetTasks[0]?.destinationEndpoint.label || endpointId,
          destinationPath: targetTasks[0]?.destinationPath || "/",
          tasks: targetTasks,
          allTasks: batchTasks.filter((task) => task.destinationEndpoint.id === endpointId)
        }))
      };
    })
    .filter((batch): batch is SftpTransferBatchGroup => batch !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function canPauseTransferTasks(tasks: FileTransferTask[]): boolean {
  return tasks.some((task) => !sftpTransferTerminalStatuses.has(task.status) && task.status !== "paused");
}

export function canResumeTransferTasks(tasks: FileTransferTask[], conflictError = sftpTransferConflictError): boolean {
  const resumableTasks = tasks.filter(
    (task) => !sftpTransferTerminalStatuses.has(task.status) && task.error !== conflictError
  );
  return resumableTasks.length > 0 && resumableTasks.every((task) => task.status === "paused");
}

export function batchHasFailedTasks(tasks: FileTransferTask[]): boolean {
  return tasks.some((task) => task.status === "failed");
}

export function canRetryTransferTask(task: FileTransferTask): boolean {
  return task.status === "failed" && task.error !== sftpTransferEndpointUnavailableError;
}

export function sftpTransferErrorText(error: string | undefined, translate: (key: string) => string): string {
  if (!error) return "";
  if (error === sftpTransferEndpointUnavailableError) return translate("FileTransfer.EndpointUnavailable");
  return error;
}

export function targetHasConflictTasks(tasks: FileTransferTask[], conflictError = sftpTransferConflictError): boolean {
  return tasks.some((task) => task.status === "paused" && task.error === conflictError);
}

export function getTargetTransferError(
  tasks: FileTransferTask[],
  conflictError = sftpTransferConflictError
): string | null {
  const failedTask = tasks.find((task) => task.status === "failed" && task.error);
  if (failedTask?.error) return failedTask.error;

  const conflictTask = tasks.find((task) => task.status === "paused" && task.error === conflictError);
  if (conflictTask) return conflictError;

  return null;
}

export function useSftpTransferCenterSelectors(options: {
  tasks: MaybeRefOrGetter<FileTransferTask[]>;
  filter: MaybeRefOrGetter<SftpTransferTaskFilter>;
}) {
  const sftpTasks = computed(() => selectSftpTransferTasks(toValue(options.tasks)));
  const visibleTasks = computed(() => filterSftpTransferTasks(sftpTasks.value, toValue(options.filter)));
  const batches = computed(() => groupSftpTransferBatches(sftpTasks.value, visibleTasks.value));
  const activeCount = computed(() => countActiveTransferTargets(sftpTasks.value));
  const hasFinishedTasks = computed(() => hasFinishedTransferTasks(sftpTasks.value));

  return {
    sftpTasks,
    visibleTasks,
    batches,
    activeCount,
    hasFinishedTasks
  };
}
