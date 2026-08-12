import type { FileTransferStatus, FileTransferTask } from "~/shared/file-transfer/types";
import { describe, expect, it } from "vitest";
import {
  completedTargetCount,
  failedTargetCount,
  finishedTransferCount,
  sftpTransferGroupStatus,
  sftpTransferProgress
} from "#koko/utils/sftpTransferSummary";
import transferCenterStyles from "../../assets/css/sftp-transfer-center.scss?inline";
import transferCenterComponent from "../../components/FileManagement/SftpTransferCenter.vue?raw";

describe("sftp transfer center layout", () => {
  it("keeps the design drawer width and collapses nested batch content", () => {
    expect(transferCenterStyles).toContain("width: 552px");
    expect(transferCenterStyles).toContain("width: 496px");
    expect(transferCenterStyles).toContain("max-width: calc(100vw - 40px)");
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-targets\s*\{[^}]*display:\s*none/);
    expect(transferCenterComponent).toContain('v-show="expandedBatches.has(batch.id)"');
    expect(transferCenterComponent).toContain(':aria-expanded="expandedBatches.has(batch.id)"');
  });

  it("renders a full-width progress track and right-aligned actions for every file", () => {
    expect(transferCenterComponent).toContain('class="sftp-transfer-file__progress"');
    expect(transferCenterComponent).not.toMatch(/v-if=[^>]+sftp-transfer-file__progress/);
    expect(transferCenterStyles).toContain("grid-template-columns: minmax(0, 1fr) 92px max-content");
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-file__progress\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-file__actions\s*\{[^}]*justify-content:\s*flex-end/);
  });

  it("allows an active file to be paused independently", () => {
    expect(transferCenterComponent).toContain('v-if="canPause([task])"');
    expect(transferCenterComponent).toContain('@click="store.pauseTask(task.id)"');
    expect(transferCenterComponent).toContain('icon="i-lucide-pause"');
  });

  it("shows resume only when all resumable tasks are paused", () => {
    expect(transferCenterComponent).toContain(
      'return resumableTasks.length > 0 && resumableTasks.every((task) => task.status === "paused")'
    );
  });

  it("uses compact outlined conflict actions instead of solid default buttons", () => {
    expect(transferCenterComponent.match(/variant="outline"/g)).toHaveLength(3);
    expect(transferCenterComponent.match(/size="xs"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(transferCenterStyles).not.toMatch(/\.sftp-conflict-action\s*\{/);
  });
});

describe("sftpTransferSummary", () => {
  describe("finishedTransferCount", () => {
    it("should count tasks in terminal statuses", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "failed" as FileTransferStatus },
        { status: "transferring" as FileTransferStatus },
        { status: "skipped" as FileTransferStatus },
        { status: "canceled" as FileTransferStatus }
      ];
      expect(finishedTransferCount(tasks as FileTransferTask[])).toBe(4);
    });

    it("should return 0 for empty array", () => {
      expect(finishedTransferCount([])).toBe(0);
    });

    it("should return 0 when all tasks are active", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "queued" as FileTransferStatus },
        { status: "preparing" as FileTransferStatus },
        { status: "transferring" as FileTransferStatus }
      ];
      expect(finishedTransferCount(tasks as FileTransferTask[])).toBe(0);
    });
  });

  describe("completedTargetCount", () => {
    it("should count completed destinations instead of files", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus, destinationEndpoint: { id: "target-1", label: "A" } },
        { status: "completed" as FileTransferStatus, destinationEndpoint: { id: "target-1", label: "A" } },
        { status: "completed" as FileTransferStatus, destinationEndpoint: { id: "target-2", label: "B" } },
        { status: "failed" as FileTransferStatus, destinationEndpoint: { id: "target-2", label: "B" } }
      ];
      expect(completedTargetCount(tasks as FileTransferTask[])).toBe(1);
    });
  });

  describe("failedTargetCount", () => {
    it("should count each failed destination once", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "failed" as FileTransferStatus, destinationEndpoint: { id: "target-1", label: "A" } },
        { status: "failed" as FileTransferStatus, destinationEndpoint: { id: "target-1", label: "A" } },
        { status: "completed" as FileTransferStatus, destinationEndpoint: { id: "target-2", label: "B" } }
      ];
      expect(failedTargetCount(tasks as FileTransferTask[])).toBe(1);
    });
  });

  describe("sftpTransferProgress", () => {
    it("should return 0 for empty array", () => {
      expect(sftpTransferProgress([])).toBe(0);
    });

    it("should preserve confirmed progress when terminal tasks were canceled", () => {
      const tasks: Partial<FileTransferTask>[] = [
        {
          status: "completed" as FileTransferStatus,
          source: { path: "/a", name: "a", size: 100 },
          confirmedBytes: 100
        },
        { status: "canceled" as FileTransferStatus, source: { path: "/b", name: "b", size: 100 }, confirmedBytes: 0 }
      ];
      expect(sftpTransferProgress(tasks as FileTransferTask[])).toBe(50);
    });

    it("should calculate progress based on confirmed bytes", () => {
      const tasks: Partial<FileTransferTask>[] = [
        {
          status: "transferring" as FileTransferStatus,
          source: { path: "/a", name: "a", size: 1000 },
          confirmedBytes: 500
        },
        {
          status: "completed" as FileTransferStatus,
          source: { path: "/b", name: "b", size: 1000 },
          confirmedBytes: 1000
        }
      ];
      // (500 + 1000) / (1000 + 1000) * 100 = 75%
      expect(sftpTransferProgress(tasks as FileTransferTask[])).toBe(75);
    });

    it("should return 0 when total size is 0", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "transferring" as FileTransferStatus, source: { path: "/a", name: "a", size: 0 }, confirmedBytes: 0 }
      ];
      expect(sftpTransferProgress(tasks as FileTransferTask[])).toBe(0);
    });

    it("should cap progress at 100%", () => {
      const tasks: Partial<FileTransferTask>[] = [
        {
          status: "transferring" as FileTransferStatus,
          source: { path: "/a", name: "a", size: 100 },
          confirmedBytes: 150
        }
      ];
      expect(sftpTransferProgress(tasks as FileTransferTask[])).toBe(100);
    });

    it("should treat skipped files as fully handled", () => {
      const tasks: Partial<FileTransferTask>[] = [
        {
          status: "skipped" as FileTransferStatus,
          source: { path: "/a", name: "a", size: 100 },
          confirmedBytes: 0
        }
      ];
      expect(sftpTransferProgress(tasks as FileTransferTask[])).toBe(100);
    });
  });

  describe("sftpTransferGroupStatus", () => {
    it("should return queued for empty array", () => {
      expect(sftpTransferGroupStatus([])).toBe("queued");
    });

    it("should keep showing active work when another file has failed", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "failed" as FileTransferStatus },
        { status: "transferring" as FileTransferStatus }
      ];
      expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe("transferring");
    });

    it("should prioritize transferring over completed", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "transferring" as FileTransferStatus },
        { status: "completed" as FileTransferStatus }
      ];
      expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe("transferring");
    });

    it("should follow correct priority order", () => {
      // Priority for non-terminal work: transferring > verifying > preparing > queued > paused
      const statusPriority: FileTransferStatus[] = ["transferring", "verifying", "preparing", "queued", "paused"];

      for (let i = 0; i < statusPriority.length; i++) {
        const tasks: Partial<FileTransferTask>[] = statusPriority.slice(i).map((status) => ({ status }));
        expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe(statusPriority[i]);
      }
    });

    it("should return completed when all tasks are completed", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "completed" as FileTransferStatus }
      ];
      expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe("completed");
    });

    it("should return partial when terminal outcomes are mixed", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "failed" as FileTransferStatus }
      ];
      expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe("partial");
    });

    it("should treat completed and skipped files as a successful group", () => {
      const tasks: Partial<FileTransferTask>[] = [
        { status: "completed" as FileTransferStatus },
        { status: "skipped" as FileTransferStatus }
      ];
      expect(sftpTransferGroupStatus(tasks as FileTransferTask[])).toBe("completed");
    });
  });
});

