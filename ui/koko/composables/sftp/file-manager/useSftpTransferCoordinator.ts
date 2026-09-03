import type {
  FileTransferConflictPolicy,
  FileTransferEndpoint,
  FileTransferEndpointRef
} from "@jumpserver/connectors-core";
import type { Ref } from "vue";
import type { SftpFileEntry } from "../protocol";
import type {
  SftpDistributionTargetOption,
  SftpLocalPaneHandle,
  SftpRemotePane,
  SftpRemotePaneHandle,
  SftpTransferDropPayload,
  SftpTransferSourcePayload,
  SftpWorkspaceSide
} from "./workspaceTypes";
import { registerFileTransferEndpoint } from "@jumpserver/connectors-core";
import { computed, onBeforeUnmount, reactive, ref, toValue, watch } from "vue";
import { useSftpTransferUi } from "#koko/composables/sftp/useSftpTransferUi";
import { useFileTransferStore } from "#koko/stores/fileTransfer";
import { buildSftpDistributionGroups } from "#koko/utils/sftpDistribution";
import { buildSftpTransferInputs, filterSftpDistributionTargets } from "./selectors";
import { useBrowserUploadTransferEndpoint, WEB_UPLOAD_ENDPOINT_ID } from "./useBrowserUploadTransferEndpoint";

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
  translate: (key: string, params?: Record<string, unknown>) => string;
  showError: (title: string, error: unknown) => void;
}

const LOCAL_ENDPOINT_ID = "local:fs";
const terminalTransferStatuses = new Set(["completed", "skipped", "failed", "canceled"]);

