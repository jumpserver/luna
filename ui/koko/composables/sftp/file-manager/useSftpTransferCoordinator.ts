import type {
  CreateFileTransferTaskInput,
  FileTransferConflictPolicy,
  FileTransferEndpoint,
  FileTransferEndpointRef
} from "@jumpserver/connectors-core";
import type { Ref } from "vue";
import type { SftpFileEntry } from "../protocol";
import type { BrowserUploadSelection, ExpandedTransferSelection } from "./transfer";
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
import { useKokoHostAdapter } from "#koko/host";
import { registerFolderConflictResolver, useFileTransferStore } from "#koko/stores/fileTransfer";
import { buildSftpDistributionGroups } from "#koko/utils/sftpDistribution";
import { classifySftpWireError } from "../protocol";
import {
  buildSftpTransferInputs,
  collidingTopLevelFolders,
  destRootFromTask,
  filterSftpDistributionTargets,
  joinTransferPath,
  nextKeepBothFolderName,
  pathBelongsToFolder,
  rewriteFolderPrefix,
  safeLocalDownloadName,
  sftpFolderConflictError,
  topLevelFolderName,
  uniqueRemotePanesForSend
} from "./selectors";
import { expandTransferSelection } from "./transfer";
import { useBrowserDownloadTransferEndpoint } from "./useBrowserDownloadTransferEndpoint";
import { useBrowserUploadTransferEndpoint, WEB_UPLOAD_ENDPOINT_ID } from "./useBrowserUploadTransferEndpoint";
import { resolveLocalFsDestinationPath, useLocalFileTransferEndpoint } from "./useLocalFileTransferEndpoint";

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
const LOCAL_DOWNLOADS_ENDPOINT_ID = "local:downloads";
const terminalTransferStatuses = new Set(["completed", "skipped", "failed", "canceled"]);
let browserDownloadEndpoint: FileTransferEndpoint | undefined;
let localDownloadsEndpoint: FileTransferEndpoint | undefined;

