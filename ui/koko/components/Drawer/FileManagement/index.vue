<script setup lang="ts">
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import type { AssetItem } from "~/types";
import OrganizationSelector from "~/components/Header/OrganizationSelector.vue";
import SideBarAssetTree from "~/components/SideBar/assetTree.vue";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import KokoLocalFileManagementPane from "~/koko/components/Drawer/FileManagement/localPane.vue";
import KokoFileManagementPane from "~/koko/components/Drawer/FileManagement/pane.vue";
import KokoWebUploadPane from "~/koko/components/Drawer/FileManagement/webUploadPane.vue";
import { connectorSessionKey } from "~/koko/composables/wsUrl";
import { resolveDevHost } from "~/shared/connectors/useConnectorEndpoint";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface RemotePane {
  id: string
  side: "left" | "right"
  context: ConnectorSessionContext
  assetName: string
  selection: SftpFileEntry | null
  checked: boolean
}

interface TransferPane {
  manager: {
    readFile: (entry: SftpFileEntry) => Promise<Blob>
    uploadBlob: (fileName: string, blob: Blob) => Promise<void>
  }
}

const props = defineProps<{
  sftpToken?: string
  showEmpty?: boolean
  global?: boolean
}>();

const emit = defineEmits<{ reconnect: [] }>();

const { t } = useI18n();
const toast = useToast();
const { addErrorToast: showErrorToast } = useErrorToast();
const { createKokoTicket } = useWorkspaceConnectors();
const { displayUser, handleAssetConnection } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { currentUser } = storeToRefs(userInfoStore);

const providedContext = inject(connectorSessionKey, ref(null));
const primaryContext = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  if (value.tokenId === props.sftpToken) return value;
  return { ...value, tokenId: props.sftpToken };
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

const checkedRemotePanes = computed(() => remotePanes.value.filter((pane) => pane.checked));
const activeRemotePane = computed(() => remotePanes.value.find((pane) => pane.id === activeRemoteId.value) || null);
const globalActiveIds = reactive<{ left: string | null, right: string | null }>({ left: null, right: null });
const panesForSide = (side: "left" | "right") => remotePanes.value.filter((pane) => pane.side === side);
const activePaneForSide = (side: "left" | "right") =>
  remotePanes.value.find((pane) => pane.id === globalActiveIds[side]) || null;
const currentOrgId = computed(() => currentUser.value?.org?.id || "");
const currentOrgLabel = computed(() => currentUser.value?.org?.name || "选择组织");

function addErrorToast(title: string, error: unknown) {
  showErrorToast({ title, error });
}

function setRemotePaneRef(id: string, el: unknown) {
  remotePaneRefs.value[id] = (el as InstanceType<typeof KokoFileManagementPane> | null) || null;
}

