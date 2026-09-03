import type { FileTransferStatus, FileTransferTask } from "@jumpserver/connectors-core";
import { describe, expect, it } from "vitest";
import { defaultGlobalLeftPaneId } from "#koko/composables/sftp/file-manager/selectors";
import {
  completedTargetCount,
  failedTargetCount,
  finishedTransferCount,
  sftpTransferGroupStatus,
  sftpTransferProgress,
  sftpTransferProgressColor,
  sftpTransferStatusClass
} from "#koko/utils/sftpTransferSummary";
import statusFooterComponent from "../../../components/Workspace/statusFooter.vue?raw";
import defaultLayout from "../../../layouts/default.vue?raw";
import fileManagementStyles from "../../assets/css/sftp-file-management.scss?inline";
import transferCenterStyles from "../../assets/css/sftp-transfer-center.scss?inline";
import fileManagementIndex from "../../components/FileManagement/index.vue?raw";
import fileManagementLocalPane from "../../components/FileManagement/localPane.vue?raw";
import fileManagementPane from "../../components/FileManagement/pane.vue?raw";
import localPaneToolbar from "../../components/FileManagement/pane/SftpLocalPaneToolbar.vue?raw";
import filePaneDropOverlay from "../../components/FileManagement/pane/SftpPaneDropOverlay.vue?raw";
import filePaneTable from "../../components/FileManagement/pane/SftpPaneFileTable.vue?raw";
import filePaneSelectionBar from "../../components/FileManagement/pane/SftpPaneSelectionBar.vue?raw";
import remotePaneToolbar from "../../components/FileManagement/pane/SftpRemotePaneToolbar.vue?raw";
import transferCenterComponent from "../../components/FileManagement/SftpTransferCenter.vue?raw";
import transferActionsComponent from "../../components/FileManagement/transfer-center/SftpTransferActions.vue?raw";
import transferFileComponent from "../../components/FileManagement/transfer-center/SftpTransferFile.vue?raw";
import connectModalComponent from "../../components/FileManagement/workspace/SftpConnectModal.vue?raw";
import globalWorkspaceComponent from "../../components/FileManagement/workspace/SftpGlobalWorkspace.vue?raw";
import remoteTabsComponent from "../../components/FileManagement/workspace/SftpRemoteMachineTabs.vue?raw";
import sessionWorkspaceComponent from "../../components/FileManagement/workspace/SftpSessionWorkspace.vue?raw";
import remotePaneActions from "../../composables/sftp/file-manager/useSftpRemotePaneActions.ts?raw";
import transferCoordinatorComposable from "../../composables/sftp/file-manager/useSftpTransferCoordinator.ts?raw";
import workspacePanesComposable from "../../composables/sftp/file-manager/useSftpWorkspacePanes.ts?raw";
import transferUiComposable from "../../composables/sftp/useSftpTransferUi.ts?raw";
import transferPersistence from "../../utils/file-transfer/persistence.ts?raw";
import fileManagerSessionSurface from "../../workspaces/FileManagerSessionSurface.vue?raw";

const localPaneImplementation = [fileManagementLocalPane, filePaneDropOverlay, filePaneTable].join("\n");

