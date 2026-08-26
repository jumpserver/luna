import type { FileTransferStatus, FileTransferTask } from "@jumpserver/connectors-core";
import { describe, expect, it } from "vitest";
import { ref } from "vue";
import {
  batchHasFailedTasks,
  canPauseTransferTasks,
  canResumeTransferTasks,
  countActiveTransferTargets,
  filterSftpTransferTasks,
  getTargetTransferError,
  groupSftpTransferBatches,
  hasFinishedTransferTasks,
  selectSftpTransferTasks,
  targetHasConflictTasks,
  useSftpTransferCenterSelectors
} from "#koko/composables/sftp/file-manager/transfer-center/useSftpTransferCenterSelectors";

function createTask(
  id: string,
  status: FileTransferStatus,
  overrides: Partial<FileTransferTask> = {}
): FileTransferTask {
  return {
    id,
    batchId: overrides.batchId ?? "batch-1",
    sourceEndpoint: overrides.sourceEndpoint ?? { id: "sftp:source", label: "Source" },
    destinationEndpoint: overrides.destinationEndpoint ?? { id: "sftp:target-1", label: "Target 1" },
    source: overrides.source ?? { name: `${id}.txt`, path: `/${id}.txt`, size: 100 },
    destinationPath: overrides.destinationPath ?? "/dest",
    conflictPolicy: overrides.conflictPolicy ?? "ask",
    status,
    confirmedBytes: overrides.confirmedBytes ?? 0,
    checksumState: overrides.checksumState ?? "",
    checksum: overrides.checksum,
    error: overrides.error,
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 1000
  };
}

describe("sftp transfer center selectors", () => {
  it("keeps only SFTP tasks and counts active targets by unique destination", () => {
    const tasks = [
      createTask("queued-a", "queued"),
      createTask("transferring-b", "transferring", {
        destinationEndpoint: { id: "sftp:target-2", label: "Target 2" }
      }),
      createTask("done-c", "completed", {
        destinationEndpoint: { id: "sftp:target-2", label: "Target 2" }
      }),
      createTask("web-d", "queued", {
        sourceEndpoint: { id: "web-upload", label: "Web Upload" },
        destinationEndpoint: { id: "local:desktop", label: "Desktop" }
      })
    ];

    const sftpTasks = selectSftpTransferTasks(tasks);

    expect(sftpTasks.map((task) => task.id)).toEqual(["queued-a", "transferring-b", "done-c"]);
    expect(countActiveTransferTargets(sftpTasks)).toBe(2);
    expect(hasFinishedTransferTasks(sftpTasks)).toBe(true);
  });

  it("filters tasks by transfer-center status tabs", () => {
    const tasks = [
      createTask("queued-a", "queued"),
      createTask("failed-b", "failed"),
      createTask("completed-c", "completed"),
      createTask("canceled-d", "canceled")
    ];

    expect(filterSftpTransferTasks(tasks, "all").map((task) => task.id)).toEqual([
      "queued-a",
      "failed-b",
      "completed-c",
      "canceled-d"
    ]);
    expect(filterSftpTransferTasks(tasks, "active").map((task) => task.id)).toEqual(["queued-a"]);
    expect(filterSftpTransferTasks(tasks, "failed").map((task) => task.id)).toEqual(["failed-b"]);
    expect(filterSftpTransferTasks(tasks, "completed").map((task) => task.id)).toEqual(["completed-c"]);
    expect(filterSftpTransferTasks(tasks, "canceled").map((task) => task.id)).toEqual(["canceled-d"]);
  });

  it("groups filtered display tasks without losing full-batch status context", () => {
    const tasks = [
      createTask("completed-a", "completed", {
        batchId: "batch-1::target::alpha",
        destinationEndpoint: { id: "sftp:alpha", label: "Alpha" },
        createdAt: 1000
      }),
      createTask("failed-b", "failed", {
        batchId: "batch-1::target::beta",
        destinationEndpoint: { id: "sftp:beta", label: "Beta" },
        createdAt: 1100,
        error: "permission denied"
      }),
      createTask("completed-c", "completed", {
        batchId: "batch-2",
        destinationEndpoint: { id: "sftp:gamma", label: "Gamma" },
        createdAt: 2000
      })
    ];

    const completedOnly = filterSftpTransferTasks(tasks, "completed");
    const batches = groupSftpTransferBatches(tasks, completedOnly);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.id).toBe("batch-2");
    expect(batches[1]?.id).toBe("batch-1");
    expect(batches[1]?.displayTasks.map((task) => task.id)).toEqual(["completed-a"]);
    expect(batches[1]?.tasks.map((task) => task.id)).toEqual(["completed-a", "failed-b"]);
    expect(batches[1]?.targets.map((target) => target.endpointId)).toEqual(["sftp:alpha"]);
    expect(batchHasFailedTasks(batches[1]!.tasks)).toBe(true);
  });

  it("derives pause, resume, conflict, and target error states from task collections", () => {
    const pausedConflict = createTask("paused-conflict", "paused", { error: "target_exists" });
    const pausedReady = createTask("paused-ready", "paused");
    const queuedTask = createTask("queued-a", "queued");
    const failedTask = createTask("failed-a", "failed", { error: "disk full" });

    expect(canPauseTransferTasks([queuedTask])).toBe(true);
    expect(canPauseTransferTasks([pausedReady])).toBe(false);
    expect(canResumeTransferTasks([pausedReady])).toBe(true);
    expect(canResumeTransferTasks([pausedReady, queuedTask])).toBe(false);
    expect(canResumeTransferTasks([pausedConflict])).toBe(false);
    expect(targetHasConflictTasks([pausedConflict])).toBe(true);
    expect(getTargetTransferError([pausedConflict])).toBe("target_exists");
    expect(getTargetTransferError([failedTask, pausedConflict])).toBe("disk full");
  });

  it("keeps computed selector output reactive inside the composable", () => {
    const tasks = ref<FileTransferTask[]>([
      createTask("queued-a", "queued", { createdAt: 1000 }),
      createTask("failed-b", "failed", {
        batchId: "batch-1::target::beta",
        destinationEndpoint: { id: "sftp:beta", label: "Beta" },
        createdAt: 1001,
        error: "permission denied"
      }),
      createTask("done-c", "completed", {
        batchId: "batch-2",
        destinationEndpoint: { id: "sftp:gamma", label: "Gamma" },
        createdAt: 2000
      })
    ]);
    const filter = ref<"all" | "active" | "failed" | "completed" | "canceled">("all");

    const selectors = useSftpTransferCenterSelectors({ tasks, filter });

    expect(selectors.activeCount.value).toBe(1);
    expect(selectors.batches.value.map((batch) => batch.id)).toEqual(["batch-2", "batch-1"]);

    filter.value = "failed";

    expect(selectors.batches.value).toHaveLength(1);
    expect(selectors.batches.value[0]?.displayTasks.map((task) => task.id)).toEqual(["failed-b"]);
    expect(selectors.batches.value[0]?.tasks.map((task) => task.id)).toEqual(["queued-a", "failed-b"]);
  });
});