async function buildSftpContext(assetId: string, tokenId: string, tabId: string): Promise<ConnectorSessionContext> {
  let endpointUrl = resolveDevHost("koko") || window.location.origin;
  if (!import.meta.dev) {
    const endpoint = await getSmartEndpoint({ protocol: "sftp", assetId, token: tokenId }, currentOrgId.value);
    const port = endpoint.https_port || endpoint.port;
    const scheme = endpoint.https_port ? "https" : "http";
    const resolved = endpoint.value
      || (endpoint.host ? (port ? `${scheme}://${endpoint.host}:${port}` : `${scheme}://${endpoint.host}`) : "");
    if (!resolved) throw new Error("服务端未返回可用的 SFTP 端点");

    if (isTauriRuntime()) {
      endpointUrl = resolved;
    } else {
      const resolvedUrl = new URL(resolved);
      const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
      const samePort = (resolvedUrl.port || "") === window.location.port;
      endpointUrl = isLoopback && !samePort ? window.location.origin : resolved;
    }
  }

  let ticket = "";
  try {
    ticket = String((await createKokoTicket({ baseUrl: endpointUrl, tokenId })).ticket || "");
  } catch (cause) {
    if (isTauriRuntime()) throw cause;
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

async function connectRemoteAsset(asset: AssetItem) {
  remoteConnecting.value = true;
  try {
    let connectAsset = asset;
    if (!connectAsset.permedAccounts?.length || !connectAsset.permedProtocols?.length) {
      const detail = await getAssetDetailRequest(asset.id, currentOrgId.value);
      connectAsset = {
        ...connectAsset,
        permedAccounts: detail.permed_accounts ?? connectAsset.permedAccounts ?? [],
        permedProtocols: (detail.permed_protocols ?? connectAsset.permedProtocols ?? []).filter(
          (protocol: { name?: string }) => protocol?.name !== "winrm"
        )
      };
    }

    const declaredProtocols = (connectAsset.permedProtocols || [])
      .map((item) => String(item?.name || "").trim().toLowerCase())
      .filter(Boolean);

    if (declaredProtocols.length > 0 && !declaredProtocols.includes("sftp")) {
      toast.add({
        title: "该资产不支持 SFTP",
        description: "请改选支持 SFTP 协议的资产。",
        color: "warning",
        icon: "i-lucide-circle-alert"
      });
      return;
    }

    const preference = userInfoStore.getConnectionPreferenceForAsset(connectAsset.id);
    const remembered = userInfoStore.getConnectionInfoForAsset(connectAsset.id);
    const accountId = preference?.accountId || remembered?.accountId;
    const account = displayUser(connectAsset.id, connectAsset.permedAccounts);

    await new Promise<void>((resolve, reject) => {
      void handleAssetConnection(account, connectAsset.id, "ssh", connectAsset.permedAccounts, "sftp", {
        accountMode: preference?.accountMode || remembered?.accountMode || "hosted",
        accountId,
        connectMethod: SFTP_FILE_MANAGER_VALUE,
        orgId: currentOrgId.value,
        asset: connectAsset,
        onSessionReady: async (payload) => {
          try {
            const tokenId = String(payload.id || payload.token?.id || "");
            if (!tokenId) throw new Error("服务端未返回 SFTP 连接令牌");
            const id = paneId();
            remotePanes.value.push({
              id,
              side: props.global ? connectSide.value : "right",
              context: await buildSftpContext(connectAsset.id, tokenId, `remote-sftp:${connectAsset.id}:${id}`),
              assetName: connectAsset.name,
              selection: null,
              checked: true
            });
            activeRemoteId.value = id;
            if (props.global) globalActiveIds[connectSide.value] = id;
            connectModalOpen.value = false;
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onSessionError: reject
      }).catch(reject);
    });

    toast.add({ title: t("FileManagement.RemoteConnected"), color: "success" });
  } catch (error) {
    addErrorToast(t("FileManagement.RemoteConnectFailed"), error);
  } finally {
    remoteConnecting.value = false;
  }
}

async function transferEntry(
  fromPane: TransferPane | null,
  toPane: TransferPane | null,
  entry: SftpFileEntry | null
) {
  if (!fromPane || !toPane || !entry || transferring.value) return;
  if (entry.is_dir) {
    toast.add({ title: t("FileManagement.FolderTransferUnsupported"), color: "warning" });
    return;
  }

  transferring.value = true;
  try {
    const blob = await fromPane.manager.readFile(entry);
    await toPane.manager.uploadBlob(entry.name, blob);
    toast.add({ title: t("FileManagement.TransferSuccess"), color: "success" });
  } catch (error) {
    addErrorToast(t("FileManagement.TransferFailed"), error);
  } finally {
    transferring.value = false;
  }
}

async function transferToRemotes() {
  const entry = primarySelection.value;
  const fromPane = primaryPaneRef.value;
  const targets = checkedRemotePanes.value;
  if (!fromPane || !entry || !targets.length || transferring.value) return;
  if (entry.is_dir) {
    toast.add({ title: t("FileManagement.FolderTransferUnsupported"), color: "warning" });
    return;
  }

  transferring.value = true;
  try {
    const blob = await fromPane.manager.readFile(entry);
    const results = await Promise.allSettled(
      targets.map((pane) => {
        const target = remotePaneRefs.value[pane.id];
        if (!target) throw new Error("SFTP pane is not ready");
        return target.manager.uploadBlob(entry.name, blob);
      })
    );
    const success = results.filter((result) => result.status === "fulfilled").length;
    if (success === targets.length) {
      toast.add({ title: t("FileManagement.TransferSuccess"), color: "success" });
    } else if (success === 0) {
      addErrorToast(
        t("FileManagement.TransferFailed"),
        (results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined)?.reason || ""
      );
    } else {
      toast.add({
        title: t("FileManagement.TransferPartialSuccess", { success, total: targets.length }),
        color: "warning"
      });
    }
  } catch (error) {
    addErrorToast(t("FileManagement.TransferFailed"), error);
  } finally {
    transferring.value = false;
  }
}

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
    toast.add({ title: "请先在右侧连接目标 SFTP Server", color: "warning" });
    return;
  }
  if (transferring.value) return;

  transferring.value = true;
  let success = 0;
  try {
    for (const file of files) {
      try {
        await targetPane.manager.uploadBlob(file.name, file);
        success += 1;
      } catch {
        // Continue with the remaining files and report the aggregate result.
      }
    }
    toast.add({
      title: success === files.length
        ? `已上传 ${success} 个文件`
        : `已上传 ${success}/${files.length} 个文件`,
      color: success === files.length ? "success" : "warning"
    });
  } finally {
    transferring.value = false;
  }
}

onMounted(() => {
  if (!props.global) return;
  globalActiveIds.left = isTauriRuntime() ? "local" : "web-upload";
});

watch(currentOrgId, () => {
  remoteAssetSearch.value = "";
});
</script>

<template>
  <div v-if="showEmpty" class="grid h-full place-items-center p-6 text-sm text-muted">
    <div class="flex flex-col items-center gap-3">
      <UIcon name="i-lucide-circle-alert" class="size-7" />
      <p>{{ t("FileManagerExpired") }}</p>
      <UButton size="sm" @click="emit('reconnect')">
        {{ t("Reconnect") }}
      </UButton>
    </div>
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <div v-if="global" class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-2 py-1">
      <div class="max-w-[240px]">
        <OrganizationSelector />
      </div>
      <div class="text-[11px] text-muted">
        <span class="truncate">当前组织：{{ currentOrgLabel }}</span>
      </div>
    </div>

    <div v-if="!global" class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-2 py-1">
      <div class="max-w-[240px]">
        <OrganizationSelector />
      </div>

      <div class="flex items-center justify-end gap-1">
        <UButton
          size="xs"
          :color="global || dualMode || remotePanes.length ? 'primary' : 'neutral'"
          :variant="dualMode ? 'soft' : 'ghost'"
          icon="i-lucide-server"
          :label="remotePanes.length || dualMode ? t('FileManagement.RemoteSftp') : t('FileManagement.ConnectRemoteSftp')"
          @click="global ? openRemoteConnect() : toggleDualMode()"
        />
        <UButton
          v-if="dualMode"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('FileManagement.AddRemoteSftp')"
          @click="() => openRemoteConnect()"
        />
        <UButton
          v-if="remotePanes.length"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-unplug"
          :label="t('FileManagement.DisconnectAllRemote')"
          @click="disconnectAllRemotes"
        />
      </div>
    </div>

    <div v-if="global" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)]">
      <div
        v-for="side in (['left', 'right'] as const)"
        :key="side"
        class="flex min-h-0 min-w-0 flex-col"
        :class="side === 'right' ? 'col-start-3' : 'col-start-1 row-start-1'"
      >
        <div class="flex h-9 shrink-0 items-center gap-1 border-b border-default bg-elevated/50 px-2">
          <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <button
              v-if="side === 'left' && isTauriRuntime()"
              type="button"
              class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds.left === 'local' ? 'bg-default text-primary' : 'text-muted hover:bg-default/70'"
              @click="globalActiveIds.left = 'local'"
            >
              <UIcon name="i-lucide-laptop" class="size-3.5 shrink-0" />
              <span>本地文件</span>
            </button>
            <button
              v-if="side === 'left' && !isTauriRuntime()"
              type="button"
              class="flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs"
              :class="globalActiveIds.left === 'web-upload' ? 'bg-default text-primary' : 'text-muted hover:bg-default/70'"
              @click="globalActiveIds.left = 'web-upload'"
            >
              <UIcon name="i-lucide-upload" class="size-3.5 shrink-0" />
              <span>本地上传</span>
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
            :title="t('FileManagement.AddRemoteSftp')"
            @click="openRemoteConnect(side)"
          />
        </div>

        <KokoLocalFileManagementPane
          v-if="side === 'left' && isTauriRuntime()"
          v-show="globalActiveIds.left === 'local'"
          ref="localPaneRef"
          class="min-h-0 flex-1"
          @select="localSelection = $event"
        />
        <KokoWebUploadPane
          v-if="side === 'left' && !isTauriRuntime()"
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
            @select="pane.selection = $event"
          />
        </template>
        <div
          v-else-if="!(side === 'left' && (
            isTauriRuntime()
              ? globalActiveIds.left === 'local'
              : globalActiveIds.left === 'web-upload'
          ))"
          class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted"
        >
          <div class="space-y-3">
            <UIcon name="i-lucide-server" class="mx-auto size-7 opacity-60" />
            <p>{{ side === "left" && isTauriRuntime() ? "正在准备本地文件夹" : "连接一个 SFTP Server" }}</p>
            <UButton size="sm" color="primary" variant="soft" icon="i-lucide-plus" @click="openRemoteConnect(side)">
              {{ t("FileManagement.ConnectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>

      <div class="col-start-2 row-start-1 flex min-h-0 flex-col items-center justify-center gap-2 border-x border-default">
        <UTooltip :text="t('FileManagement.TransferToRemote')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-right"
            :disabled="!(globalActiveIds.left === 'local' ? localSelection : activePaneForSide('left')?.selection) || !activePaneForSide('right') || transferring"
            :loading="transferring"
            @click="transferGlobal('left-to-right')"
          />
        </UTooltip>
        <UTooltip :text="t('FileManagement.TransferToLocal')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-left"
            :disabled="!activePaneForSide('right')?.selection || !(globalActiveIds.left === 'local' || activePaneForSide('left')) || transferring"
            :loading="transferring"
            @click="transferGlobal('right-to-left')"
          />
        </UTooltip>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1" :class="dualMode ? 'gap-1' : ''">
      <KokoFileManagementPane
        ref="primaryPaneRef"
        class="min-h-0 min-w-0 flex-1"
        :context="primaryContext"
        :title="dualMode ? t('FileManagement.LocalSftp') : undefined"
        @select="primarySelection = $event"
      />

      <div v-show="dualMode" class="flex w-8 shrink-0 flex-col items-center justify-center gap-2 border-x border-default px-0.5">
        <UTooltip :text="t('FileManagement.TransferToRemote')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-right"
            :disabled="!primarySelection || !checkedRemotePanes.length || transferring"
            :loading="transferring"
            @click="transferToRemotes"
          />
        </UTooltip>
        <UTooltip :text="t('FileManagement.TransferToLocal')">
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
            :class="activeRemoteId === pane.id ? 'ring-1 ring-inset ring-primary/40' : ''"
          >
            <div class="flex shrink-0 items-center gap-1 border-b border-default px-2 py-0.5">
              <UTooltip :text="t('FileManagement.TransferTarget')">
                <UCheckbox v-model="pane.checked" icon="i-lucide-check" />
              </UTooltip>
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-[11px] font-medium"
                :class="activeRemoteId === pane.id ? 'text-primary' : 'text-muted'"
                @click="focusRemotePane(pane.id)"
              >
                {{ pane.assetName }}
              </button>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                @click="removeRemotePane(pane.id)"
              />
            </div>
            <KokoFileManagementPane
              :ref="(el) => setRemotePaneRef(pane.id, el)"
              class="min-h-0 flex-1"
              :context="pane.context"
              @select="pane.selection = $event; focusRemotePane(pane.id)"
            />
          </div>
        </div>
        <div v-else class="grid h-full place-items-center p-4 text-center text-xs text-muted">
          <div class="space-y-2">
            <UIcon name="i-lucide-server" class="mx-auto size-6 opacity-60" />
            <p>{{ t("FileManagement.RemoteSftpHint") }}</p>
            <UButton size="xs" color="primary" variant="soft" @click="() => openRemoteConnect()">
              {{ t("FileManagement.ConnectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="connectModalOpen" :title="t('FileManagement.ConnectRemoteSftp')" :ui="{ content: 'max-w-md' }">
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 rounded-lg bg-elevated/70 px-2.5 py-2 text-[11px] text-muted">
            <span>当前组织</span>
            <span class="max-w-[220px] truncate font-medium text-default">{{ currentOrgLabel }}</span>
          </div>
          <UInput
            v-model="remoteAssetSearch"
            icon="i-lucide-search"
            :placeholder="t('RightPanel.SFTPSearchPlaceholder')"
          />
          <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
            <SideBarAssetTree
              :search="remoteAssetSearch"
              open
              @select="connectRemoteAsset"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="() => { connectModalOpen = false; }" />
      </template>
    </UModal>
  </div>
</template>