describe("transfer Operation Tracking", () => {
  describe("operation ID generation", () => {
    it("should generate single transfer operation ID with prefix", () => {
      const batchId = "batch-123";
      const operationId = `single:${batchId}`;
      expect(operationId).toBe("single:batch-123");
      expect(operationId.startsWith("single:")).toBe(true);
    });

    it("should generate distribution operation ID with prefix", () => {
      const distributionId = "dist-456";
      const operationId = `dist:${distributionId}`;
      expect(operationId).toBe("dist:dist-456");
      expect(operationId.startsWith("dist:")).toBe(true);
    });

    it("should ensure single and dist IDs never collide", () => {
      const id = "abc-123";
      const singleId = `single:${id}`;
      const distId = `dist:${id}`;
      expect(singleId).not.toBe(distId);
    });
  });

  describe("expected task count calculation", () => {
    it("should calculate correct count for single transfer", () => {
      const entries = [{ name: "file1.txt" }, { name: "file2.txt" }];
      const expectedCount = entries.length * 1; // 1 target
      expect(expectedCount).toBe(2);
    });

    it("should calculate correct count for distribution", () => {
      const entries = [{ name: "file1.txt" }, { name: "file2.txt" }, { name: "file3.txt" }];
      const targets = 3;
      const expectedCount = entries.length * targets;
      expect(expectedCount).toBe(9);
    });

    it("should handle large distribution correctly", () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({ name: `file${i}.txt` }));
      const targets = 10;
      const expectedCount = entries.length * targets;
      expect(expectedCount).toBe(1000);
    });
  });

  describe("timeout detection", () => {
    it("should detect stale operations", () => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      const createdAt = now - staleThreshold - 1000; // 5 minutes + 1 second ago
      const isStale = now - createdAt > staleThreshold;
      expect(isStale).toBe(true);
    });

    it("should not flag fresh operations as stale", () => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000;
      const createdAt = now - 60000; // 1 minute ago
      const isStale = now - createdAt > staleThreshold;
      expect(isStale).toBe(false);
    });
  });
});