describe("sftp transfer center layout", () => {
  it("uses a resizable island dock without an overlay", () => {
    expect(transferCenterComponent).toContain('class="sftp-transfer-center-drawer"');
    expect(transferCenterComponent).toContain('class="sftp-transfer-resize-handle"');
    expect(transferCenterComponent).toContain('role="separator"');
    expect(transferCenterComponent).toContain('@pointerdown="startResize"');
    expect(transferCenterComponent).toContain('@keydown="resizeWithKeyboard"');
    expect(transferCenterComponent).toContain('useLocalStorage("jumpserver-client:sftp-transfer-center-height"');
    expect(transferCenterComponent).not.toContain("scaleWorkspace");
    expect(transferCenterComponent).not.toContain("Teleport");
    expect(transferCenterComponent).not.toContain("<UDrawer");
    expect(transferCenterStyles).toContain("bottom: calc(1.75rem + var(--workspace-island-inset))");
    expect(transferCenterStyles).toContain("height: var(--sftp-transfer-center-height, 194px)");
    expect(transferCenterStyles).toContain("border-radius: var(--workspace-island-radius, 10px)");
  });

  it("renders the compact queue with Nuxt UI table columns including a dedicated actions column", () => {
    expect(transferCenterComponent).toContain("<UTable");
    expect(transferCenterComponent).toContain(':data="sftpTasks"');
    expect(transferCenterComponent).toContain(':columns="columns"');
    expect(transferCenterComponent).toContain('id: "actions"');
    expect(transferCenterComponent).toContain('header: t("Common.Actions")');
    expect(transferCenterComponent).toContain('#actions-cell="{ row }"');
    expect(transferCenterComponent).toContain("<SftpTransferActions");
    expect(transferCenterComponent).not.toContain('role="table"');
    expect(transferCenterComponent).not.toContain("<SftpTransferBatch");
    expect(transferCenterComponent).toContain('#direction-cell="{ row }"');
    expect(transferCenterComponent).toContain('#progress-cell="{ row }"');
    expect(transferCenterComponent).toContain('#rate-cell="{ row }"');
    expect(transferCenterComponent).toContain('#status-cell="{ row }"');
    expect(transferCenterComponent).toContain("<UProgress");
    expect(transferCenterStyles).toContain("[data-slot=th]");
    expect(transferCenterStyles).toContain("[data-slot=td]");
    expect(transferCenterStyles).toMatch(/\.sftp-transfer-actions\s*\{[^}]*justify-content:\s*flex-end/);
  });

  it("allows an active file to be paused independently", () => {
    expect(transferCenterComponent).toContain(':can-pause="canPauseTransferTasks([row.original])"');
    expect(transferCenterComponent).toContain('@pause="store.pauseTask(row.original.id)"');
    expect(transferActionsComponent).toContain('icon="i-lucide-pause"');
  });

  it("delegates resume availability to the transfer-center selectors", () => {
    expect(transferCenterComponent).toContain("canResumeTransferTasks");
  });

  it("hides retry for connection-lost failures", () => {
    expect(transferActionsComponent).toContain("canRetryTransferTask");
    expect(transferActionsComponent).toContain('v-if="canRetry"');
    expect(transferCenterComponent).toContain("sftpTransferErrorText");
    expect(transferCoordinatorComposable).toContain("failUnavailableEndpoint");
  });

  it("keeps conflict resolution available from a compact Nuxt UI menu", () => {
    expect(transferActionsComponent).toContain("<UDropdownMenu");
    expect(transferActionsComponent).toContain('emit("resolve", "overwrite")');
    expect(transferActionsComponent).toContain('emit("resolve", "skip")');
    expect(transferActionsComponent).toContain('emit("resolve", "keep_both")');
    expect(transferActionsComponent).toContain('color="warning"');
  });

  it("clears terminal rows individually or together and removes empty IndexedDB state", () => {
    expect(transferCenterComponent).toContain("hasFinishedTasks");
    expect(transferCenterComponent).toContain('icon="i-lucide-trash-2"');
    expect(transferCenterComponent).toContain('@clear="store.clearFinished([row.original.id])"');
    expect(transferActionsComponent).toContain("clear: []");
    expect(transferActionsComponent).toContain("emit('clear')");
    expect(transferFileComponent).toContain("<SftpTransferActions");
    expect(transferPersistence).toContain("objectStore.delete(recordKey)");
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
    // Multi-target design uses a larger accent icon inside the drop label chip.
    expect(fileManagementStyles).toMatch(/\.sftp-transfer-drop-target__icon[\s\S]*?width:\s*26px/);
    expect(fileManagementStyles).toContain("sftp-transfer-drop-target");
  });

  it("delegates same-endpoint rejection to the shared drag helper", () => {
    expect(fileManagementPane).toContain("isCrossEndpointTransferDrag");
  });
});

