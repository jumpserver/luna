import type { Ref } from "vue";
import type { SftpFileEntry } from "../protocol";
import type {
  SftpDistributionTargetOption,
  SftpLocalPaneHandle,
  SftpRemotePane,
  SftpRemotePaneHandle,
  SftpTransferCenterHandle,
  SftpTransferDropPayload,
  SftpTransferPaneHandle,
  SftpTransferSourcePayload,
  SftpWorkspaceSide
} from "./workspaceTypes";
import type {
  FileTransferConflictPolicy,
  FileTransferEndpoint,
  FileTransferEndpointRef
} from "~/shared/file-transfer/types";

import { computed, onBeforeUnmount, reactive, ref, toValue, watch } from "vue";
import { buildSftpDistributionGroups } from "#koko/utils/sftpDistribution";
import { registerFileTransferEndpoint } from "~/shared/file-transfer/registry";
import { useFileTransferStore } from "~/store/modules/fileTransfer";
import { buildSftpTransferInputs, completedTransferSourceNames, filterSftpDistributionTargets } from "./selectors";

interface TransferCoordinatorOptions {
  activePaneForSide: (side: SftpWorkspaceSide) => SftpRemotePane | null;
  activeRemoteId: Ref<string | null>;
  currentOrgLabel: Ref<string>;
  globalActiveIds: Record<SftpWorkspaceSide, string | null>;
  primaryPaneRef: Ref<SftpRemotePaneHandle | null>;
  primaryTransferEndpoint: Ref<FileTransferEndpointRef | undefined>;
  remotePaneRefs: Ref<Record<string, SftpRemotePaneHandle | null>>;
  remotePanes: Ref<SftpRemotePane[]>;
  localPaneRef: Ref<SftpLocalPaneHandle | null>;
  transferCenterRef: Ref<SftpTransferCenterHandle | null>;
  translate: (key: string, params?: Record<string, unknown>) => string;
  showError: (title: string, error: unknown) => void;
}

interface TransferOperationTracking {
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  sourceSelectionRevision: number;
  batchIds: string[];
  expectedTaskCount: number;
  createdAt: number;
}

const terminalTransferStatuses = new Set(["completed", "skipped", "failed", "canceled"]);
const LOCAL_ENDPOINT_ID = "local:fs";