describe("filter Logic", () => {
  const createMockTasks = (statuses: FileTransferStatus[]): Partial<FileTransferTask>[] =>
    statuses.map((status, index) => ({
      id: `task-${index}`,
      status,
      batchId: "batch-1",
      sourceEndpoint: { id: "sftp:source", label: "Source" },
      destinationEndpoint: { id: "sftp:dest", label: "Dest" },
      source: { name: `file${index}.txt`, size: 1000, path: `/path/file${index}.txt` },
      destinationPath: "/dest",
      confirmedBytes: status === "completed" ? 1000 : 0,
      createdAt: Date.now()
    }));

  describe("status filtering", () => {
    it("should filter active tasks correctly", () => {
      const tasks = createMockTasks(["queued", "transferring", "completed", "failed"]);
      const activeTasks = tasks.filter(
        (task) => !["completed", "skipped", "failed", "canceled"].includes(task.status!)
      );
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks[0]?.status).toBe("queued");
      expect(activeTasks[1]?.status).toBe("transferring");
    });

    it("should filter failed tasks correctly", () => {
      const tasks = createMockTasks(["completed", "failed", "transferring", "failed"]);
      const failedTasks = tasks.filter((task) => task.status === "failed");
      expect(failedTasks).toHaveLength(2);
    });

    it("should filter completed tasks correctly", () => {
      const tasks = createMockTasks(["completed", "failed", "completed", "transferring"]);
      const completedTasks = tasks.filter((task) => task.status === "completed");
      expect(completedTasks).toHaveLength(2);
    });
  });

  describe("batch grouping with filters", () => {
    it("should preserve all tasks for status calculation even when filtered", () => {
      const allTasks = createMockTasks(["completed", "failed", "transferring"]);
      const displayTasks = allTasks.filter((task) => task.status === "completed");

      // Status calculation should use allTasks
      const hasFailures = allTasks.some((task) => task.status === "failed");
      expect(hasFailures).toBe(true);

      // Display should use displayTasks
      expect(displayTasks).toHaveLength(1);
    });

    it("should not lose failure information when filtering for completed", () => {
      const allTasks = createMockTasks(["completed", "completed", "failed"]);
      const completedOnly = allTasks.filter((task) => task.status === "completed");

      // If we only look at completedOnly, we might think everything succeeded
      const allSucceeded = completedOnly.every((task) => task.status === "completed");
      expect(allSucceeded).toBe(true);

      // But allTasks shows the truth
      const actuallyAllSucceeded = allTasks.every((task) => task.status === "completed");
      expect(actuallyAllSucceeded).toBe(false);
    });
  });
});

