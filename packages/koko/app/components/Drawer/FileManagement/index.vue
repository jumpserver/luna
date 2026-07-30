<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { KokoSftpAsset } from "@jumpserver/koko/host";
import type { SftpFileOperations } from "#koko/composables/sftp/protocol";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";
import { connectorSessionKey, resolveDevHost } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import KokoLocalFileManagementPane from "#koko/components/Drawer/FileManagement/localPane.vue";
import KokoFileManagementPane from "#koko/components/Drawer/FileManagement/pane.vue";
import KokoWebUploadPane from "#koko/components/Drawer/FileManagement/webUploadPane.vue";
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
  entries: Array<Pick<SftpFileEntry, "name" | "size">>;
  destinationPath: string;
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

const primaryPaneRef = ref<InstanceType<typeof KokoFileManagementPane> | null>(null);
const remotePaneRefs = ref<Record<string, InstanceType<typeof KokoFileManagementPane> | null>>({});
const primarySelection = ref<SftpFileEntry | null>(null);
const localSelection = ref<SftpFileEntry | null>(null);
const localPaneRef = ref<InstanceType<typeof KokoLocalFileManagementPane> | null>(null);

const activeRemotePane = computed(() => remotePanes.value.find((pane) => pane.id === activeRemoteId.value) || null);
const globalActiveIds = reactive<{ left: string | null; right: string | null }>({ left: null, right: null });
const panesForSide = (side: "left" | "right") => remotePanes.value.filter((pane) => pane.side === side);
const activePaneForSide = (side: "left" | "right") =>
  remotePanes.value.find((pane) => pane.id === globalActiveIds[side]) || null;
const currentOrgId = computed(() => hostAdapter.sftp.currentOrganization.value?.id || "");
const currentOrgLabel = computed(() => hostAdapter.sftp.currentOrganization.value?.name || t("koko.fileManagement.selectOrganization"));

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

  fileTransferStore.enqueueBatch(inputs);
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

const transferToActiveRemote = () => {
  const pane = activeRemotePane.value;
  if (!pane) return;
  transferEntry(primaryPaneRef.value, remotePaneRefs.value[pane.id] || null, primarySelection.value);
};

const transferToPrimary = () => {
  const pane = activeRemotePane.value;
  if (!pane) return;
  transferEntry(remotePaneRefs.value[pane.id] || null, primaryPaneRef.value, pane.selection);
};

async function transferGlobal(direction: "left-to-right" | "right-to-left") {
  const sourceSide = direction === "left-to-right" ? "left" : "right";
  const targetSide = sourceSide === "left" ? "right" : "left";
  const source = activePaneForSide(sourceSide);
  const target = activePaneForSide(targetSide);
  const sourceIsLocal = sourceSide === "left" && globalActiveIds.left === "local";
  const targetIsLocal = targetSide === "left" && globalActiveIds.left === "local";
  await transferEntry(
    sourceIsLocal ? localPaneRef.value : source ? remotePaneRefs.value[source.id] || null : null,
    targetIsLocal ? localPaneRef.value : target ? remotePaneRefs.value[target.id] || null : null,
    sourceIsLocal ? localSelection.value : source?.selection || null
  );
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
  if (!props.global) return;
  globalActiveIds.left = hostAdapter.isTauriRuntime() ? "local" : "web-upload";
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
  <div v-else class="flex h-full min-h-0 flex-col">
    <div v-if="!global" class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-default px-2">
      <div class="ml-auto flex items-center justify-end gap-1">
        <UButton
          size="xs"
          :color="global || dualMode || remotePanes.length ? 'primary' : 'neutral'"
          :variant="dualMode ? 'soft' : 'ghost'"
          icon="i-lucide-server"
          :label="
            remotePanes.length || dualMode ? t('koko.fileManagement.remoteSftp') : t('koko.fileManagement.connectRemoteSftp')
          "
          @click="global ? openRemoteConnect() : toggleDualMode()"
        />
        <UButton
          v-if="dualMode"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('koko.fileManagement.addRemoteSftp')"
          @click="() => openRemoteConnect()"
        />
        <UButton
          v-if="remotePanes.length"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-unplug"
          :label="t('koko.fileManagement.disconnectAllRemote')"
          @click="disconnectAllRemotes"
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
              :class="globalActiveIds.left === 'local' ? 'bg-default text-primary' : 'text-muted hover:bg-default/70'"
              @click="globalActiveIds.left = 'local'"
            >
              <UIcon name="i-lucide-laptop" class="size-3.5 shrink-0" />
              <span>{{ t("koko.fileManagement.localFiles") }}</span>
            </button>
            <button
              v-if="side === 'left' && !hostAdapter.isTauriRuntime()"
              type="button"
              class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
              :class="
                globalActiveIds.left === 'web-upload' ? 'bg-default text-primary' : 'text-muted hover:bg-default/70'
              "
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
              :class="globalActiveIds[side] === pane.id ? 'bg-default text-primary' : 'text-muted hover:bg-default/70'"
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
            <p>{{ side === "left" && hostAdapter.isTauriRuntime() ? t("koko.fileManagement.preparingLocalFolder") : t("koko.fileManagement.connectSftpServer") }}</p>
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
        @select="primarySelection = $event"
        @transfer-drop="queueSftpTransfer($event, primaryTransferEndpoint)"
      />

      <div
        v-show="dualMode"
        class="flex w-8 shrink-0 flex-col items-center justify-center gap-2 border-x border-default px-0.5"
      >
        <UTooltip :text="t('koko.fileManagement.transferToRemote')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-right"
            :disabled="!primarySelection || !activeRemotePane || transferring"
            :loading="transferring"
            @click="transferToActiveRemote"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.transferToLocal')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-left"
            :disabled="!activeRemotePane?.selection || transferring"
            :loading="transferring"
            @click="transferToPrimary"
          />
        </UTooltip>
      </div>

      <div v-show="dualMode" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div v-if="remotePanes.length" class="flex min-h-0 flex-1 flex-col divide-y divide-default">
          <div
            v-for="pane in remotePanes"
            :key="pane.id"
            class="flex min-h-0 flex-1 flex-col"
          >
            <div class="flex h-8 shrink-0 items-center gap-1 border-b border-default px-2">
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-[11px] font-medium"
                @click="focusRemotePane(pane.id)"
              >
                {{ pane.organizationName }} - {{ pane.assetName }}
              </button>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="removeRemotePane(pane.id)" />
            </div>
            <KokoFileManagementPane
              :ref="(el) => setRemotePaneRef(pane.id, el)"
              class="min-h-0 flex-1"
              :context="pane.context"
              :transfer-endpoint="pane.transferEndpoint"
              @select="
                pane.selection = $event;
                focusRemotePane(pane.id);
              "
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
          <div
            class="flex items-center justify-between gap-3 px-2.5 py-1 text-[11px] text-muted"
          >
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
</div>
</template>
