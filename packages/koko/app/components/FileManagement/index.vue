<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { KokoSftpAsset } from "@jumpserver/koko/host";
import type { SftpFileOperations } from "#koko/composables/sftp/protocol";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { FileTransferConflictPolicy, FileTransferEndpointRef } from "~/shared/file-transfer/types";
import { connectorSessionKey, resolveDevHost } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import prettyBytes from "pretty-bytes";
import KokoLocalFileManagementPane from "#koko/components/FileManagement/localPane.vue";
import KokoFileManagementPane from "#koko/components/FileManagement/pane.vue";
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import KokoWebUploadPane from "#koko/components/FileManagement/webUploadPane.vue";
import { useSftpTour } from "#koko/composables/sftp/useSftpTour";
import { buildSftpDistributionGroups } from "#koko/utils/sftpDistribution";
import { useFileTransferStore } from "~/store/modules/fileTransfer";

interface RemotePane {
  id: string;
  side: "left" | "right";
  context: ConnectorSessionContext;
  organizationName: string;
  assetName: string;
  transferEndpoint: FileTransferEndpointRef;
  selection: SftpFileEntry | null;
}

interface SftpTransferDropPayload {
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  sourceSelectionRevision: number;
  entries: Array<Pick<SftpFileEntry, "name" | "size">>;
  destinationPath: string;
}

type SftpTransferSourcePayload = Omit<SftpTransferDropPayload, "destinationPath">;

interface DistributionTargetOption {
  id: string;
  endpoint: FileTransferEndpointRef;
  organizationName: string;
  assetName: string;
  destinationPath: string;
  connected: boolean;
}

interface TransferPane {
  manager: {
    operations: Pick<SftpFileOperations, "readFile" | "uploadBlob">;
  };
}

const props = defineProps<{
  sftpToken?: string;
  showEmpty?: boolean;
  global?: boolean;
}>();

const emit = defineEmits<{ reconnect: [] }>();

const { t } = useI18n();
const sftpTour = useSftpTour();
const toast = useToast();
const { addErrorToast: showErrorToast } = useErrorToast();
const fileTransferStore = useFileTransferStore();
const hostAdapter = useKokoHostAdapter();
const createSftpSession = hostAdapter.sftp.useSessionCreator();

const providedContext = inject(connectorSessionKey, ref(null));
const primaryContext = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  if (value.tokenId === props.sftpToken) return value;
  return { ...value, tokenId: props.sftpToken };
});
const primaryTransferEndpoint = computed<FileTransferEndpointRef | undefined>(() => {
  if (!primaryContext.value) return undefined;
  return {
    id: `sftp:${primaryContext.value.tokenId}`,
    label: t("koko.fileManagement.localSftp")
  };
});

const paneId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const dualMode = ref(false);
const remotePanes = ref<RemotePane[]>([]);
const activeRemoteId = ref<string | null>(null);
const connectModalOpen = ref(false);
const connectSide = ref<"left" | "right">("left");
const remoteAssetSearch = ref("");
const remoteConnecting = ref(false);
const transferring = ref(false);
const sendModalOpen = ref(false);
const sendSource = ref<SftpTransferSourcePayload | null>(null);
const sendTargetSearch = ref("");
const selectedSendTargetIds = ref<string[]>([]);
const sendTargetPaths = ref<Record<string, string>>({});
const sendConflictPolicy = ref<FileTransferConflictPolicy>("ask");
const sendFilesOpen = ref(false);
let tourTimer: ReturnType<typeof setTimeout> | undefined;

const terminalTransferStatuses = new Set(["completed", "skipped", "failed", "canceled"]);

// 操作跟踪接口：记录传输操作的元数据
interface TransferOperationTracking {
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  sourceSelectionRevision: number;
  batchIds: string[];
  expectedTaskCount: number; // 期望的任务总数
  createdAt: number; // 创建时间戳，用于超时清理
}

const pendingSelectionClears = new Map<string, TransferOperationTracking>();

// 分发历史记录：用于智能目标推荐
const distributionHistory = useLocalStorage<Record<string, string[]>>("sftp-distribution-history", {});

const primaryPaneRef = ref<InstanceType<typeof KokoFileManagementPane> | null>(null);
const transferCenterRef = ref<InstanceType<typeof KokoSftpTransferCenter> | null>(null);
const remotePaneRefs = ref<Record<string, InstanceType<typeof KokoFileManagementPane> | null>>({});
const localSelection = ref<SftpFileEntry | null>(null);
const localPaneRef = ref<InstanceType<typeof KokoLocalFileManagementPane> | null>(null);

const globalActiveIds = reactive<{ left: string | null; right: string | null }>({ left: null, right: null });
const panesForSide = (side: "left" | "right") => remotePanes.value.filter((pane) => pane.side === side);
const activePaneForSide = (side: "left" | "right") =>
  remotePanes.value.find((pane) => pane.id === globalActiveIds[side]) || null;