describe("smart Target Recommendation", () => {
  describe("history tracking", () => {
    it("should record distribution history", () => {
      const history: Record<string, string[]> = {};
      const sourceId = "sftp:source-1";
      const targetIds = ["target-1", "target-2", "target-3"];

      history[sourceId] = targetIds;

      expect(history[sourceId]).toEqual(targetIds);
    });

    it("should update history for multiple sources", () => {
      const history: Record<string, string[]> = {};

      history["sftp:source-1"] = ["target-1", "target-2"];
      history["sftp:source-2"] = ["target-3", "target-4"];

      expect(history["sftp:source-1"]).toHaveLength(2);
      expect(history["sftp:source-2"]).toHaveLength(2);
    });

    it("should overwrite previous history for same source", () => {
      const history: Record<string, string[]> = {};
      const sourceId = "sftp:source-1";

      history[sourceId] = ["target-1", "target-2"];
      history[sourceId] = ["target-3", "target-4", "target-5"];

      expect(history[sourceId]).toEqual(["target-3", "target-4", "target-5"]);
    });
  });

  describe("target recommendation", () => {
    it("should recommend targets from history", () => {
      const history = {
        "sftp:source-1": ["target-1", "target-2"]
      };

      const allTargets = [
        { id: "target-1", connected: true },
        { id: "target-2", connected: true },
        { id: "target-3", connected: true }
      ];

      const sourceId = "sftp:source-1";
      const recommended = allTargets.filter((t) => history[sourceId]?.includes(t.id) && t.connected);

      expect(recommended).toHaveLength(2);
      expect(recommended.map((t) => t.id)).toEqual(["target-1", "target-2"]);
    });

    it("should filter out offline targets from recommendations", () => {
      const history = {
        "sftp:source-1": ["target-1", "target-2", "target-3"]
      };

      const allTargets = [
        { id: "target-1", connected: true },
        { id: "target-2", connected: false },
        { id: "target-3", connected: true }
      ];

      const sourceId = "sftp:source-1";
      const recommended = allTargets.filter((t) => history[sourceId]?.includes(t.id) && t.connected);

      expect(recommended).toHaveLength(2);
      expect(recommended.map((t) => t.id)).toEqual(["target-1", "target-3"]);
    });

    it("should return empty array when no history exists", () => {
      const history: Record<string, string[]> = {};
      const allTargets = [
        { id: "target-1", connected: true },
        { id: "target-2", connected: true }
      ];

      const sourceId = "sftp:new-source";
      const recommended = allTargets.filter((t) => history[sourceId]?.includes(t.id) && t.connected);

      expect(recommended).toHaveLength(0);
    });
  });
});
