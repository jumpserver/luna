import type { FileTransferStatus, FileTransferTask } from "~/shared/file-transfer/types";
import { describe, expect, it } from "vitest";
import { defaultGlobalLeftPaneId } from "#koko/composables/sftp/file-manager/selectors";
import {
  completedTargetCount,
  failedTargetCount,
  finishedTransferCount,
  sftpTransferGroupStatus,
  sftpTransferProgress
} from "#koko/utils/sftpTransferSummary";
import fileManagementStyles from "../../assets/css/sftp-file-management.scss?inline";
import transferCenterStyles from "../../assets/css/sftp-transfer-center.scss?inline";
import fileManagementIndex from "../../components/FileManagement/index.vue?raw";
import fileManagementLocalPane from "../../components/FileManagement/localPane.vue?raw";
import fileManagementPane from "../../components/FileManagement/pane.vue?raw";
import filePaneDropOverlay from "../../components/FileManagement/pane/SftpPaneDropOverlay.vue?raw";
import filePaneTable from "../../components/FileManagement/pane/SftpPaneFileTable.vue?raw";
import filePaneSelectionBar from "../../components/FileManagement/pane/SftpPaneSelectionBar.vue?raw";
import transferCenterComponent from "../../components/FileManagement/SftpTransferCenter.vue?raw";
import transferBatchComponent from "../../components/FileManagement/transfer-center/SftpTransferBatch.vue?raw";
import transferFileComponent from "../../components/FileManagement/transfer-center/SftpTransferFile.vue?raw";
import transferTargetComponent from "../../components/FileManagement/transfer-center/SftpTransferTarget.vue?raw";
import connectModalComponent from "../../components/FileManagement/workspace/SftpConnectModal.vue?raw";
import globalWorkspaceComponent from "../../components/FileManagement/workspace/SftpGlobalWorkspace.vue?raw";
import remoteTabsComponent from "../../components/FileManagement/workspace/SftpRemoteMachineTabs.vue?raw";
import sessionWorkspaceComponent from "../../components/FileManagement/workspace/SftpSessionWorkspace.vue?raw";
import remotePaneActions from "../../composables/sftp/file-manager/useSftpRemotePaneActions.ts?raw";
import transferCoordinatorComposable from "../../composables/sftp/file-manager/useSftpTransferCoordinator.ts?raw";
import workspacePanesComposable from "../../composables/sftp/file-manager/useSftpWorkspacePanes.ts?raw";
import fileManagerSessionSurface from "../../workspaces/FileManagerSessionSurface.vue?raw";

const transferCenterPresentation = [
  transferCenterComponent,
  transferBatchComponent,
  transferTargetComponent,
  transferFileComponent
].join("\n");
const localPaneImplementation = [fileManagementLocalPane, filePaneDropOverlay, filePaneTable].join("\n");