const currentOrgId = computed(() => hostAdapter.sftp.currentOrganization.value?.id || "");
const currentOrgLabel = computed(
  () => hostAdapter.sftp.currentOrganization.value?.name || t("koko.fileManagement.selectOrganization")
);
const sendTargetOptions = computed<DistributionTargetOption[]>(() => {
  const sourceId = sendSource.value?.sourceEndpoint.id;
  const options: DistributionTargetOption[] = [];

  if (primaryTransferEndpoint.value && primaryTransferEndpoint.value.id !== sourceId) {
    options.push({
      id: "primary",
      endpoint: primaryTransferEndpoint.value,
      organizationName: currentOrgLabel.value,
      assetName: t("koko.fileManagement.localSftp"),
      destinationPath: primaryPaneRef.value?.manager.currentPath.value || "/",
      connected: Boolean(primaryPaneRef.value?.manager.connected.value)
    });
  }

  for (const pane of remotePanes.value) {
    if (pane.transferEndpoint.id === sourceId) continue;
    const paneRef = remotePaneRefs.value[pane.id];
    options.push({
      id: pane.id,
      endpoint: pane.transferEndpoint,
      organizationName: pane.organizationName,
      assetName: pane.assetName,
      destinationPath: paneRef?.manager.currentPath.value || "/",
      connected: Boolean(paneRef?.manager.connected.value)
    });
  }

  return options;
});
const filteredSendTargetOptions = computed(() => {
  const query = sendTargetSearch.value.trim().toLowerCase();
  if (!query) return sendTargetOptions.value;
  return sendTargetOptions.value.filter((target) =>
    `${target.organizationName} ${target.assetName} ${target.endpoint.label}`.toLowerCase().includes(query)
  );
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
  () => fileTransferStore.tasks.map((task) => `${task.id}:${task.status}`),
  () => {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5分钟超时

    for (const [operationId, pending] of pendingSelectionClears) {
      const batchIds = new Set(pending.batchIds);
      const tasks = fileTransferStore.tasks.filter((task) => batchIds.has(task.batchId));

      // 统计终态任务数
      const terminalTasks = tasks.filter((task) => terminalTransferStatuses.has(task.status));
      const terminalCount = terminalTasks.length;

      // 判断是否所有任务都已完成（达到终态）
      // 情况1: 任务数匹配期望值且全部终态
      // 情况2: 操作已超时（防止任务丢失导致永久等待）
      const allTasksTerminated = terminalCount >= pending.expectedTaskCount;
      const isStale = now - pending.createdAt > staleThreshold;

      if (!allTasksTerminated && !isStale) continue;

      // 开发模式下输出诊断信息
      if (import.meta.dev && isStale) {
        console.warn(
          `[SFTP Transfer] Operation ${operationId} is stale (${terminalCount}/${pending.expectedTaskCount} tasks terminated)`
        );
      }

      // 计算哪些文件在所有目标上都成功了
      const sourceNames = [...new Set(tasks.map((task) => task.source.name))];
      const completedNames = sourceNames.filter((name) =>
        tasks.filter((task) => task.source.name === name).every((task) => task.status === "completed")
      );

      const sourcePane =
        primaryTransferEndpoint.value?.id === pending.sourceEndpoint.id
          ? primaryPaneRef.value
          : remotePaneRefs.value[
              remotePanes.value.find((pane) => pane.transferEndpoint.id === pending.sourceEndpoint.id)?.id || ""
            ];

      // 清除选择状态
      sourcePane?.clearTransferredSelection(completedNames, pending.sourcePath, pending.sourceSelectionRevision);
      pendingSelectionClears.delete(operationId);
    }
  }
);

// 性能监控（开发模式）
if (import.meta.dev) {
  watch(
    () => fileTransferStore.tasks.length,
    (count) => {
      if (count > 0 && count % 100 === 0) {
        console.log(`[SFTP Transfer] Active tasks: ${count}`);
      }
      if (count > 500) {
        console.warn(`[SFTP Transfer] High task count (${count}) may impact performance`);
      }
    }
  );
}

function addErrorToast(title: string, error: unknown) {
  showErrorToast({ title, error });
}

function setRemotePaneRef(id: string, el: unknown) {
  remotePaneRefs.value[id] = (el as InstanceType<typeof KokoFileManagementPane> | null) || null;
}

async function buildSftpContext(assetId: string, tokenId: string, tabId: string): Promise<ConnectorSessionContext> {
  let endpointUrl = resolveDevHost("koko") || hostAdapter.getWindowOrigin();
  if (!import.meta.dev) {
    const endpoint = await hostAdapter.getSmartEndpoint(
      { protocol: "sftp", assetId, token: tokenId },
      currentOrgId.value
    );
    const port = endpoint.https_port || endpoint.port;
    const scheme = endpoint.https_port ? "https" : "http";
    const resolved =
      endpoint.value ||
      (endpoint.host ? (port ? `${scheme}://${endpoint.host}:${port}` : `${scheme}://${endpoint.host}`) : "");
    if (!resolved) throw new Error(t("koko.fileManagement.endpointUnavailable"));

    if (hostAdapter.isTauriRuntime()) {
      endpointUrl = resolved;
    } else {
      const resolvedUrl = new URL(resolved);
      const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
      const hostOrigin = hostAdapter.getWindowOrigin();
      const samePort = (resolvedUrl.port || "") === new URL(hostOrigin).port;
      endpointUrl = isLoopback && !samePort ? hostOrigin : resolved;
    }
  }

  let ticket = "";
  try {
    ticket = String((await hostAdapter.createTicket({ baseUrl: endpointUrl, tokenId })).ticket || "");
  } catch (cause) {
    if (hostAdapter.isTauriRuntime()) throw cause;
  }

  return { component: "koko", tokenId, ticket, endpointUrl, tabId };
}

function openRemoteConnect(side: "left" | "right" = "right") {
  dualMode.value = true;
  connectSide.value = side;
  remoteAssetSearch.value = "";
  connectModalOpen.value = true;
}

function disconnectAllRemotes() {
  remotePanes.value = [];
  remotePaneRefs.value = {};
  activeRemoteId.value = null;
  dualMode.value = false;
}

function removeRemotePane(id: string) {
  const removed = remotePanes.value.find((pane) => pane.id === id);
  remotePanes.value = remotePanes.value.filter((pane) => pane.id !== id);
  delete remotePaneRefs.value[id];
  if (activeRemoteId.value === id) activeRemoteId.value = remotePanes.value[0]?.id ?? null;
  if (removed && globalActiveIds[removed.side] === id) {
    globalActiveIds[removed.side] = panesForSide(removed.side)[0]?.id ?? null;
  }
}

function toggleDualMode() {
  if (dualMode.value) {
    dualMode.value = false;
    return;
  }
  if (remotePanes.value.length) {
    dualMode.value = true;
    return;
  }
  openRemoteConnect();
}

function focusRemotePane(id: string) {
  activeRemoteId.value = id;
}

function activeTransferCount(endpointId: string) {
  return fileTransferStore.tasks.filter(
    (task) => task.destinationEndpoint.id === endpointId && !terminalTransferStatuses.has(task.status)
  ).length;
}

function targetPath(target: DistributionTargetOption) {
  return sendTargetPaths.value[target.id] ?? target.destinationPath;
}

function openSendModal(payload: SftpTransferSourcePayload) {
  sendSource.value = payload;
  sendTargetSearch.value = "";
  sendConflictPolicy.value = "ask";
  sendFilesOpen.value = false;
  sendTargetPaths.value = Object.fromEntries(
    sendTargetOptions.value.map((target) => [target.id, target.destinationPath])
  );

  // 智能目标推荐：基于历史记录
  const sourceId = payload.sourceEndpoint.id;
  const frequentTargets = distributionHistory.value[sourceId] || [];
  const recommendedTargets = sendTargetOptions.value.filter(
    (target) => frequentTargets.includes(target.id) && target.connected
  );

  // 如果有历史推荐，使用推荐目标；否则使用当前激活的目标
  if (recommendedTargets.length > 0) {
    selectedSendTargetIds.value = recommendedTargets.map((t) => t.id);
  } else {
    const activeTarget = sendTargetOptions.value.find(
      (target) => target.id === activeRemoteId.value && target.connected
    );
    selectedSendTargetIds.value = activeTarget ? [activeTarget.id] : [];
  }

  sendModalOpen.value = true;
}

function selectAllOnlineTargets() {
  selectedSendTargetIds.value = sendTargetOptions.value.filter((target) => target.connected).map((target) => target.id);
}

function toggleSendTarget(id: string, selected: boolean) {
  selectedSendTargetIds.value = selected
    ? [...new Set([...selectedSendTargetIds.value, id])]
    : selectedSendTargetIds.value.filter((targetId) => targetId !== id);
}

function reconnectTarget(target: DistributionTargetOption) {
  const pane = target.id === "primary" ? primaryPaneRef.value : remotePaneRefs.value[target.id];
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

  // 计算期望的任务总数
  const expectedTaskCount = source.entries.length * selectedSendTargets.value.length;

  // 使用 "dist:" 前缀标识分发操作
  const operationId = `dist:${distributionId}`;
  pendingSelectionClears.set(operationId, {
    sourceEndpoint: source.sourceEndpoint,
    sourcePath: source.sourcePath,
    sourceSelectionRevision: source.sourceSelectionRevision,
    batchIds,
    expectedTaskCount,
    createdAt: Date.now()
  });

  // 记录分发历史（用于智能推荐）
  const sourceId = source.sourceEndpoint.id;
  const targetIds = selectedSendTargets.value.map((t) => t.id);
  distributionHistory.value[sourceId] = targetIds;

  const sourcePane =
    primaryTransferEndpoint.value?.id === source.sourceEndpoint.id
      ? primaryPaneRef.value
      : remotePaneRefs.value[
          remotePanes.value.find((pane) => pane.transferEndpoint.id === source.sourceEndpoint.id)?.id || ""
        ];
  sourcePane?.clearSelection();
  sendModalOpen.value = false;
  transferCenterRef.value?.signalQueued(animationOrigin);
}

async function connectRemoteAsset(asset: KokoSftpAsset) {
  remoteConnecting.value = true;
  try {
    const connectAsset = await hostAdapter.sftp.prepareAsset(asset);

    const declaredProtocols = (connectAsset.permedProtocols || [])
      .map((item) =>
        String(item?.name || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    if (declaredProtocols.length > 0 && !declaredProtocols.includes("sftp")) {
      toast.add({
        title: t("koko.fileManagement.unsupportedAsset"),
        description: t("koko.fileManagement.unsupportedAssetDescription"),
        color: "warning",
        icon: "i-lucide-circle-alert"
      });
      return;
    }

    const { tokenId } = await createSftpSession(connectAsset);
    const id = paneId();
    remotePanes.value.push({
      id,
      side: props.global ? connectSide.value : "right",
      context: await buildSftpContext(connectAsset.id, tokenId, `remote-sftp:${connectAsset.id}:${id}`),
      organizationName: currentOrgLabel.value,
      assetName: connectAsset.name,
      transferEndpoint: {
        id: `sftp:${tokenId}`,
        label: `${currentOrgLabel.value} - ${connectAsset.name}`
      },
      selection: null
    });
    activeRemoteId.value = id;
    if (props.global) globalActiveIds[connectSide.value] = id;
    connectModalOpen.value = false;

    toast.add({ title: t("koko.fileManagement.remoteConnected"), color: "success" });
  } catch (error) {
    addErrorToast(t("koko.fileManagement.remoteConnectFailed"), error);
  } finally {
    remoteConnecting.value = false;
  }
}

function queueSftpTransfer(payload: SftpTransferDropPayload, destination: FileTransferEndpointRef | undefined) {
  if (!destination || payload.sourceEndpoint.id === destination.id) return;
  if (!payload.entries.length) return;

  const sourceBasePath = payload.sourcePath.replace(/\/$/, "") || "/";
  const inputs = payload.entries
    .map((entry) => ({ ...entry, size: Number(entry.size) }))
    .filter((entry) => entry.name && Number.isFinite(entry.size) && entry.size >= 0)
    .map((entry) => ({
      batchId: "",
      sourceEndpoint: payload.sourceEndpoint,
      destinationEndpoint: destination,
      source: {
        name: entry.name,
        size: entry.size,
        path: `${sourceBasePath}/${entry.name}`.replace(/\/+/g, "/")
      },
      destinationPath: payload.destinationPath,
      conflictPolicy: "ask" as const
    }));

  if (!inputs.length) return;

  const batchId = fileTransferStore.enqueueBatch(inputs);
  if (!batchId) return;

  // 使用 "single:" 前缀标识单个传输操作
  const operationId = `single:${batchId}`;
  pendingSelectionClears.set(operationId, {
    sourceEndpoint: payload.sourceEndpoint,
    sourcePath: payload.sourcePath,
    sourceSelectionRevision: payload.sourceSelectionRevision,
    batchIds: [batchId],
    expectedTaskCount: inputs.length,
    createdAt: Date.now()
  });
}

async function transferEntry(fromPane: TransferPane | null, toPane: TransferPane | null, entry: SftpFileEntry | null) {
  if (!fromPane || !toPane || !entry || transferring.value) return;
  if (entry.is_dir) {
    toast.add({ title: t("koko.fileManagement.folderTransferUnsupported"), color: "warning" });
    return;
  }

  transferring.value = true;
  try {
    const blob = await fromPane.manager.operations.readFile(entry);
    await toPane.manager.operations.uploadBlob(entry.name, blob);
    toast.add({ title: t("koko.fileManagement.transferSuccess"), color: "success" });
  } catch (error) {
    addErrorToast(t("koko.fileManagement.transferFailed"), error);
  } finally {
    transferring.value = false;
  }
}

async function transferGlobal(direction: "left-to-right" | "right-to-left") {
  const sourceSide = direction === "left-to-right" ? "left" : "right";
  const targetSide = sourceSide === "left" ? "right" : "left";
  const source = activePaneForSide(sourceSide);
  const target = activePaneForSide(targetSide);
  const sourceIsLocal = sourceSide === "left" && globalActiveIds.left === "local";
  const targetIsLocal = targetSide === "left" && globalActiveIds.left === "local";
  const sourcePane = sourceIsLocal ? localPaneRef.value : source ? remotePaneRefs.value[source.id] || null : null;
  const destinationPane = targetIsLocal ? localPaneRef.value : target ? remotePaneRefs.value[target.id] || null : null;
  const sourceEntry = sourceIsLocal ? localSelection.value : source?.selection || null;

  if (!sourceIsLocal && !targetIsLocal && source && target && sourceEntry && !sourceEntry.is_dir) {
    const payload = remotePaneRefs.value[source.id]?.transferSourcePayload?.();
    if (payload) {
      queueSftpTransfer(
        { ...payload, destinationPath: remotePaneRefs.value[target.id]?.manager.currentPath.value || "/" },
        target.transferEndpoint
      );
    }
    return;
  }

  await transferEntry(sourcePane, destinationPane, sourceEntry);
}

async function uploadWebFiles(files: File[]) {
  const target = activePaneForSide("right");
  const targetPane = target ? remotePaneRefs.value[target.id] : null;

  if (!targetPane) {
    toast.add({ title: t("koko.fileManagement.selectRemoteTarget"), color: "warning" });
    return;
  }

  if (transferring.value) return;

  transferring.value = true;
  let success = 0;

  try {
    for (const file of files) {
      try {
        await targetPane.manager.operations.uploadBlob(file.name, file);
        success += 1;
      } catch {
        // Continue with the remaining files and report the aggregate result.
      }
    }

    toast.add({
      title:
        success === files.length
          ? t("koko.fileManagement.uploadedFiles", { count: success })
          : t("koko.fileManagement.uploadedFilesPartial", { success, total: files.length }),
      color: success === files.length ? "success" : "warning"
    });
  } finally {
    transferring.value = false;
  }
}

onMounted(() => {
  if (props.global) globalActiveIds.left = hostAdapter.isTauriRuntime() ? "local" : "web-upload";
  if (!props.global && !props.showEmpty) {
    tourTimer = setTimeout(() => void sftpTour.startOnce(), 650);
  }
});

onBeforeUnmount(() => {
  if (tourTimer) clearTimeout(tourTimer);
  sftpTour.destroy();
});

watch(currentOrgId, () => {
  remoteAssetSearch.value = "";
});
</script>

<template>
  <div v-if="showEmpty" class="grid h-full place-items-center p-6 text-sm text-muted">
    <div class="flex flex-col items-center gap-3">
      <UIcon name="i-lucide-circle-alert" class="size-7" />
      <p>{{ t("koko.fileManagement.expired") }}</p>
      <UButton size="sm" @click="emit('reconnect')">
        {{ t("koko.fileManagement.reconnect") }}
      </UButton>
    </div>
  </div>
  <div v-else class="sftp-file-management flex h-full min-h-0 flex-col" data-sftp-tour="workspace">
    <div
      v-if="!global"
      class="sftp-file-management__topbar flex shrink-0 items-center justify-between gap-2 border-b border-default"
    >
      <div class="ml-auto flex items-center justify-end gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-circle-help"
          :title="t('koko.fileManagement.featureTour')"
          :aria-label="t('koko.fileManagement.featureTour')"
          @click="sftpTour.start"
        />
        <KokoSftpTransferCenter ref="transferCenterRef" />
        <UButton
          v-if="!dualMode && !remotePanes.length"
          data-sftp-tour="remote-connect"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('koko.fileManagement.addRemoteSftp')"
          @click="() => openRemoteConnect()"
        />
        <UButton
          v-if="dualMode && remotePanes.length"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-unplug"
          :label="t('koko.fileManagement.disconnectAllRemote')"
          @click="disconnectAllRemotes"
        />
        <UButton
          v-if="dualMode || remotePanes.length"
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="dualMode ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
          :title="t(dualMode ? 'Tree.Collapse' : 'Tree.Expand')"
          :aria-label="t(dualMode ? 'Tree.Collapse' : 'Tree.Expand')"
          @click="toggleDualMode"
        />
      </div>
    </div>

    <div v-if="global" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]">
      <div
        v-for="side in ['left', 'right'] as const"
        :key="side"
        class="flex min-h-0 min-w-0 flex-col"
        :class="side === 'right' ? 'col-start-3' : 'col-start-1 row-start-1'"
      >
        <div class="flex h-9 shrink-0 items-center gap-1 border-b border-default bg-elevated/50 px-2">
          <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <button
              v-if="side === 'left' && hostAdapter.isTauriRuntime()"
              type="button"
              class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds.left === 'local' ? 'bg-accented text-highlighted' : 'text-muted'"
              @click="globalActiveIds.left = 'local'"
            >
              <UIcon name="i-lucide-laptop" class="size-3.5 shrink-0" />
              <span>{{ t("koko.fileManagement.localFiles") }}</span>
            </button>
            <button
              v-if="side === 'left' && !hostAdapter.isTauriRuntime()"
              type="button"
              class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds.left === 'web-upload' ? 'bg-accented text-highlighted' : 'text-muted'"
              @click="globalActiveIds.left = 'web-upload'"
            >
              <UIcon name="i-lucide-upload" class="size-3.5 shrink-0" />
              <span>{{ t("koko.fileManagement.localUpload") }}</span>
            </button>
            <button
              v-for="pane in panesForSide(side)"
              :key="pane.id"
              type="button"
              class="flex h-7 min-w-0 max-w-48 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds[side] === pane.id ? 'bg-accented text-highlighted' : 'text-muted'"
              @click="globalActiveIds[side] = pane.id"
            >
              <UIcon name="i-lucide-server" class="size-3.5 shrink-0" />
              <span class="truncate">{{ pane.assetName }}</span>
              <UIcon name="i-lucide-x" class="size-3 shrink-0" @click.stop="removeRemotePane(pane.id)" />
            </button>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            :title="t('koko.fileManagement.addRemoteSftp')"
            @click="openRemoteConnect(side)"
          />
          <KokoSftpTransferCenter v-if="side === 'left'" ref="transferCenterRef" />
        </div>

        <KokoLocalFileManagementPane
          v-if="side === 'left' && hostAdapter.isTauriRuntime()"
          v-show="globalActiveIds.left === 'local'"
          ref="localPaneRef"
          class="min-h-0 flex-1"
          @select="localSelection = $event"
        />
        <KokoWebUploadPane
          v-if="side === 'left' && !hostAdapter.isTauriRuntime()"
          v-show="globalActiveIds.left === 'web-upload'"
          class="min-h-0 flex-1"
          @upload="uploadWebFiles"
        />
        <template v-if="panesForSide(side).length">
          <KokoFileManagementPane
            v-for="pane in panesForSide(side)"
            v-show="globalActiveIds[side] === pane.id"
            :key="pane.id"
            :ref="(el) => setRemotePaneRef(pane.id, el)"
            class="min-h-0 flex-1"
            :context="pane.context"
            :transfer-endpoint="pane.transferEndpoint"
            @select="pane.selection = $event"
            @send="openSendModal"
            @transfer-drop="queueSftpTransfer($event, pane.transferEndpoint)"
          />
        </template>
        <div
          v-else-if="
            !(
              side === 'left' &&
              (hostAdapter.isTauriRuntime() ? globalActiveIds.left === 'local' : globalActiveIds.left === 'web-upload')
            )
          "
          class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted"
        >
          <div class="space-y-3">
            <UIcon name="i-lucide-server" class="mx-auto size-7 opacity-60" />
            <p>
              {{
                side === "left" && hostAdapter.isTauriRuntime()
                  ? t("koko.fileManagement.preparingLocalFolder")
                  : t("koko.fileManagement.connectSftpServer")
              }}
            </p>
            <UButton size="sm" color="primary" variant="soft" icon="i-lucide-plus" @click="openRemoteConnect(side)">
              {{ t("koko.fileManagement.connectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>

      <div
        class="col-start-2 row-start-1 flex min-h-0 flex-col items-center justify-center gap-2 border-x border-default"
      >
        <UTooltip :text="t('koko.fileManagement.transferToRemote')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-right"
            :disabled="
              !(globalActiveIds.left === 'local' ? localSelection : activePaneForSide('left')?.selection) ||
              !activePaneForSide('right') ||
              transferring
            "
            :loading="transferring"
            @click="transferGlobal('left-to-right')"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.transferToLocal')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-left"
            :disabled="
              !activePaneForSide('right')?.selection ||
              !(globalActiveIds.left === 'local' || activePaneForSide('left')) ||
              transferring
            "
            :loading="transferring"
            @click="transferGlobal('right-to-left')"
          />
        </UTooltip>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1" :class="dualMode ? 'gap-1' : ''">
      <KokoFileManagementPane
        :key="primaryTransferEndpoint?.id || 'primary-sftp'"
        ref="primaryPaneRef"
        class="min-h-0 min-w-0 flex-1"
        :context="primaryContext"
        :transfer-endpoint="primaryTransferEndpoint"
        :title="dualMode ? t('koko.fileManagement.localSftp') : undefined"
        @send="openSendModal"
        @transfer-drop="queueSftpTransfer($event, primaryTransferEndpoint)"
      />

      <div v-show="dualMode" class="w-px shrink-0 bg-(--app-border)" />

      <div v-show="dualMode" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div v-if="remotePanes.length" class="flex min-h-0 flex-1 flex-col">
          <div
            class="sftp-file-management__machine-tabs flex shrink-0 items-center gap-1.5 border-b border-default bg-elevated/50"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              <button
                v-for="pane in remotePanes"
                :key="pane.id"
                type="button"
                class="sftp-file-management__machine-tab flex max-w-45 shrink-0 items-center gap-1.5 rounded-md border px-2"
                :class="
                  activeRemoteId === pane.id
                    ? 'border-primary/50 bg-accented text-highlighted'
                    : 'border-default bg-default text-muted hover:text-highlighted'
                "
                @click="focusRemotePane(pane.id)"
              >
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  :class="remotePaneRefs[pane.id]?.manager.connected.value ? 'bg-success' : 'bg-warning'"
                />
                <span class="min-w-0 flex-1 truncate">{{ pane.assetName }}</span>
                <UBadge v-if="activeTransferCount(pane.transferEndpoint.id)" color="primary" variant="subtle" size="xs">
                  {{ activeTransferCount(pane.transferEndpoint.id) }}
                </UBadge>
                <UIcon name="i-lucide-x" class="size-3 shrink-0" @click.stop="removeRemotePane(pane.id)" />
              </button>
            </div>
            <UButton
              class="sftp-file-management__connect-button"
              data-sftp-tour="remote-connect"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              :label="t('koko.fileManagement.connect')"
              :title="t('koko.fileManagement.addRemoteSftp')"
              @click="openRemoteConnect()"
            />
          </div>
          <div v-for="pane in remotePanes" v-show="activeRemoteId === pane.id" :key="pane.id" class="min-h-0 flex-1">
            <KokoFileManagementPane
              :ref="(el) => setRemotePaneRef(pane.id, el)"
              class="h-full min-h-0"
              :context="pane.context"
              :transfer-endpoint="pane.transferEndpoint"
              @select="
                pane.selection = $event;
                focusRemotePane(pane.id);
              "
              @send="openSendModal"
              @transfer-drop="queueSftpTransfer($event, pane.transferEndpoint)"
            />
          </div>
        </div>
        <div v-else class="grid h-full place-items-center p-4 text-center text-xs text-muted">
          <div class="space-y-2">
            <UIcon name="i-lucide-server" class="mx-auto size-6 opacity-60" />
            <p>{{ t("koko.fileManagement.remoteSftpHint") }}</p>
            <UButton size="xs" color="primary" variant="soft" @click="() => openRemoteConnect()">
              {{ t("koko.fileManagement.connectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="connectModalOpen"
      :title="t('koko.fileManagement.connectRemoteSftp')"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 px-2.5 py-1 text-[11px] text-muted">
            <span>{{ t("koko.fileManagement.currentOrganization") }}</span>
            <div class="min-w-0 max-w-55 flex-1">
              <component :is="hostAdapter.sftp.organizationSelector" class="justify-end" />
            </div>
          </div>
          <UInput
            v-model="remoteAssetSearch"
            icon="i-lucide-search"
            :placeholder="t('koko.fileManagement.searchAssets')"
          />
          <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
            <component :is="hostAdapter.sftp.assetTree" :search="remoteAssetSearch" open @select="connectRemoteAsset" />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('koko.actions.cancel')"
          @click="
            () => {
              connectModalOpen = false;
            }
          "
        />
      </template>
    </UModal>

    <UModal
      v-model:open="sendModalOpen"
      :title="t('koko.fileManagement.sendToMultipleTargets')"
      :description="t('koko.fileManagement.sendToMultipleTargetsDescription')"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <UCollapsible
            v-model:open="sendFilesOpen"
            class="sftp-send-summary rounded-lg border border-default bg-elevated/50"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="min-h-14 justify-between rounded-lg px-3 text-left"
              :title="sendFilesOpen ? t('koko.fileManagement.collapseFileList') : t('koko.fileManagement.viewFileList')"
            >
              <span class="flex min-w-0 items-center gap-3">
                <span class="grid size-8 shrink-0 place-items-center rounded-md bg-accented text-primary">
                  <UIcon name="i-lucide-files" class="size-4" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-semibold text-highlighted">
                    {{ t("koko.fileManagement.selectedFiles", sendFileCount) }}
                    <span class="ml-1 font-ui-mono text-[11.5px] font-normal text-muted">
                      {{ prettyBytes(sendTotalBytes) }}
                    </span>
                  </span>
                  <span class="mt-0.5 block truncate font-ui-mono text-[11px] text-muted">
                    {{ sendSource?.sourceEndpoint.label }} · {{ sendSource?.sourcePath }}
                  </span>
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted">
                {{ sendFilesOpen ? t("koko.fileManagement.collapse") : t("koko.fileManagement.viewFiles") }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-3.5 transition-transform"
                  :class="sendFilesOpen ? 'rotate-180' : ''"
                />
              </span>
            </UButton>
            <template #content>
              <div class="max-h-36 overflow-y-auto border-t border-default px-3 py-2">
                <div
                  v-for="entry in sendSource?.entries"
                  :key="entry.name"
                  class="flex min-h-7 items-center gap-2 rounded px-1.5 text-[12px] text-toned hover:bg-elevated"
                >
                  <UIcon name="i-lucide-file" class="size-3.5 shrink-0 text-muted" />
                  <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
                  <span class="font-ui-mono text-[11px] text-muted">{{ prettyBytes(Number(entry.size) || 0) }}</span>
                </div>
              </div>
            </template>
          </UCollapsible>

          <div>
            <div class="mb-2 flex items-center gap-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("koko.fileManagement.targetMachines") }}
              </p>
              <span class="font-ui-mono text-[11px] text-muted">{{ selectedSendTargets.length }}</span>
              <div class="flex-1" />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('koko.fileManagement.selectOnline')"
                @click="selectAllOnlineTargets"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('koko.fileManagement.clearSelection')"
                @click="selectedSendTargetIds = []"
              />
            </div>
            <UInput
              v-model="sendTargetSearch"
              icon="i-lucide-search"
              size="sm"
              :placeholder="t('koko.fileManagement.searchTargets')"
              class="mb-2"
            />
            <div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-default p-1.5">
              <label
                v-for="target in filteredSendTargetOptions"
                :key="target.id"
                class="flex items-start gap-3 rounded-md border px-2.5 py-2 transition-colors"
                :class="[
                  selectedSendTargetIds.includes(target.id)
                    ? 'border-primary/50 bg-accented'
                    : 'border-transparent hover:bg-elevated',
                  !target.connected ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                ]"
              >
                <UCheckbox
                  :model-value="selectedSendTargetIds.includes(target.id)"
                  :disabled="!target.connected"
                  class="mt-0.5"
                  @update:model-value="toggleSendTarget(target.id, $event === true)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span :class="target.connected ? 'bg-success' : 'bg-muted'" class="size-1.5 rounded-full" />
                    <span class="truncate text-xs font-medium">{{ target.assetName }}</span>
                    <UBadge color="neutral" variant="soft" size="xs">{{ target.organizationName }}</UBadge>
                    <span class="ml-auto text-[10px] text-muted">
                      {{
                        target.connected ? t("koko.fileManagement.connected") : t("koko.fileManagement.disconnected")
                      }}
                    </span>
                    <UButton
                      v-if="!target.connected"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-refresh-cw"
                      :title="t('koko.fileManagement.reconnect')"
                      @click.prevent.stop="reconnectTarget(target)"
                    />
                  </div>
                  <UInput
                    :model-value="targetPath(target)"
                    icon="i-lucide-folder"
                    size="xs"
                    class="mt-1.5"
                    :disabled="!target.connected || !selectedSendTargetIds.includes(target.id)"
                    @update:model-value="sendTargetPaths[target.id] = String($event)"
                    @click.stop
                  />
                </div>
              </label>
              <div v-if="!filteredSendTargetOptions.length" class="grid h-20 place-items-center text-xs text-muted">
                {{ t("koko.fileManagement.noMatchingTargets") }}
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-default bg-elevated/50 p-3">
            <p class="mb-2 text-xs font-medium">{{ t("koko.fileManagement.nameConflictPolicy") }}</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="policy in ['ask', 'overwrite', 'skip'] as const"
                :key="policy"
                size="xs"
                :color="sendConflictPolicy === policy ? 'primary' : 'neutral'"
                :variant="sendConflictPolicy === policy ? 'soft' : 'ghost'"
                :label="
                  policy === 'ask'
                    ? t('koko.fileManagement.askWhenNeeded')
                    : policy === 'overwrite'
                      ? t('FileTransfer.Overwrite')
                      : t('FileTransfer.Skip')
                "
                @click="sendConflictPolicy = policy"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="mr-auto min-w-0 text-xs text-muted">
          <p class="font-ui-mono">
            {{ sendFileCount }} × {{ selectedSendTargets.length }} =
            <span class="font-semibold text-highlighted">{{ sendFileCount * selectedSendTargets.length }}</span>
            {{ t("koko.fileManagement.transferTaskUnit") }}
            <span v-if="selectedSendTotalBytes" class="ml-1">· {{ prettyBytes(selectedSendTotalBytes) }}</span>
          </p>
          <p class="mt-1">
            {{ t("koko.fileManagement.distributionQueueHint") }}
          </p>
        </div>
        <UButton color="neutral" variant="ghost" :label="t('koko.actions.cancel')" @click="sendModalOpen = false" />
        <UButton
          color="primary"
          icon="i-lucide-send"
          :disabled="!selectedSendTargets.length"
          :label="t('koko.fileManagement.distributeToTargets', selectedSendTargets.length)"
          @click="startDistribution"
        />
      </template>
    </UModal>
  </div>
</template>