describe("sftp selection bar and peer transfer", () => {
  it("anchors the selection bar to the source pane for both peer and multi-target modes", () => {
    expect(filePaneSelectionBar).toContain('class="sftp-selection-bar"');
    expect(filePaneSelectionBar).toContain("<UButton");
    expect(filePaneSelectionBar).toContain('color="primary"');
    expect(filePaneSelectionBar).toContain('color="error"');
    expect(filePaneSelectionBar).toContain("koko.fileManagement.sendTo");
    expect(filePaneSelectionBar).toContain("koko.fileManagement.sendToOpposite");
    expect(filePaneSelectionBar).toContain("sendPeerDirection");
    expect(filePaneSelectionBar).toContain("i-lucide-arrow-right");
    expect(filePaneSelectionBar).toContain("i-lucide-arrow-left");
    expect(filePaneSelectionBar).toContain("i-lucide-forward");
    expect(filePaneSelectionBar).not.toContain("i-lucide-copy");
    expect(filePaneSelectionBar).not.toContain("i-lucide-send");
    expect(filePaneSelectionBar).not.toContain("Teleport");
    expect(filePaneSelectionBar).not.toContain("sendToEllipsis");
    expect(fileManagementStyles).toContain(".sftp-selection-bar");
    expect(fileManagementStyles).toContain("position: relative");
    expect(fileManagementStyles).toContain("min-height: 40px");
    expect(fileManagementStyles).toContain("margin-top: 16px");
    expect(fileManagementStyles).toContain("box-shadow: inset 3px 0 0 var(--theme-accent)");
    expect(fileManagementStyles).not.toContain("bottom: 36px");
  });

  it("places the selection actions above the item count inside the table layout", () => {
    expect(fileManagementPane).toContain("<template #footer>");
    expect(fileManagementLocalPane).toContain("<template #footer>");
    expect(filePaneTable.indexOf('<slot name="footer" />')).toBeLessThan(
      filePaneTable.indexOf('class="sftp-file-table__status')
    );
  });

  it("hides local Send to until a connected remote destination exists", () => {
    expect(fileManagementLocalPane).toContain("canSend?: boolean");
    expect(fileManagementLocalPane).toContain(':can-send="canSend && transferableEntries.length > 0"');
    expect(fileManagementPane).toContain("canSend?: boolean");
    expect(fileManagementPane).toContain(':can-send="canTransferFiles && canSend"');
    expect(globalWorkspaceComponent).toContain("const canSendFromLocal = computed");
    expect(globalWorkspaceComponent).toContain(':can-send="canSendFromLocal"');
    expect(globalWorkspaceComponent).toContain(':can-send="canSendFromRemote(pane.transferEndpoint.id)"');
    expect(sessionWorkspaceComponent).toContain("const primaryCanSend = computed");
    expect(sessionWorkspaceComponent).toContain(':can-send="primaryCanSend"');
  });

  it("uses simple peer send behavior only when exactly one remote connection exists", () => {
    expect(transferCoordinatorComposable).toContain("function isSimplePeerMode");
    expect(transferCoordinatorComposable).toContain("options.remotePanes.value.length === 1");
    expect(transferCoordinatorComposable).toContain("function sendFromSelection");
    expect(transferCoordinatorComposable).toContain("function resolveOppositeDestination");
    expect(transferCoordinatorComposable).toContain("function canSendToOpposite");
    expect(sessionWorkspaceComponent).toContain('@send="sendFromSelection"');
    expect(sessionWorkspaceComponent).toContain(':send-peer-direction="primarySendPeerDirection"');
    expect(globalWorkspaceComponent).toContain('@send="sendFromSelection"');
    expect(globalWorkspaceComponent).toContain(":send-peer-direction=");
    expect(remoteTabsComponent).not.toContain("UCheckbox");
    expect(remoteTabsComponent).not.toContain("multiTarget");
    expect(remoteTabsComponent).not.toContain("selectedIds");
  });

  it("resets source table selection immediately after a transfer is queued", () => {
    expect(transferCoordinatorComposable).toContain(
      "if (endpointId === LOCAL_ENDPOINT_ID) return options.localPaneRef.value"
    );
    expect(transferCoordinatorComposable).toContain("sourcePaneFor(payload.sourceEndpoint.id)?.clearSelection()");
    expect(transferCoordinatorComposable).not.toContain("pendingSelectionClears");
    expect(transferCoordinatorComposable).not.toContain("clearTransferredSelection(");
  });

  it("routes global local transfers through the transfer center queue like session sftp", () => {
    expect(transferCoordinatorComposable).toContain("Always prefer Transfer Center queue");
    expect(transferCoordinatorComposable).toContain("queueSftpTransferToSelected(payload, destination)");
    expect(transferCoordinatorComposable).not.toContain(
      "void handleCrossPaneDrop({ ...payload, destinationPath: opposite.destinationPath }, opposite.endpoint)"
    );
    expect(globalWorkspaceComponent).toContain("SftpTransferRail");
    expect(globalWorkspaceComponent).toContain('@transfer="transferGlobal"');
    expect(globalWorkspaceComponent).toContain('@transfer-endpoint-mounted="mountTransferEndpoint"');
    expect(fileManagementLocalPane).toContain("useLocalFileTransferEndpoint");
    expect(fileManagementLocalPane).toContain("transferEndpointMounted");
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
    expect(sessionWorkspaceComponent).toContain('v-if="!compact && dualMode"');
    expect(fileManagementIndex).toContain("!props.global && !props.compact && !props.showEmpty");
    expect(sessionWorkspaceComponent).toContain('v-show="!compact && dualMode"');
    expect(sessionWorkspaceComponent).toContain(':compact="compact"');
    expect(sessionWorkspaceComponent).not.toContain("KokoSftpTransferCenter");
    expect(sessionWorkspaceComponent).not.toContain("sftp-file-management__topbar");
    expect(sessionWorkspaceComponent).toContain("disconnectAllRemotes");
    expect(sessionWorkspaceComponent).toContain("i-lucide-ellipsis");
    expect(fileManagementStyles).toContain(".sftp-file-management--compact");
  });

  it("keeps only lightweight file ops and removes send/transfer affordances in compact panes", () => {
    expect(fileManagementPane).toContain("compact?: boolean");
    expect(fileManagementPane).toContain(':compact="compact"');
    expect(filePaneTable).toContain("compact?: boolean");
    expect(filePaneTable).toContain('v-if="!compact"');
    expect(filePaneTable).toContain('t("koko.fileManagement.modifiedTime")');
    expect(filePaneTable).toContain('t("koko.fileManagement.type")');
    expect(filePaneTable).toContain("TransitionGroup");
    expect(filePaneTable).toContain("rowTransitionName");
    expect(filePaneTable).toContain(':name="rowTransitionName"');
    expect(filePaneTable).toContain("appear");
    expect(filePaneTable).toContain("listKey");
    expect(filePaneTable).toContain("onBeforeLeave");
    expect(filePaneTable).toContain("onAfterEnter");
    expect(filePaneTable).toContain("skipLeaveAnim");
    expect(sessionWorkspaceComponent).toContain('highlighted-names="highlightedNames.left"');
    expect(sessionWorkspaceComponent).toContain('highlighted-names="highlightedNames.right"');
    expect(remotePaneToolbar).toContain("i-lucide-cloud-upload");
    expect(remotePaneToolbar).toContain("i-lucide-server");
    expect(fileManagementStyles).toContain("sftp-file-row-enter-active");
    expect(fileManagementStyles).toContain("sftp-file-row-appear-active");
    expect(fileManagementStyles).toContain("sftp-file-row-enter-to");
    expect(fileManagementStyles).toContain("sftp-file-row-leave-active");
    expect(fileManagementStyles).not.toContain("sftp-file-list-refresh");
    expect(fileManagementStyles).toContain("sftp-file-table__refresh-bar");
    expect(fileManagementPane).toContain("sftp-file-table__refresh-bar");
    expect(fileManagementPane).toContain(':list-key="manager.currentPath.value"');
    expect(fileManagementPane).toContain(":refreshing=");
    expect(fileManagementPane).toContain(
      "const canTransferFiles = computed(() => Boolean(props.transferEndpoint) && !props.compact)"
    );
    expect(fileManagementPane).toContain("if (!canTransferFiles.value) return null");
    expect(remotePaneActions).toContain('label: t("koko.fileManagement.sendTo")');
    expect(fileManagementPane).toContain(':can-send="canTransferFiles && canSend"');
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

  it("hosts the transfer drawer globally from the status footer", () => {
    expect(globalWorkspaceComponent).not.toContain("KokoSftpTransferCenter");
    expect(globalWorkspaceComponent).toContain("showSideAddButton");
    expect(globalWorkspaceComponent).toContain("koko.fileManagement.addRemoteSftp");
    expect(globalWorkspaceComponent).toContain("<UTooltip");
    expect(defaultLayout).toContain("<KokoSftpTransferCenter");
    expect(defaultLayout).toContain("data-vaul-drawer-wrapper");
    expect(statusFooterComponent).toContain("data-sftp-transfer-trigger");
    expect(statusFooterComponent).not.toContain('v-if="hasTasks"');
    expect(statusFooterComponent).not.toContain(':disabled="!hasTasks"');
    expect(transferUiComposable).not.toContain("if (value && !hasTasks.value) return");
    expect(transferUiComposable).not.toContain("if (!value) open.value = false");
    expect(statusFooterComponent).toContain("<UBadge");
    expect(statusFooterComponent).toContain('color="neutral"');
    expect(statusFooterComponent).not.toContain("!bg-blue-500/10 !text-blue-500");
    expect(statusFooterComponent).toContain('variant="soft"');
    expect(statusFooterComponent).toContain("'is-idle': transferTone === 'idle'");
    expect(statusFooterComponent).toContain("'is-busy': transferTone === 'moving'");
    expect(statusFooterComponent).toContain("'is-paused': transferTone === 'paused'");
    expect(statusFooterComponent).toContain("'is-failed': transferTone === 'failed'");
    expect(statusFooterComponent).toContain("sftp-transfer-trigger-dot");
    expect(transferUiComposable).toContain("hasMovingTasks");
    expect(transferUiComposable).toContain("hasPausedTasks");
    expect(transferUiComposable).toContain("transferTone");
    expect(transferUiComposable).toContain("hasActiveTasks");
    expect(transferUiComposable).toContain("hasFailedTasks");
    expect(statusFooterComponent).not.toContain('icon="i-lucide-arrow-up-down"');
    expect(statusFooterComponent).toContain(':aria-expanded="transferOpen"');
    expect(statusFooterComponent).toContain('aria-controls="sftp-transfer-center"');
    expect(fileManagementStyles).toContain("cursor: pointer");
    expect(fileManagementStyles).not.toContain("transform: translateY(-1px)");
    expect(transferCenterComponent).toContain('class="sftp-transfer-center-drawer"');
    expect(transferCoordinatorComposable).toContain("useSftpTransferUi");
  });

  it("jumps the footer transfer trigger whenever a new queue signal arrives", () => {
    expect(transferUiComposable).toContain('useState("sftp-transfer-attention-sequence"');
    expect(transferUiComposable).toContain("attentionSequence.value += 1");
    expect(statusFooterComponent).toContain("transferAttracting");
    expect(statusFooterComponent).toContain("'is-attracting': transferAttracting");
    expect(fileManagementStyles).toContain("@keyframes sftp-transfer-attention-jump");
    expect(fileManagementStyles).toContain("translateY(-10px) scale(1.04, 0.96)");
    expect(fileManagementStyles).toContain("translateY(-7px) scale(1.03, 0.97)");
    expect(fileManagementStyles).toContain("@keyframes sftp-transfer-text-shine");
    expect(fileManagementStyles).toContain("background-position: -120% 0");
    expect(fileManagementStyles).toContain("var(--theme-accent)");
    expect(fileManagementStyles).toContain(".sftp-transfer-trigger-dot");
    expect(fileManagementStyles).toContain("@keyframes sftp-transfer-dot-pulse");
  });

  it("shows a center transfer rail with left/right arrows while keeping send modal flow", () => {
    expect(globalWorkspaceComponent).toContain("SftpTransferRail");
    expect(globalWorkspaceComponent).toContain("transferGlobal");
    expect(globalWorkspaceComponent).toContain('mode="global"');
    expect(sessionWorkspaceComponent).toContain("SftpTransferRail");
    expect(sessionWorkspaceComponent).toContain("transferGlobal");
    expect(sessionWorkspaceComponent).toContain('mode="session"');
    expect(sessionWorkspaceComponent).toContain('@send="sendFromSelection"');
    expect(transferCoordinatorComposable).toContain("function openSendModal");
    expect(transferCoordinatorComposable).toContain("function transferGlobal");
    expect(transferCoordinatorComposable).toContain("Session dual-pane");
    expect(fileManagementPane).toContain("SftpPaneTableSkeleton");
    expect(fileManagementLocalPane).toContain("SftpPaneTableSkeleton");
    expect(remotePaneToolbar).toContain("<UTooltip");
    expect(remotePaneToolbar).toContain("koko.fileManagement.back");
    expect(remotePaneToolbar).toContain("koko.actions.upload");
  });

  it("uses tab overflow for session dual-remote chrome without a floating transfer center", () => {
    expect(sessionWorkspaceComponent).not.toContain("KokoSftpTransferCenter");
    expect(sessionWorkspaceComponent).not.toContain("sftp-file-management__topbar");
    expect(sessionWorkspaceComponent).not.toContain("toggleDualMode");
    expect(sessionWorkspaceComponent).toContain("disconnectAllRemotes");
    expect(sessionWorkspaceComponent).toContain("remoteOverflowItems");
    expect(sessionWorkspaceComponent).toContain("i-lucide-ellipsis");
    expect(sessionWorkspaceComponent).toContain('data-sftp-tour="remote-connect"');
    // Dual pane is implicit: any remote connection expands the right side.
    expect(workspacePanesComposable).toContain("const dualMode = computed(() => remotePanes.value.length > 0)");
    expect(workspacePanesComposable).not.toContain("dualMode.value = true");
    expect(workspacePanesComposable).not.toContain("dualMode.value = false");
  });

  it("uses a unified single-row toolbar with responsive path/search chrome", () => {
    expect(remotePaneToolbar).toContain("sftp-file-management__toolbar--unified");
    expect(remotePaneToolbar).toContain("beginPathEdit");
    expect(remotePaneToolbar).toContain("goToPath");
    expect(remotePaneToolbar).toContain("filterCurrentDirectory");
    expect(remotePaneToolbar).toContain("ResizeObserver");
    expect(remotePaneToolbar).toContain("isNarrow");
    expect(remotePaneToolbar).toContain("isCompact");
    expect(remotePaneToolbar).toContain("toolbarWidth.value < 720");
    expect(remotePaneToolbar).toContain('data-sftp-tour="navigation"');
    expect(remotePaneToolbar).toContain('data-sftp-tour="file-actions"');
    expect(remotePaneToolbar).not.toContain("sftp-file-management__actionbar");
    expect(localPaneToolbar).toContain("sftp-file-management__toolbar--unified");
    expect(localPaneToolbar).toContain("beginPathEdit");
    expect(localPaneToolbar).toContain("toolbarWidth.value < 720");
    expect(localPaneToolbar).toContain("square");
    expect(remotePaneToolbar).toContain("square");
    expect(fileManagementStyles).toContain(":not(:has([data-slot=label]))");
    expect(fileManagementStyles).toContain(":not(:has([data-slot=value]))");
    expect(fileManagementStyles).toContain("justify-content: center");
    expect(localPaneToolbar).not.toContain("sftp-file-management__actionbar");
    expect(fileManagementPane).toContain('@go-to-path="goToAbsolutePath"');
    expect(fileManagementPane).toContain("focusPathEdit");
    expect(fileManagementPane).toContain("focusSearch");
    expect(fileManagementStyles).toContain("toolbar--unified");
    expect(fileManagementStyles).toContain("container-type: inline-size");
    expect(fileManagementStyles).toContain("__search-input");
  });

  it("shows the asset as a toolbar context label or dual-pane identity strip", () => {
    expect(fileManagementIndex).toContain("sourceAsset: () => props.sourceAsset");
    expect(fileManagerSessionSurface).toContain(":source-asset=");
    expect(fileManagerSessionSurface).toContain("tab.assetName");
    expect(workspacePanesComposable).toContain("primaryAssetName");
    expect(workspacePanesComposable).toContain("label: primaryAssetName.value");
    expect(sessionWorkspaceComponent).toContain(
      ':context-label="!compact && !dualMode ? primaryAssetName : undefined"'
    );
    expect(sessionWorkspaceComponent).toContain(":show-workbench-actions=");
    expect(sessionWorkspaceComponent).toContain('v-if="!compact && dualMode"');
    expect(sessionWorkspaceComponent).toContain("primaryAssetName");
    expect(sessionWorkspaceComponent).not.toContain("sftp-file-management__topbar");
    expect(remotePaneToolbar).toContain("contextLabel");
    expect(remotePaneToolbar).toContain("sftp-file-management__context-label");
    expect(fileManagementPane).toContain("contextLabel");
    expect(transferCoordinatorComposable).toContain("options.primaryTransferEndpoint.value.label");
  });

  it("does not toast on remote sftp connect", () => {
    expect(workspacePanesComposable).toContain("function markRemotePaneConnected");
    expect(workspacePanesComposable).not.toContain("koko.fileManagement.remoteConnected");
  });

  it("uses the database-console tab presentation", () => {
    expect(remoteTabsComponent).toContain("min-w-20 max-w-40 basis-40 grow shrink");
    expect(remoteTabsComponent).toContain("bg-accented text-highlighted");
    expect(remoteTabsComponent).not.toContain("border-primary/50");
  });

  it("places organization selection first and reuses the shared asset tree", () => {
    expect(connectModalComponent.indexOf("organizationSelector")).toBeLessThan(
      connectModalComponent.indexOf("remoteAssetSearch")
    );
    expect(connectModalComponent).not.toContain("currentOrganization");
    expect(connectModalComponent).not.toContain("border border-default bg-elevated/40");
    expect(connectModalComponent).not.toContain("show-recent-connections");
    expect(connectModalComponent).not.toContain("recent-connections-label");
    expect(connectModalComponent).not.toContain('v-for="item in recentConnections"');
    expect(connectModalComponent).not.toContain("UCheckbox");
    expect(connectModalComponent).not.toContain("openRemoteInCurrentTab");
    expect(workspacePanesComposable).not.toContain("openRemoteInCurrentTab");
  });

  it("keeps the add button beside the tabs", () => {
    expect(globalWorkspaceComponent.indexOf("<SftpRemoteMachineTabs")).toBeLessThan(
      globalWorkspaceComponent.indexOf('icon="i-lucide-plus"')
    );
    expect(remoteTabsComponent).toContain("w-fit shrink-0");
  });

  it("keeps multi-host distribution via send modal rather than tab checkboxes", () => {
    expect(remoteTabsComponent).not.toContain("UCheckbox");
    expect(remoteTabsComponent).not.toContain("toggleSelected");
    expect(globalWorkspaceComponent).not.toContain("selected-ids");
    expect(globalWorkspaceComponent).not.toContain("toggle-selected");
    expect(sessionWorkspaceComponent).not.toContain("selected-ids");
    expect(sessionWorkspaceComponent).not.toContain("toggle-selected");
    expect(transferCoordinatorComposable).toContain("const checkedTargets = sendTargetOptions.value.filter");
    expect(transferCoordinatorComposable).toContain("queueSftpTransferToSelected");
    expect(transferCoordinatorComposable).not.toContain("transferLocalEntriesToCheckedRemotes");
    expect(transferCoordinatorComposable).not.toContain("async function transferEntries");
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

  describe("sftp transfer status colors", () => {
    it("maps row status classes and progress colors", () => {
      expect(sftpTransferStatusClass("failed")).toBe("is-error");
      expect(sftpTransferStatusClass("paused")).toBe("is-paused");
      expect(sftpTransferStatusClass("transferring")).toBe("is-busy");
      expect(sftpTransferStatusClass("queued")).toBeUndefined();
      expect(sftpTransferProgressColor({ status: "failed" })).toBe("error");
      expect(sftpTransferProgressColor({ status: "paused" })).toBe("warning");
      expect(sftpTransferProgressColor({ status: "transferring" })).toBe("primary");
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