export function useSftpTransferCoordinator(options: TransferCoordinatorOptions) {
  const toast = useToast();
  const fileTransferStore = useFileTransferStore();
  const transferring = ref(false);
  const sendModalOpen = ref(false);
  const sendSource = ref<SftpTransferSourcePayload | null>(null);
  const sendTargetSearch = ref("");
  const selectedRemoteTargetIds = ref<string[]>([]);
  const selectedSendTargetIds = ref<string[]>([]);
  const sendTargetPaths = ref<Record<string, string>>({});
  const sendConflictPolicy = ref<FileTransferConflictPolicy>("ask");
  const sendFilesOpen = ref(false);
  const localSelection = ref<SftpFileEntry | null>(null);
  const localSelections = ref<SftpFileEntry[]>([]);
  const highlightedNames = reactive<Record<SftpWorkspaceSide, string[]>>({ left: [], right: [] });
  const distributionHistory = useLocalStorage<Record<string, string[]>>("sftp-distribution-history", {});
  const pendingSelectionClears = new Map<string, TransferOperationTracking>();
  const endpointUnregisters = new Map<string, () => void>();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  const sendTargetOptions = computed<SftpDistributionTargetOption[]>(() => {
    const sourceId = sendSource.value?.sourceEndpoint.id;
    const targets: SftpDistributionTargetOption[] = [];
    const primaryPane = options.primaryPaneRef.value;

    if (options.primaryTransferEndpoint.value && options.primaryTransferEndpoint.value.id !== sourceId) {
      targets.push({
        id: "primary",
        endpoint: options.primaryTransferEndpoint.value,
        organizationName: options.currentOrgLabel.value,
        assetName: options.translate("koko.fileManagement.localSftp"),
        destinationPath: toValue(primaryPane?.manager.currentPath) || "/",
        connected: Boolean(toValue(primaryPane?.manager.connected))
      });
    }

    for (const pane of options.remotePanes.value) {
      if (pane.transferEndpoint.id === sourceId) continue;
      const paneRef = options.remotePaneRefs.value[pane.id];
      targets.push({
        id: pane.id,
        endpoint: pane.transferEndpoint,
        organizationName: pane.organizationName,
        assetName: pane.assetName,
        destinationPath: toValue(paneRef?.manager.currentPath) || "/",
        connected: Boolean(toValue(paneRef?.manager.connected))
      });
    }
    return targets;
  });
  const filteredSendTargetOptions = computed(() => {
    return filterSftpDistributionTargets(sendTargetOptions.value, sendTargetSearch.value);
  });
  const sendFileCount = computed(() => sendSource.value?.entries.length || 0);
  const sendTotalBytes = computed(() =>
    (sendSource.value?.entries || []).reduce((total, entry) => {
      const size = Number(entry.size);
      return total + (Number.isFinite(size) && size >= 0 ? size : 0);
    }, 0)
  );
  const selectedSendTargets = computed(() =>
    sendTargetOptions.value.filter((target) => selectedSendTargetIds.value.includes(target.id) && target.connected)
  );
  const selectedSendTotalBytes = computed(() => sendTotalBytes.value * selectedSendTargets.value.length);

  watch(
    () => options.remotePanes.value.map((pane) => pane.id),
    (paneIds) => {
      const available = new Set(paneIds);
      selectedRemoteTargetIds.value = selectedRemoteTargetIds.value.filter((id) => available.has(id));
    }
  );

  function sourcePaneFor(endpointId: string) {
    if (options.primaryTransferEndpoint.value?.id === endpointId) return options.primaryPaneRef.value;
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    return pane ? options.remotePaneRefs.value[pane.id] || null : null;
  }

  watch(
    () => fileTransferStore.tasks.map((task) => `${task.id}:${task.status}`),
    () => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000;
      for (const [operationId, pending] of pendingSelectionClears) {
        const batchIds = new Set(pending.batchIds);
        const tasks = fileTransferStore.tasks.filter((task) => batchIds.has(task.batchId));
        const terminalCount = tasks.filter((task) => terminalTransferStatuses.has(task.status)).length;
        const allTasksTerminated = terminalCount >= pending.expectedTaskCount;
        const isStale = now - pending.createdAt > staleThreshold;
        if (!allTasksTerminated && !isStale) continue;

        if (import.meta.dev && isStale) {
          console.warn(
            `[SFTP Transfer] Operation ${operationId} is stale (${terminalCount}/${pending.expectedTaskCount} tasks terminated)`
          );
        }
        const completedNames = completedTransferSourceNames(tasks);
        sourcePaneFor(pending.sourceEndpoint.id)?.clearTransferredSelection(
          completedNames,
          pending.sourcePath,
          pending.sourceSelectionRevision
        );
        pendingSelectionClears.delete(operationId);
      }
    }
  );

  if (import.meta.dev) {
    watch(
      () => fileTransferStore.tasks.length,
      (count) => {
        if (count > 0 && count % 100 === 0) console.log(`[SFTP Transfer] Active tasks: ${count}`);
        if (count > 500) console.warn(`[SFTP Transfer] High task count (${count}) may impact performance`);
      }
    );
  }

  function activeTransferCount(endpointId: string) {
    return fileTransferStore.tasks.filter(
      (task) => task.destinationEndpoint.id === endpointId && !terminalTransferStatuses.has(task.status)
    ).length;
  }

  function remotePaneConnected(paneId: string) {
    return Boolean(toValue(options.remotePaneRefs.value[paneId]?.manager.connected));
  }

  function mountTransferEndpoint(endpoint: FileTransferEndpoint) {
    endpointUnregisters.get(endpoint.ref.id)?.();
    endpointUnregisters.set(endpoint.ref.id, registerFileTransferEndpoint(endpoint));
  }

  function connectTransferEndpoint() {
    fileTransferStore.kick();
  }

  function unmountTransferEndpoint(endpoint: FileTransferEndpointRef) {
    endpointUnregisters.get(endpoint.id)?.();
    endpointUnregisters.delete(endpoint.id);
    fileTransferStore.pauseEndpoint(endpoint);
  }

  function targetPath(target: SftpDistributionTargetOption) {
    return sendTargetPaths.value[target.id] ?? target.destinationPath;
  }

  function openSendModal(payload: SftpTransferSourcePayload, preferredTargetIds = selectedRemoteTargetIds.value) {
    sendSource.value = payload;
    sendTargetSearch.value = "";
    sendConflictPolicy.value = "ask";
    sendFilesOpen.value = false;
    sendTargetPaths.value = Object.fromEntries(
      sendTargetOptions.value.map((target) => [target.id, target.destinationPath])
    );
    const checkedTargets = sendTargetOptions.value.filter(
      (target) => preferredTargetIds.includes(target.id) && target.connected
    );
    const frequentTargets = distributionHistory.value[payload.sourceEndpoint.id] || [];
    const recommendedTargets = sendTargetOptions.value.filter(
      (target) => frequentTargets.includes(target.id) && target.connected
    );
    if (checkedTargets.length) {
      selectedSendTargetIds.value = checkedTargets.map((target) => target.id);
    } else if (recommendedTargets.length) {
      selectedSendTargetIds.value = recommendedTargets.map((target) => target.id);
    } else {
      const activeTarget = sendTargetOptions.value.find(
        (target) => target.id === options.activeRemoteId.value && target.connected
      );
      selectedSendTargetIds.value = activeTarget ? [activeTarget.id] : [];
    }
    sendModalOpen.value = true;
  }

  function selectAllOnlineTargets() {
    selectedSendTargetIds.value = sendTargetOptions.value
      .filter((target) => target.connected)
      .map((target) => target.id);
  }

  function toggleSendTarget(id: string, selected: boolean) {
    selectedSendTargetIds.value = selected
      ? [...new Set([...selectedSendTargetIds.value, id])]
      : selectedSendTargetIds.value.filter((targetId) => targetId !== id);
  }

  function toggleRemoteTarget(id: string, selected: boolean) {
    selectedRemoteTargetIds.value = selected
      ? [...new Set([...selectedRemoteTargetIds.value, id])]
      : selectedRemoteTargetIds.value.filter((targetId) => targetId !== id);
  }

  function reconnectTarget(target: SftpDistributionTargetOption) {
    const pane = target.id === "primary" ? options.primaryPaneRef.value : options.remotePaneRefs.value[target.id];
    void pane?.manager.retry.reconnect();
  }

  function startDistribution(event?: MouseEvent) {
    const source = sendSource.value;
    if (!source || !selectedSendTargets.value.length) return;
    const animationOrigin =
      event?.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
    const distributionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const groups = buildSftpDistributionGroups({
      ...source,
      distributionId,
      conflictPolicy: sendConflictPolicy.value,
      targets: selectedSendTargets.value.map((target) => ({
        endpoint: target.endpoint,
        destinationPath: targetPath(target)
      }))
    });
    const batchIds = groups.map((group) => fileTransferStore.enqueueBatch(group.inputs)).filter(Boolean) as string[];
    if (!batchIds.length) return;

    pendingSelectionClears.set(`dist:${distributionId}`, {
      sourceEndpoint: source.sourceEndpoint,
      sourcePath: source.sourcePath,
      sourceSelectionRevision: source.sourceSelectionRevision,
      batchIds,
      expectedTaskCount: source.entries.length * selectedSendTargets.value.length,
      createdAt: Date.now()
    });
    distributionHistory.value[source.sourceEndpoint.id] = selectedSendTargets.value.map((target) => target.id);
    sourcePaneFor(source.sourceEndpoint.id)?.clearSelection();
    sendModalOpen.value = false;
    options.transferCenterRef.value?.signalQueued(animationOrigin);
  }

  function queueSftpTransfer(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    if (!destination || payload.sourceEndpoint.id === destination.id || !payload.entries.length) return;
    const inputs = buildSftpTransferInputs(payload, destination);
    if (!inputs.length) return;
    const batchId = fileTransferStore.enqueueBatch(inputs);
    if (!batchId) return;
    pendingSelectionClears.set(`single:${batchId}`, {
      sourceEndpoint: payload.sourceEndpoint,
      sourcePath: payload.sourcePath,
      sourceSelectionRevision: payload.sourceSelectionRevision,
      batchIds: [batchId],
      expectedTaskCount: inputs.length,
      createdAt: Date.now()
    });
  }

  function queueSftpTransferToSelected(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    const checkedTargets = sendTargetOptions.value.filter(
      (target) => selectedRemoteTargetIds.value.includes(target.id) && target.connected
    );
    if (checkedTargets.length) {
      openSendModal(
        payload,
        checkedTargets.map((target) => target.id)
      );
      return;
    }
    queueSftpTransfer(payload, destination);
  }

  function flashHighlight(side: SftpWorkspaceSide, names: string[]) {
    highlightedNames[side] = names;
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedNames[side] = [];
    }, 3200);
  }

  async function transferEntries(
    fromPane: SftpTransferPaneHandle | null,
    toPane: SftpTransferPaneHandle | null,
    entries: SftpFileEntry[],
    targetSide: SftpWorkspaceSide,
    sourcePath?: string,
    sourceSelection?: Pick<SftpTransferSourcePayload, "sourcePath" | "sourceSelectionRevision">
  ) {
    const files = entries.filter((entry) => !entry.is_dir && entry.name !== "..");
    if (!fromPane || !toPane || transferring.value) return;
    const selectionSnapshot = sourceSelection || fromPane.transferSourcePayload();
    if (!files.length) {
      if (entries.some((entry) => entry.is_dir)) {
        toast.add({ title: options.translate("koko.fileManagement.folderTransferUnsupported"), color: "warning" });
      }
      return;
    }

    transferring.value = true;
    let success = 0;
    const succeededNames: string[] = [];
    try {
      for (const entry of files) {
        try {
          let blob: Blob;
          if (sourcePath && (sourcePath.startsWith("/") || /^[a-z]:[\\/]/i.test(sourcePath))) {
            const separator = sourcePath.includes("\\") ? "\\" : "/";
            const absolute = `${sourcePath.replace(/[\\/]$/, "")}${separator}${entry.name}`;
            blob = await fromPane.manager.operations.readFile(entry, absolute);
          } else if (sourcePath) {
            const absolute = `${sourcePath.replace(/\/$/, "")}/${entry.name}`.replace(/\/+/g, "/");
            blob = await fromPane.manager.operations.readFile(entry, absolute);
          } else {
            blob = await fromPane.manager.operations.readFile(entry);
          }
          await toPane.manager.operations.uploadBlob(entry.name, blob);
          success += 1;
          succeededNames.push(entry.name);
        } catch {
          // Continue remaining files and report the aggregate result.
        }
      }
      toast.add({
        title:
          success === files.length
            ? options.translate("koko.fileManagement.transferSuccess")
            : options.translate("koko.fileManagement.transferPartialSuccess", { success, total: files.length }),
        color: success === files.length ? "success" : "warning"
      });
      if (success) flashHighlight(targetSide, succeededNames);
      if (success && selectionSnapshot) {
        fromPane.clearTransferredSelection(
          succeededNames,
          selectionSnapshot.sourcePath,
          selectionSnapshot.sourceSelectionRevision
        );
      }
      if (targetSide === "left") void options.localPaneRef.value?.list();
      else {
        const target = options.activePaneForSide("right");
        if (target) void options.remotePaneRefs.value[target.id]?.manager.loadCurrentDirectory();
      }
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.transferFailed"), error);
    } finally {
      transferring.value = false;
    }
  }

  function remotePaneByEndpoint(endpointId: string) {
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    return pane ? options.remotePaneRefs.value[pane.id] || null : null;
  }

  function checkedRemotePanes(side?: SftpWorkspaceSide) {
    return options.remotePanes.value.filter(
      (pane) =>
        selectedRemoteTargetIds.value.includes(pane.id) && (!side || pane.side === side) && remotePaneConnected(pane.id)
    );
  }

  async function transferLocalEntriesToCheckedRemotes(
    entries: SftpFileEntry[],
    sourcePath?: string,
    sourceSelection?: Pick<SftpTransferSourcePayload, "sourcePath" | "sourceSelectionRevision">
  ) {
    const targets = checkedRemotePanes("right");
    if (!targets.length) return false;
    const sourcePane = options.localPaneRef.value;
    if (!sourcePane) return false;

    for (const target of targets) {
      await transferEntries(
        sourcePane,
        options.remotePaneRefs.value[target.id] || null,
        entries,
        "right",
        sourcePath,
        sourceSelection
      );
    }
    await Promise.all(targets.map((target) => options.remotePaneRefs.value[target.id]?.manager.loadCurrentDirectory()));
    return true;
  }

  async function handleCrossPaneDrop(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    if (!destination || payload.sourceEndpoint.id === destination.id) return;
    const fromLocal = payload.sourceEndpoint.id === LOCAL_ENDPOINT_ID;
    const toLocal = destination.id === LOCAL_ENDPOINT_ID;
    if (fromLocal || toLocal) {
      const sourcePane = fromLocal ? options.localPaneRef.value : remotePaneByEndpoint(payload.sourceEndpoint.id);
      const destinationPane = toLocal ? options.localPaneRef.value : remotePaneByEndpoint(destination.id);
      const sourceEntries = payload.entries.map(
        (entry) =>
          ({
            name: entry.name,
            size: String(entry.size),
            perm: "",
            mod_time: "",
            type: "",
            is_dir: false
          }) satisfies SftpFileEntry
      );
      if (fromLocal && (await transferLocalEntriesToCheckedRemotes(sourceEntries, payload.sourcePath, payload))) return;
      await transferEntries(
        sourcePane,
        destinationPane,
        sourceEntries,
        toLocal ? "left" : "right",
        payload.sourcePath,
        payload
      );
      return;
    }
    queueSftpTransferToSelected(payload, destination);
  }

  async function transferGlobal(direction: "left-to-right" | "right-to-left") {
    const sourceSide = direction === "left-to-right" ? "left" : "right";
    const targetSide = sourceSide === "left" ? "right" : "left";
    const source = options.activePaneForSide(sourceSide);
    const target = options.activePaneForSide(targetSide);
    const sourceIsLocal = sourceSide === "left" && options.globalActiveIds.left === "local";
    const targetIsLocal = targetSide === "left" && options.globalActiveIds.left === "local";
    const sourcePane = sourceIsLocal
      ? options.localPaneRef.value
      : source
        ? options.remotePaneRefs.value[source.id] || null
        : null;
    const destinationPane = targetIsLocal
      ? options.localPaneRef.value
      : target
        ? options.remotePaneRefs.value[target.id] || null
        : null;

    if (direction === "left-to-right") {
      const checkedTargets = checkedRemotePanes("right");
      if (checkedTargets.length) {
        if (sourceIsLocal) {
          const entries = localSelections.value.length
            ? localSelections.value
            : localSelection.value
              ? [localSelection.value]
              : [];
          await transferLocalEntriesToCheckedRemotes(entries);
        } else if (source) {
          const payload = options.remotePaneRefs.value[source.id]?.transferSourcePayload();
          if (payload)
            openSendModal(
              payload,
              checkedTargets.map((pane) => pane.id)
            );
        }
        return;
      }
    }

    if (!sourceIsLocal && !targetIsLocal && source && target) {
      const payload = options.remotePaneRefs.value[source.id]?.transferSourcePayload();
      if (payload) {
        queueSftpTransfer(
          { ...payload, destinationPath: toValue(options.remotePaneRefs.value[target.id]?.manager.currentPath) || "/" },
          target.transferEndpoint
        );
      }
      return;
    }

    const remoteSelection = source ? options.remotePaneRefs.value[source.id]?.selectedEntries || [] : [];
    const sourceEntries = sourceIsLocal
      ? localSelections.value.length
        ? localSelections.value
        : localSelection.value
          ? [localSelection.value]
          : []
      : remoteSelection.length
        ? remoteSelection
        : source?.selection
          ? [source.selection]
          : [];
    await transferEntries(sourcePane, destinationPane, sourceEntries, targetSide);
  }

  async function uploadWebFiles(files: File[]) {
    const checkedTargets = checkedRemotePanes("right");
    const activeTarget = options.activePaneForSide("right");
    const targets = checkedTargets.length ? checkedTargets : activeTarget ? [activeTarget] : [];
    if (!targets.length) {
      toast.add({ title: options.translate("koko.fileManagement.selectRemoteTarget"), color: "warning" });
      return;
    }
    if (transferring.value) return;
    transferring.value = true;
    let success = 0;
    try {
      for (const target of targets) {
        const targetPane = options.remotePaneRefs.value[target.id];
        if (!targetPane) continue;
        for (const file of files) {
          try {
            await targetPane.manager.operations.uploadBlob(file.name, file);
            success += 1;
          } catch {
            // Continue with remaining files and targets.
          }
        }
      }
      const total = files.length * targets.length;
      toast.add({
        title:
          success === total
            ? options.translate("koko.fileManagement.uploadedFiles", { count: success })
            : options.translate("koko.fileManagement.uploadedFilesPartial", { success, total }),
        color: success === total ? "success" : "warning"
      });
      await Promise.all(
        targets.map((target) => options.remotePaneRefs.value[target.id]?.manager.loadCurrentDirectory())
      );
    } finally {
      transferring.value = false;
    }
  }

  onBeforeUnmount(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
    for (const unregister of endpointUnregisters.values()) unregister();
    endpointUnregisters.clear();
  });

  return {
    activeTransferCount,
    filteredSendTargetOptions,
    handleCrossPaneDrop,
    highlightedNames,
    localSelection,
    localSelections,
    mountTransferEndpoint,
    openSendModal,
    queueSftpTransfer,
    queueSftpTransferToSelected,
    reconnectTarget,
    remotePaneConnected,
    selectAllOnlineTargets,
    selectedSendTargetIds,
    selectedRemoteTargetIds,
    selectedSendTargets,
    selectedSendTotalBytes,
    sendConflictPolicy,
    sendFileCount,
    sendFilesOpen,
    sendModalOpen,
    sendSource,
    sendTargetOptions,
    sendTargetPaths,
    sendTargetSearch,
    sendTotalBytes,
    startDistribution,
    targetPath,
    toggleSendTarget,
    toggleRemoteTarget,
    transferGlobal,
    transferring,
    connectTransferEndpoint,
    unmountTransferEndpoint,
    uploadWebFiles
  };
}