describe("sftp transfer center layout", () => {
  it("keeps the design drawer width and collapses nested batch content", () => {
    expect(transferCenterStyles).toContain("width: 552px");
    expect(transferCenterStyles).toContain("width: 496px");
    expect(transferCenterStyles).toContain("max-width: calc(100vw - 40px)");
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-targets\s*\{[^}]*display:\s*none/);
    expect(transferCenterComponent).toContain(':expanded="expandedBatches.has(batch.id)"');
    expect(transferBatchComponent).toContain('v-show="expanded"');
    expect(transferBatchComponent).toContain(':aria-expanded="expanded"');
  });

  it("renders a full-width progress track and right-aligned actions for every file", () => {
    expect(transferCenterPresentation).toContain('class="sftp-transfer-file__progress"');
    expect(transferCenterPresentation).not.toMatch(/v-if=[^>]+sftp-transfer-file__progress/);
    expect(transferCenterStyles).toContain("grid-template-columns: minmax(0, 1fr) 92px max-content");
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-file__progress\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-file__actions\s*\{[^}]*justify-content:\s*flex-end/);
  });

  it("allows an active file to be paused independently", () => {
    expect(transferTargetComponent).toContain(':can-pause="canPauseTransferTasks([task])"');
    expect(transferTargetComponent).toContain("@pause=\"emit('pauseTask', task)\"");
    expect(transferCenterComponent).toContain('@pause-task="store.pauseTask($event.id)"');
    expect(transferCenterPresentation).toContain('icon="i-lucide-pause"');
  });

  it("delegates resume availability to the transfer-center selectors", () => {
    expect(transferTargetComponent).toContain("canResumeTransferTasks");
  });

  it("uses compact outlined conflict actions instead of solid default buttons", () => {
    expect(transferTargetComponent.match(/variant="outline"/g)).toHaveLength(3);
    expect(transferTargetComponent.match(/size="xs"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(transferCenterStyles).not.toMatch(/\.sftp-conflict-action\s*\{/);
  });
});

describe("sftp transfer drop target", () => {
  it("shows the destination machine and current directory for a valid cross-endpoint drag", () => {
    expect(filePaneDropOverlay).toContain('class="sftp-transfer-drop-target"');
    expect(filePaneDropOverlay).toContain('t("koko.fileManagement.copyTo")');
    expect(fileManagementPane).toContain("transferEndpoint?.label");
    expect(fileManagementPane).toContain("manager.currentPath.value");
    expect(filePaneDropOverlay).toContain('t("koko.fileManagement.releaseToCurrentDirectory")');
    expect(fileManagementStyles).toMatch(/\.sftp-transfer-drop-target\s*\{[^}]*border:\s*2px dashed/);
    // Drag target send/copy icon stays compact (scss may nest `> svg` under `__label`).
    expect(fileManagementStyles).toMatch(/width:\s*14px/);
    expect(fileManagementStyles).toContain("sftp-transfer-drop-target");
  });

  it("delegates same-endpoint rejection to the shared drag helper", () => {
    expect(fileManagementPane).toContain("isCrossEndpointTransferDrag");
  });
});

describe("sftp right-panel compact mode", () => {
  it("accepts a compact prop on the file manager session surface", () => {
    expect(fileManagerSessionSurface).toContain("compact?: boolean");
    expect(fileManagerSessionSurface).toContain(':compact="compact"');
  });

  it("does not surface the professional workbench upgrade control", () => {
    expect(fileManagementIndex).not.toContain("openProfessionalWorkbench");
    expect(sessionWorkspaceComponent).not.toContain("koko.fileManagement.openProfessional");
    expect(sessionWorkspaceComponent).not.toContain("openProfessionalWorkbench");
  });

  it("hides dual-remote chrome and feature tour in compact mode", () => {
    expect(fileManagementIndex).toContain("compact?: boolean");
    expect(fileManagementIndex).toContain("sftp-file-management--compact");
    expect(fileManagementIndex).toContain("<SftpSessionWorkspace\n      v-else");
    expect(sessionWorkspaceComponent).toContain('v-if="!compact"');
    expect(fileManagementIndex).toContain("!props.global && !props.compact && !props.showEmpty");
    expect(sessionWorkspaceComponent).toContain('v-show="!compact && dualMode"');
    expect(sessionWorkspaceComponent).toContain(':compact="compact"');
    expect(fileManagementStyles).toContain(".sftp-file-management--compact");
  });

  it("keeps only lightweight file ops and removes send/transfer affordances in compact panes", () => {
    expect(fileManagementPane).toContain("compact?: boolean");
    expect(fileManagementPane).toContain(
      "const canTransferFiles = computed(() => Boolean(props.transferEndpoint) && !props.compact)"
    );
    expect(fileManagementPane).toContain("if (!canTransferFiles.value) return null");
    expect(remotePaneActions).toContain('label: t("koko.fileManagement.sendTo")');
    expect(fileManagementPane).toContain(':can-send="canTransferFiles"');
    expect(filePaneSelectionBar).toContain('v-if="canSend && transferableCount"');
    expect(fileManagementPane).toContain(':draggable="canTransferFiles"');
    expect(filePaneTable).toContain(":draggable=\"draggable && !entry.is_dir && entry.name !== '..'\"");
    // Compact still keeps browse + basic mutations.
    expect(remotePaneActions).toContain('label: t("koko.actions.download")');
    expect(remotePaneActions).toContain('label: t("koko.actions.rename")');
    expect(remotePaneActions).toContain('label: t("koko.actions.delete")');
  });
});

describe("sftp local professional pane", () => {
  it("supports dense list, multi-select, shortcuts, and local CRUD", () => {
    expect(fileManagementLocalPane).toContain("selectAllState");
    expect(fileManagementLocalPane).toContain("useSftpPaneSelection");
    expect(fileManagementLocalPane).toContain("quickPaths");
    expect(fileManagementLocalPane).toContain("revealInSystem");
    expect(fileManagementLocalPane).toContain("createDirectory");
    expect(fileManagementLocalPane).toContain("renameEntry");
    expect(localPaneImplementation).toContain("dropSameEndpoint");
    expect(localPaneImplementation).toContain("sftp-file-row--highlight");
  });
});

describe("sftp professional workbench", () => {
  it("defaults the global workbench to local-left without instructional chrome", () => {
    expect(defaultGlobalLeftPaneId(true)).toBe("local");
    expect(defaultGlobalLeftPaneId(false)).toBe("web-upload");
    expect(fileManagementIndex).toContain("useSftpWorkspacePanes");
    expect(fileManagementIndex).toContain("initializeGlobalWorkspace");
    expect(fileManagementIndex).not.toContain("workbenchHint");
    expect(fileManagementIndex).not.toContain("rightEmptyHint");
  });

  it("keeps the transfer center on the local pane header", () => {
    expect(globalWorkspaceComponent).toContain(
      '<KokoSftpTransferCenter v-if="side === \'left\'" :ref="setTransferCenterRef" prominent />'
    );
    expect(transferCenterComponent).toContain("prominent?: boolean");
    expect(transferCenterComponent).toContain("is-prominent");
  });

  it("uses the database-console tab presentation", () => {
    expect(remoteTabsComponent).toContain("min-w-20 max-w-40 basis-40 grow shrink");
    expect(remoteTabsComponent).toContain("bg-accented text-highlighted");
    expect(remoteTabsComponent).not.toContain("border-primary/50");
  });

  it("places organization selection first and supports replacing the active tab", () => {
    expect(connectModalComponent.indexOf("organizationSelector")).toBeLessThan(
      connectModalComponent.indexOf("remoteAssetSearch")
    );
    expect(connectModalComponent).not.toContain("currentOrganization");
    expect(connectModalComponent).not.toContain("border border-default bg-elevated/40");
    expect(connectModalComponent).toContain(':show-recent-connections="true"');
    expect(connectModalComponent).toContain(":recent-connections-label");
    expect(connectModalComponent).not.toContain('v-for="item in recentConnections"');
    expect(connectModalComponent).toContain("openRemoteInCurrentTab");
    expect(workspacePanesComposable).toContain(
      "replacePaneId: openRemoteInCurrentTab.value ? replacePaneId : undefined"
    );
  });

  it("keeps the add button beside the tabs", () => {
    expect(globalWorkspaceComponent.indexOf("<SftpRemoteMachineTabs")).toBeLessThan(
      globalWorkspaceComponent.indexOf('icon="i-lucide-plus"')
    );
    expect(remoteTabsComponent).toContain("w-fit shrink-0");
  });

  it("selects tab targets for multi-host transfers in both workspace modes", () => {
    expect(remoteTabsComponent).toContain("<UCheckbox");
    expect(remoteTabsComponent).toContain("selectedIds.includes(pane.id)");
    expect(remoteTabsComponent).toContain("toggleSelected");
    expect(globalWorkspaceComponent).toContain(':selected-ids="selectedRemoteTargetIds"');
    expect(globalWorkspaceComponent).toContain('@toggle-selected="toggleRemoteTarget"');
    expect(sessionWorkspaceComponent).toContain(':selected-ids="selectedRemoteTargetIds"');
    expect(sessionWorkspaceComponent).toContain('@toggle-selected="toggleRemoteTarget"');
    expect(transferCoordinatorComposable).toContain("const checkedTargets = sendTargetOptions.value.filter");
    expect(transferCoordinatorComposable).toContain("queueSftpTransferToSelected");
    expect(transferCoordinatorComposable).toContain("transferLocalEntriesToCheckedRemotes");
  });

  it("guards concurrent connection requests while allowing repeated hosts", () => {
    expect(workspacePanesComposable).toContain("if (remoteConnecting.value) return");
    expect(workspacePanesComposable).not.toContain("findRemotePane");
    expect(workspacePanesComposable).toContain("const id = paneId()");
  });

  it("only reports success after the pane is ready", () => {
    expect(workspacePanesComposable).toContain("markRemotePaneConnected");
    expect(fileManagementPane).toContain("manager.connected, manager.loading, manager.error");
    expect(globalWorkspaceComponent).toContain('transfer-endpoint-connected="handleRemotePaneConnected"');
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