export function useSftpTransferCoordinator(options: TransferCoordinatorOptions) {
  const toast = useToast();
  const host = useKokoHostAdapter();
  const desktopRuntime = host.isDesktopRuntime();
  const fileTransferStore = useFileTransferStore();
  const transferUi = useSftpTransferUi();
  const transferring = ref(false);
  const sendModalOpen = ref(false);
  const paneOnline = reactive<Record<string, boolean>>({});
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
  const pendingFolderConflicts = new Map<
    string,
    {
      destination: FileTransferEndpointRef;
      destinationPath: string;
      folders: string[];
      directories: string[];
    }
  >();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  /** Web global workbench left pane — stages browser File objects for Transfer Center. */
  const browserUploadEndpoint = useBrowserUploadTransferEndpoint({
    id: `${WEB_UPLOAD_ENDPOINT_ID}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    label: options.translate("koko.fileManagement.localUpload")
  });
  const downloadEndpoint = desktopRuntime
    ? (localDownloadsEndpoint ??= useLocalFileTransferEndpoint({
        id: LOCAL_DOWNLOADS_ENDPOINT_ID,
        label: options.translate("koko.localFile.quickDownload"),
        getCurrentPath: () => "",
        isAvailable: host.localFiles.isAvailable
      }))
    : (browserDownloadEndpoint ??= useBrowserDownloadTransferEndpoint({
        label: options.translate("koko.actions.download")
      }));
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
        connected: paneOnline.primary === true
      });
    }

    const rankedRemotes = [...options.remotePanes.value].sort((left, right) => {
      const leftConnected = paneOnline[left.id] === true ? 1 : 0;
      const rightConnected = paneOnline[right.id] === true ? 1 : 0;
      if (leftConnected !== rightConnected) return rightConnected - leftConnected;
      return Number(right.side === "right") - Number(left.side === "right");
    });
    for (const pane of uniqueRemotePanesForSend(rankedRemotes)) {
      if (pane.transferEndpoint.id === sourceId) continue;
      const paneRef = options.remotePaneRefs.value[pane.id];
      targets.push({
        id: pane.id,
        endpoint: pane.transferEndpoint,
        organizationName: pane.organizationName,
        assetName: pane.assetName,
        destinationPath: toValue(paneRef?.manager.currentPath) || "/",
        connected: paneOnline[pane.id] === true
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
    sendTargetOptions,
    (targets) => {
      selectedSendTargetIds.value = selectedSendTargetIds.value.filter((id) =>
        targets.some((target) => target.id === id && target.connected)
      );
    },
    { deep: false }
  );

  watch(
    () => options.remotePanes.value.map((pane) => pane.id),
    (paneIds) => {
      const available = new Set(paneIds);
      selectedRemoteTargetIds.value = selectedRemoteTargetIds.value.filter((id) => available.has(id));
    }
  );

  function remotePaneFor(endpointId: string): SftpRemotePaneHandle | null {
    if (options.primaryTransferEndpoint.value?.id === endpointId) return options.primaryPaneRef.value;
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    return pane ? options.remotePaneRefs.value[pane.id] || null : null;
  }

  function refreshDestinationListing(destinationId: string) {
    if (destinationId === LOCAL_ENDPOINT_ID) {
      void options.localPaneRef.value?.refresh();
      return;
    }
    void remotePaneFor(destinationId)?.refresh();
  }

  function sourcePaneFor(endpointId: string) {
    if (endpointId === LOCAL_ENDPOINT_ID) return options.localPaneRef.value;
    return remotePaneFor(endpointId);
  }

  function transferRelativePath(...parts: string[]) {
    return parts
      .filter(Boolean)
      .join("/")
      .replace(/^\/+|\/+$/g, "");
  }

  function browserExpandedSelection(payload: SftpTransferSourcePayload): ExpandedTransferSelection {
    const directories = new Set<string>();
    const entries = payload.entries.filter((entry) => !entry.is_dir);
    for (const entry of payload.entries) {
      const path = entry.is_dir
        ? transferRelativePath(entry.relativeDir || "", entry.name)
        : transferRelativePath(entry.relativeDir || "");
      const parts = path.split("/").filter(Boolean);
      for (let index = 1; index <= parts.length; index++) directories.add(parts.slice(0, index).join("/"));
    }
    return { entries, directories: [...directories], failures: [] };
  }

  async function listLocalDirectory(path: string) {
    const entries: Array<Pick<SftpFileEntry, "name" | "size" | "is_dir">> = [];
    for (const entry of await host.localFiles.readDir(path)) {
      const info = await host.localFiles.stat(await host.localFiles.join(path, entry.name));
      entries.push({
        name: entry.name,
        size: info.isFile ? String(info.size) : "",
        is_dir: entry.isDirectory && !entry.isSymlink
      });
    }
    return entries;
  }

  async function expandSourceSelection(payload: SftpTransferSourcePayload): Promise<ExpandedTransferSelection> {
    const hasFolders = payload.entries.some((entry) => entry.is_dir);
    if (!hasFolders) return { entries: payload.entries, directories: [], failures: [] };

    let expanded: ExpandedTransferSelection;
    if (payload.sourceEndpoint.id.startsWith(WEB_UPLOAD_ENDPOINT_ID)) {
      expanded = browserExpandedSelection(payload);
    } else {
      let listDirectory = listLocalDirectory;
      if (payload.sourceEndpoint.id !== LOCAL_ENDPOINT_ID) {
        listDirectory = (path: string) => {
          const pane = remotePaneFor(payload.sourceEndpoint.id);
          if (!pane) throw new Error("SFTP source is unavailable");
          return pane.manager.operations.listDirectory(path, { background: true });
        };
      }
      expanded = await expandTransferSelection(payload, listDirectory);
    }
    if (expanded.failures.length) {
      options.showError(options.translate("koko.fileManagement.operationFailed"), expanded.failures[0]?.cause);
    }
    if (expanded.entries.length > 1000) {
      toast.add({ title: options.translate("koko.fileManagement.folderTransferLargeWarning"), color: "warning" });
    }
    return expanded;
  }

  async function createDestinationDirectories(
    destination: FileTransferEndpointRef,
    destinationPath: string,
    directories: string[]
  ) {
    const paths = [...new Set(directories)].sort((left, right) => left.split("/").length - right.split("/").length);
    for (const directory of paths) {
      const path = joinTransferPath(destinationPath, directory);
      try {
        if (destination.id === LOCAL_ENDPOINT_ID || destination.id === LOCAL_DOWNLOADS_ENDPOINT_ID) {
          await host.localFiles.mkdir(path, { recursive: true });
        } else {
          const pane = remotePaneFor(destination.id);
          if (!pane) throw new Error("SFTP destination is unavailable");
          await pane.manager.operations.createDirectoryAt(path);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (classifySftpWireError({ error_code: message, err: message }) !== "already_exists") throw cause;
      }
    }
  }

  async function listDestinationEntries(destination: FileTransferEndpointRef, path: string) {
    if (destination.id === LOCAL_ENDPOINT_ID || destination.id === LOCAL_DOWNLOADS_ENDPOINT_ID) {
      return listLocalDirectory(path);
    }
    const pane = remotePaneFor(destination.id);
    if (!pane) throw new Error("SFTP destination is unavailable");
    return pane.manager.operations.listDirectory(path, { background: true });
  }

  async function splitFolderConflicts(
    destination: FileTransferEndpointRef,
    destinationPath: string,
    payload: SftpTransferSourcePayload,
    directories: string[]
  ) {
    const folders = [
      ...new Set(payload.entries.filter((entry) => entry.is_dir && entry.name !== "..").map((entry) => entry.name))
    ];
    if (!folders.length) return { colliding: [] as string[], safeDirectories: directories };
    try {
      const destEntries = await listDestinationEntries(destination, destinationPath);
      const colliding = collidingTopLevelFolders(folders, destEntries);
      return {
        colliding,
        safeDirectories: directories.filter(
          (directory) => !colliding.some((folder) => pathBelongsToFolder(directory, folder))
        )
      };
    } catch {
      return { colliding: [] as string[], safeDirectories: directories };
    }
  }

  function applyFolderConflictStatus(inputs: CreateFileTransferTaskInput[], colliding: string[]) {
    if (!colliding.length) return inputs;
    const folders = new Set(colliding);
    return inputs.map((input) => {
      const folder = topLevelFolderName(input.source.relativeDir);
      if (!folder || !folders.has(folder)) return input;
      return { ...input, status: "paused" as const, error: sftpFolderConflictError };
    });
  }

  async function resolveFolderConflict(batchId: string, policy: Exclude<FileTransferConflictPolicy, "ask">) {
    const pending = pendingFolderConflicts.get(batchId);
    const paused = fileTransferStore.tasks.filter(
      (task) => task.batchId === batchId && task.status === "paused" && task.error === sftpFolderConflictError
    );
    if (!paused.length) {
      pendingFolderConflicts.delete(batchId);
      return;
    }
    if (policy === "skip") {
      for (const task of paused) fileTransferStore.patchTask(task.id, { status: "skipped", error: undefined });
      pendingFolderConflicts.delete(batchId);
      return;
    }
    const destination = pending?.destination || paused[0]!.destinationEndpoint;
    const destinationPath =
      pending?.destinationPath || destRootFromTask(paused[0]!.destinationPath, paused[0]!.source.relativeDir);
    let directories = pending?.directories || [
      ...new Set(paused.map((task) => task.source.relativeDir).filter((value): value is string => Boolean(value)))
    ];
    if (policy === "keep_both") {
      const listing = await listDestinationEntries(destination, destinationPath);
      const existing = new Set(listing.map((entry) => entry.name));
      const renameMap = new Map<string, string>();
      for (const folder of pending?.folders || [
        ...new Set(paused.map((task) => topLevelFolderName(task.source.relativeDir)).filter(Boolean))
      ]) {
        const next = nextKeepBothFolderName(folder, existing);
        renameMap.set(folder, next);
        existing.add(next);
      }
      directories = directories.map((directory) => {
        const folder = topLevelFolderName(directory);
        const renamed = folder ? renameMap.get(folder) : undefined;
        return renamed ? rewriteFolderPrefix(directory, folder, renamed) : directory;
      });
      for (const task of paused) {
        const folder = topLevelFolderName(task.source.relativeDir);
        const renamed = folder ? renameMap.get(folder) : undefined;
        if (!renamed || !folder) continue;
        const relativeDir = rewriteFolderPrefix(task.source.relativeDir || folder, folder, renamed);
        fileTransferStore.patchTask(task.id, {
          source: { ...task.source, relativeDir },
          destinationPath: joinTransferPath(destinationPath, relativeDir)
        });
      }
    }
    await createDestinationDirectories(destination, destinationPath, directories);
    for (const task of paused) fileTransferStore.patchTask(task.id, { status: "queued", error: undefined });
    pendingFolderConflicts.delete(batchId);
    fileTransferStore.kick();
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
    return paneOnline[paneId] === true;
  }

  function setPaneOnline(id: string, online: boolean) {
    paneOnline[id] = online;
  }

  function mountTransferEndpoint(endpoint: FileTransferEndpoint) {
    endpointUnregisters.get(endpoint.ref.id)?.();
    endpointUnregisters.set(endpoint.ref.id, registerFileTransferEndpoint(endpoint));
  }

  function connectTransferEndpoint() {
    fileTransferStore.kick();
  }

  mountTransferEndpoint(downloadEndpoint);

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
          destinationPath: resolveLocalFsDestinationPath(toValue(options.localPaneRef.value.manager.currentPath) || "")
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

  async function startDistribution() {
    const source = sendSource.value;
    if (!source || !selectedSendTargets.value.length) return;
    const expanded = await expandSourceSelection(source);
    const readyTargets: Array<SftpDistributionTargetOption & { colliding: string[] }> = [];
    for (const target of selectedSendTargets.value) {
      try {
        const destinationPath = targetPath(target);
        const { colliding, safeDirectories } = await splitFolderConflicts(
          target.endpoint,
          destinationPath,
          source,
          expanded.directories
        );
        await createDestinationDirectories(target.endpoint, destinationPath, safeDirectories);
        readyTargets.push({ ...target, colliding });
      } catch (error) {
        options.showError(options.translate("koko.fileManagement.operationFailed"), error);
      }
    }
    if (!readyTargets.length) return;
    const distributionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const groups = buildSftpDistributionGroups({
      ...source,
      entries: expanded.entries,
      distributionId,
      conflictPolicy: sendConflictPolicy.value,
      targets: readyTargets.map((target) => ({ endpoint: target.endpoint, destinationPath: targetPath(target) }))
    });
    let queued = false;
    for (const group of groups) {
      const target = readyTargets.find((item) => item.endpoint.id === group.destination.id);
      const colliding = target?.colliding || [];
      const batchId = fileTransferStore.enqueueBatch(applyFolderConflictStatus(group.inputs, colliding));
      if (batchId) {
        queued = true;
        if (target && colliding.length) {
          pendingFolderConflicts.set(batchId, {
            destination: target.endpoint,
            destinationPath: targetPath(target),
            folders: colliding,
            directories: expanded.directories.filter((directory) =>
              colliding.some((folder) => pathBelongsToFolder(directory, folder))
            )
          });
        }
      }
    }
    if (!queued && !expanded.directories.length) return;

    distributionHistory.value[source.sourceEndpoint.id] = readyTargets.map((target) => target.id);
    sourcePaneFor(source.sourceEndpoint.id)?.clearSelection();
    sendModalOpen.value = false;
    if (queued) transferUi.signalQueued();
    else {
      for (const target of readyTargets) refreshDestinationListing(target.endpoint.id);
      toast.add({ title: options.translate("koko.fileManagement.folderTransferCompleted"), color: "success" });
    }
  }

  function resolveEndpointSide(endpointId: string): SftpWorkspaceSide | null {
    if (options.primaryTransferEndpoint.value?.id === endpointId) return "left";
    if (endpointId === LOCAL_ENDPOINT_ID) return "left";
    if (endpointId === WEB_UPLOAD_ENDPOINT_ID || endpointId.startsWith(`${WEB_UPLOAD_ENDPOINT_ID}:`)) return "left";
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === endpointId);
    if (!pane) return null;
    // Session dual-pane always treats remotes as the right surface.
    if (options.primaryTransferEndpoint.value) return "right";
    return pane.side;
  }

  async function queueSftpDownload(payload: SftpTransferSourcePayload) {
    if (!desktopRuntime && payload.entries.some((entry) => entry.is_dir)) {
      toast.add({ title: options.translate("koko.fileManagement.folderDownloadSingleOnly"), color: "warning" });
      return;
    }
    try {
      const destinationPath = desktopRuntime ? await host.localFiles.downloadDir() : "/";
      const expanded = desktopRuntime
        ? await expandSourceSelection(payload)
        : { entries: payload.entries, directories: [], failures: [] };
      const { colliding, safeDirectories } = desktopRuntime
        ? await splitFolderConflicts(downloadEndpoint.ref, destinationPath, payload, expanded.directories)
        : { colliding: [] as string[], safeDirectories: expanded.directories };
      await createDestinationDirectories(downloadEndpoint.ref, destinationPath, safeDirectories);
      const inputs = applyFolderConflictStatus(
        buildSftpTransferInputs({ ...payload, entries: expanded.entries, destinationPath }, downloadEndpoint.ref),
        colliding
      ).map((input) => ({
        ...input,
        source: desktopRuntime ? { ...input.source, name: safeLocalDownloadName(input.source.name) } : input.source,
        conflictPolicy: desktopRuntime ? ("keep_both" as const) : input.conflictPolicy
      }));
      const queued = fileTransferStore.enqueueBatch(inputs);
      if (queued && colliding.length) {
        pendingFolderConflicts.set(queued, {
          destination: downloadEndpoint.ref,
          destinationPath,
          folders: colliding,
          directories: expanded.directories.filter((directory) =>
            colliding.some((folder) => pathBelongsToFolder(directory, folder))
          )
        });
      }
      if (!queued && !expanded.directories.length) return;
      sourcePaneFor(payload.sourceEndpoint.id)?.clearSelection();
      if (queued) transferUi.signalQueued();
      else toast.add({ title: options.translate("koko.fileManagement.folderTransferCompleted"), color: "success" });
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.operationFailed"), error);
    }
  }

  async function localDestinationPath(preferred = "") {
    const fromPane = resolveLocalFsDestinationPath(
      preferred,
      toValue(options.localPaneRef.value?.manager.currentPath) || ""
    );
    if (fromPane) return fromPane;
    try {
      return resolveLocalFsDestinationPath(await host.localFiles.homeDir());
    } catch {
      return "";
    }
  }

  async function queueSftpTransfer(payload: SftpTransferDropPayload, destination?: FileTransferEndpointRef) {
    if (!destination || payload.sourceEndpoint.id === destination.id || !payload.entries.length) return;
    try {
      const destinationPath =
        destination.id === LOCAL_ENDPOINT_ID
          ? await localDestinationPath(payload.destinationPath)
          : payload.destinationPath;
      if (destination.id === LOCAL_ENDPOINT_ID && !destinationPath)
        throw new Error("Local destination path is unavailable");
      const expanded = await expandSourceSelection(payload);
      const { colliding, safeDirectories } = await splitFolderConflicts(
        destination,
        destinationPath,
        payload,
        expanded.directories
      );
      await createDestinationDirectories(destination, destinationPath, safeDirectories);
      const inputs = applyFolderConflictStatus(
        buildSftpTransferInputs({ ...payload, entries: expanded.entries, destinationPath }, destination),
        colliding
      );
      const batchId = fileTransferStore.enqueueBatch(inputs);
      if (batchId && colliding.length) {
        pendingFolderConflicts.set(batchId, {
          destination,
          destinationPath,
          folders: colliding,
          directories: expanded.directories.filter((directory) =>
            colliding.some((folder) => pathBelongsToFolder(directory, folder))
          )
        });
      }
      if (!batchId && !expanded.directories.length) return;
      sourcePaneFor(payload.sourceEndpoint.id)?.clearSelection();
      // Highlight destination rows as soon as transfer is queued; list reload keeps the class.
      const side = resolveEndpointSide(destination.id);
      if (side)
        flashHighlight(
          side,
          payload.entries.map((entry) => entry.name)
        );
      if (batchId) transferUi.signalQueued();
      else {
        refreshDestinationListing(destination.id);
        toast.add({ title: options.translate("koko.fileManagement.folderTransferCompleted"), color: "success" });
      }
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.operationFailed"), error);
    }
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
      const localPath = resolveLocalFsDestinationPath(toValue(options.localPaneRef.value?.manager.currentPath) || "");
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

  function uploadWebFiles(selection: BrowserUploadSelection) {
    // Browser global left pane has no local FS — stage File objects and pick targets in the send modal.
    if (!selection.items.length) return;
    if (!options.remotePanes.value.some((pane) => remotePaneConnected(pane.id))) {
      toast.add({ title: options.translate("koko.fileManagement.selectRemoteTarget"), color: "warning" });
      return;
    }

    ensureBrowserUploadEndpointMounted();
    const staged = browserUploadEndpoint.stageFiles(selection.items);
    if (!staged.entries.length) return;

    const checkedTargets = checkedRemotePanes("right");
    const activeTarget = options.activePaneForSide("right");
    openSendModal(
      {
        sourceEndpoint: browserUploadEndpoint.ref,
        sourcePath: staged.sourcePath,
        sourceSelectionRevision: Date.now(),
        entries: staged.entries
      },
      checkedTargets.length ? checkedTargets.map((pane) => pane.id) : activeTarget ? [activeTarget.id] : []
    );
  }

  function destinationPathFor(destination: FileTransferEndpointRef) {
    if (options.primaryTransferEndpoint.value?.id === destination.id) {
      return toValue(options.primaryPaneRef.value?.manager.currentPath) || "/";
    }
    const pane = options.remotePanes.value.find((item) => item.transferEndpoint.id === destination.id);
    return toValue(options.remotePaneRefs.value[pane?.id || ""]?.manager.currentPath) || "/";
  }

  function uploadBrowserFiles(selection: BrowserUploadSelection, destination?: FileTransferEndpointRef) {
    if (!destination || !selection.items.length) return;
    ensureBrowserUploadEndpointMounted();
    const staged = browserUploadEndpoint.stageFiles(selection.items);
    if (!staged.entries.length) return;
    queueSftpTransfer(
      {
        sourceEndpoint: browserUploadEndpoint.ref,
        sourcePath: staged.sourcePath,
        sourceSelectionRevision: Date.now(),
        entries: staged.entries,
        destinationPath: destinationPathFor(destination)
      },
      destination
    );
  }

  function uploadToPrimary(selection: BrowserUploadSelection) {
    uploadBrowserFiles(selection, options.primaryTransferEndpoint.value);
  }

  onBeforeUnmount(
    registerFolderConflictResolver((batchId, policy) => {
      void resolveFolderConflict(batchId, policy);
    })
  );
  onBeforeUnmount(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
    for (const [endpointId, unregister] of endpointUnregisters) {
      if (endpointId !== downloadEndpoint.ref.id) unregister();
    }
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
    queueSftpDownload,
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
    setPaneOnline,
    startDistribution,
    targetPath,
    toggleSendTarget,
    toggleRemoteTarget,
    transferGlobal,
    transferring,
    connectTransferEndpoint,
    unmountTransferEndpoint,
    uploadBrowserFiles,
    uploadToPrimary,
    uploadWebFiles
  };
}