export function useSftpTransferCoordinator(options: TransferCoordinatorOptions) {
  const toast = useToast();
  const fileTransferStore = useFileTransferStore();
  const transferUi = useSftpTransferUi();
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
  const endpointUnregisters = new Map<string, () => void>();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  /** Web global workbench left pane — stages browser File objects for Transfer Center. */
  const browserUploadEndpoint = useBrowserUploadTransferEndpoint({
    label: options.translate("koko.fileManagement.localUpload")
  });
  let browserUploadMounted = false;

  function ensureBrowserUploadEndpointMounted() {
    if (browserUploadMounted) return;
    mountTransferEndpoint(browserUploadEndpoint);
    browserUploadMounted = true;
    connectTransferEndpoint();
  }

  const sendTargetOptions = computed<SftpDistributionTargetOption[]>(() => {
    const sourceId = sendSource.value?.sourceEndpoint.id;
    const targets: SftpDistributionTargetOption[] = [];
    const primaryPane = options.primaryPaneRef.value;

    if (options.primaryTransferEndpoint.value && options.primaryTransferEndpoint.value.id !== sourceId) {
      targets.push({
        id: "primary",
        endpoint: options.primaryTransferEndpoint.value,
        organizationName: options.currentOrgLabel.value,
        assetName: options.primaryTransferEndpoint.value.label,
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
    if (endpointId === LOCAL_ENDPOINT_ID) return options.localPaneRef.value;
    if (options.primaryTransferEndpoint.value?.id === endpointId) return options.primaryPaneRef.value;
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    return pane ? options.remotePaneRefs.value[pane.id] || null : null;
  }

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
    fileTransferStore.failUnavailableEndpoint(endpoint);
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

  function checkedConnectedTargets(sourceEndpointId?: string) {
    return sendTargetOptions.value.filter(
      (target) =>
        selectedRemoteTargetIds.value.includes(target.id) && target.connected && target.endpoint.id !== sourceEndpointId
    );
  }

  function isSimplePeerMode() {
    return options.remotePanes.value.length === 1;
  }

  function resolveOppositeDestination(sourceEndpointId: string): {
    endpoint: FileTransferEndpointRef;
    destinationPath: string;
  } | null {
    const primary = options.primaryTransferEndpoint.value;
    if (primary?.id === sourceEndpointId) {
      const activeId = options.activeRemoteId.value;
      if (!activeId || !remotePaneConnected(activeId)) return null;
      const pane = options.remotePanes.value.find((item) => item.id === activeId);
      if (!pane) return null;
      return {
        endpoint: pane.transferEndpoint,
        destinationPath: toValue(options.remotePaneRefs.value[activeId]?.manager.currentPath) || "/"
      };
    }

    const sourceRemote = options.remotePanes.value.find((item) => item.transferEndpoint.id === sourceEndpointId);
    if (sourceRemote && primary) {
      return {
        endpoint: primary,
        destinationPath: toValue(options.primaryPaneRef.value?.manager.currentPath) || "/"
      };
    }

    if (sourceRemote) {
      const oppositeSide: SftpWorkspaceSide = sourceRemote.side === "left" ? "right" : "left";
      const opposite = options.activePaneForSide(oppositeSide);
      if (opposite && remotePaneConnected(opposite.id) && opposite.transferEndpoint.id !== sourceEndpointId) {
        return {
          endpoint: opposite.transferEndpoint,
          destinationPath: toValue(options.remotePaneRefs.value[opposite.id]?.manager.currentPath) || "/"
        };
      }
      if (oppositeSide === "left" && options.globalActiveIds.left === "local" && options.localPaneRef.value) {
        return {
          endpoint: { id: LOCAL_ENDPOINT_ID, label: options.translate("koko.fileManagement.localFiles") },
          destinationPath: "/"
        };
      }
    }

    if (sourceEndpointId === LOCAL_ENDPOINT_ID) {
      const right = options.activePaneForSide("right");
      if (right && remotePaneConnected(right.id)) {
        return {
          endpoint: right.transferEndpoint,
          destinationPath: toValue(options.remotePaneRefs.value[right.id]?.manager.currentPath) || "/"
        };
      }
    }

    return null;
  }

  function canSendToOpposite(sourceEndpointId: string | undefined | null) {
    if (!sourceEndpointId || !isSimplePeerMode()) return false;
    return Boolean(resolveOppositeDestination(sourceEndpointId));
  }

  function sendFromSelection(payload: SftpTransferSourcePayload) {
    // Always prefer Transfer Center queue (same as session SFTP↔SFTP), including local↔remote.
    if (isSimplePeerMode()) {
      const opposite = resolveOppositeDestination(payload.sourceEndpoint.id);
      if (opposite) {
        queueSftpTransfer({ ...payload, destinationPath: opposite.destinationPath }, opposite.endpoint);
        return;
      }
    }

    const multi = checkedConnectedTargets(payload.sourceEndpoint.id);
    if (multi.length > 1) {
      openSendModal(
        payload,
        multi.map((target) => target.id)
      );
      return;
    }

    if (multi.length === 1) {
      const target = multi[0]!;
      queueSftpTransfer({ ...payload, destinationPath: targetPath(target) }, target.endpoint);
      return;
    }

    openSendModal(payload);
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

  function startDistribution() {
    const source = sendSource.value;
    if (!source || !selectedSendTargets.value.length) return;
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
    let queued = false;
    for (const group of groups) {
      if (fileTransferStore.enqueueBatch(group.inputs)) queued = true;
    }
    if (!queued) return;

    distributionHistory.value[source.sourceEndpoint.id] = selectedSendTargets.value.map((target) => target.id);
    sourcePaneFor(source.sourceEndpoint.id)?.clearSelection();
    sendModalOpen.value = false;
    transferUi.signalQueued();
  }

  function resolveEndpointSide(endpointId: string): SftpWorkspaceSide | null {
    if (options.primaryTransferEndpoint.value?.id === endpointId) return "left";
    if (endpointId === LOCAL_ENDPOINT_ID) return "left";
    if (endpointId === WEB_UPLOAD_ENDPOINT_ID) return "left";
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    if (!pane) return null;
    // Session dual-pane always treats remotes as the right surface.
    if (options.primaryTransferEndpoint.value) return "right";
    return pane.side;
  }

  function queueSftpTransfer(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    if (!destination || payload.sourceEndpoint.id === destination.id || !payload.entries.length) return;
    const inputs = buildSftpTransferInputs(payload, destination);
    if (!inputs.length) return;
    const batchId = fileTransferStore.enqueueBatch(inputs);
    if (!batchId) return;
    sourcePaneFor(payload.sourceEndpoint.id)?.clearSelection();
    // Highlight destination rows as soon as transfer is queued; list reload keeps the class.
    const side = resolveEndpointSide(destination.id);
    if (side) {
      flashHighlight(
        side,
        payload.entries.map((entry) => entry.name)
      );
    }
    transferUi.signalQueued();
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

  function checkedRemotePanes(side?: SftpWorkspaceSide) {
    return options.remotePanes.value.filter(
      (pane) =>
        selectedRemoteTargetIds.value.includes(pane.id) && (!side || pane.side === side) && remotePaneConnected(pane.id)
    );
  }

  async function handleCrossPaneDrop(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    if (!destination || payload.sourceEndpoint.id === destination.id) return;
    // Global local↔remote and remote↔remote both use Transfer Center (session criterion).
    const fromLocal = payload.sourceEndpoint.id === LOCAL_ENDPOINT_ID;
    if (fromLocal) {
      const checkedTargets = checkedRemotePanes("right");
      if (checkedTargets.length > 1) {
        openSendModal(
          payload,
          checkedTargets.map((pane) => pane.id)
        );
        return;
      }
    }
    queueSftpTransferToSelected(payload, destination);
  }

  async function transferGlobal(direction: "left-to-right" | "right-to-left") {
    // Session dual-pane: primary SFTP (left) <-> active remote (right).
    // Center arrows transfer to the opposite pane; selection-bar "send to" still opens the modal.
    if (options.primaryTransferEndpoint.value && options.primaryPaneRef.value) {
      const activeId = options.activeRemoteId.value;
      const remote = activeId ? options.remotePanes.value.find((pane) => pane.id === activeId) : null;
      if (remote && remotePaneConnected(activeId!)) {
        if (direction === "left-to-right") {
          const payload = options.primaryPaneRef.value.transferSourcePayload();
          if (!payload?.entries.length) {
            toast.add({ title: options.translate("koko.fileManagement.selectFilesToTransfer"), color: "warning" });
            return;
          }
          queueSftpTransfer(
            {
              ...payload,
              destinationPath: toValue(options.remotePaneRefs.value[remote.id]?.manager.currentPath) || "/"
            },
            remote.transferEndpoint
          );
          return;
        }
        const payload = options.remotePaneRefs.value[remote.id]?.transferSourcePayload();
        if (!payload?.entries.length) {
          toast.add({ title: options.translate("koko.fileManagement.selectFilesToTransfer"), color: "warning" });
          return;
        }
        queueSftpTransfer(
          {
            ...payload,
            destinationPath: toValue(options.primaryPaneRef.value.manager.currentPath) || "/"
          },
          options.primaryTransferEndpoint.value
        );
        return;
      }
    }

    // Global workbench: keep center arrows, but queue through Transfer Center like session SFTP.
    const sourceSide = direction === "left-to-right" ? "left" : "right";
    const targetSide = sourceSide === "left" ? "right" : "left";
    const source = options.activePaneForSide(sourceSide);
    const target = options.activePaneForSide(targetSide);
    const sourceIsLocal = sourceSide === "left" && options.globalActiveIds.left === "local";
    const targetIsLocal = targetSide === "left" && options.globalActiveIds.left === "local";

    if (direction === "left-to-right") {
      const checkedTargets = checkedRemotePanes("right");
      if (checkedTargets.length > 1) {
        const payload = sourceIsLocal
          ? options.localPaneRef.value?.transferSourcePayload()
          : source
            ? options.remotePaneRefs.value[source.id]?.transferSourcePayload()
            : null;
        if (payload) {
          openSendModal(
            payload,
            checkedTargets.map((pane) => pane.id)
          );
        } else {
          toast.add({ title: options.translate("koko.fileManagement.selectFilesToTransfer"), color: "warning" });
        }
        return;
      }
    }

    const payload = sourceIsLocal
      ? options.localPaneRef.value?.transferSourcePayload()
      : source
        ? options.remotePaneRefs.value[source.id]?.transferSourcePayload()
        : null;
    if (!payload?.entries.length) {
      toast.add({ title: options.translate("koko.fileManagement.selectFilesToTransfer"), color: "warning" });
      return;
    }

    if (targetIsLocal) {
      const localPath = toValue(options.localPaneRef.value?.manager.currentPath) || "/";
      queueSftpTransfer(
        { ...payload, destinationPath: localPath },
        {
          id: LOCAL_ENDPOINT_ID,
          label: options.translate("koko.fileManagement.localFiles")
        }
      );
      return;
    }

    if (target) {
      queueSftpTransfer(
        {
          ...payload,
          destinationPath: toValue(options.remotePaneRefs.value[target.id]?.manager.currentPath) || "/"
        },
        target.transferEndpoint
      );
    }
  }

  async function uploadWebFiles(files: File[]) {
    // Browser global left pane has no local FS — stage File objects and use Transfer Center.
    if (!files.length) return;
    const checkedTargets = checkedRemotePanes("right");
    const activeTarget = options.activePaneForSide("right");
    const targets = checkedTargets.length ? checkedTargets : activeTarget ? [activeTarget] : [];
    if (!targets.length) {
      toast.add({ title: options.translate("koko.fileManagement.selectRemoteTarget"), color: "warning" });
      return;
    }

    ensureBrowserUploadEndpointMounted();
    const staged = browserUploadEndpoint.stageFiles(files);
    if (!staged.entries.length) return;

    const payload: SftpTransferSourcePayload = {
      sourceEndpoint: browserUploadEndpoint.ref,
      sourcePath: staged.sourcePath,
      sourceSelectionRevision: Date.now(),
      entries: staged.entries
    };

    if (targets.length > 1) {
      openSendModal(
        payload,
        targets.map((pane) => pane.id)
      );
      return;
    }

    const target = targets[0]!;
    queueSftpTransfer(
      {
        ...payload,
        destinationPath: toValue(options.remotePaneRefs.value[target.id]?.manager.currentPath) || "/"
      },
      target.transferEndpoint
    );
  }

  onBeforeUnmount(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
    for (const unregister of endpointUnregisters.values()) unregister();
    endpointUnregisters.clear();
  });

  return {
    activeTransferCount,
    canSendToOpposite,
    filteredSendTargetOptions,
    handleCrossPaneDrop,
    highlightedNames,
    isSimplePeerMode,
    localSelection,
    localSelections,
    mountTransferEndpoint,
    openSendModal,
    queueSftpTransfer,
    queueSftpTransferToSelected,
    reconnectTarget,
    remotePaneConnected,
    resolveOppositeDestination,
    selectAllOnlineTargets,
    selectedSendTargetIds,
    selectedRemoteTargetIds,
    selectedSendTargets,
    selectedSendTotalBytes,
    sendConflictPolicy,
    sendFileCount,
    sendFilesOpen,
    sendFromSelection,
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
