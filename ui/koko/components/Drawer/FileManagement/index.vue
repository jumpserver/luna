<script setup lang="ts">
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import type { AssetTreeNode } from "~/types";
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import KokoFileManagementPane from "~/koko/components/Drawer/FileManagement/pane.vue";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { connectorSessionKey } from "~/koko/composables/wsUrl";
import { resolveDevHost } from "~/shared/connectors/useConnectorEndpoint";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{
  sftpToken?: string
  showEmpty?: boolean
}>();

const emit = defineEmits<{ reconnect: [] }>();

const { t } = useI18n();
const toast = useToast();
const { createKokoTicket } = useWorkspaceConnectors();
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { displayUser, handleAssetConnection } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const providedContext = inject(connectorSessionKey, ref(null));
const primaryContext = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  return { ...value, tokenId: props.sftpToken };
});

const dualMode = ref(false);
const remoteContext = ref<ConnectorSessionContext | null>(null);
const remoteAssetName = ref("");
const connectModalOpen = ref(false);
const remoteSearch = ref("");
const remoteSearchLoading = ref(false);
const remoteSearchNodes = ref<AssetTreeNode[]>([]);
const remoteConnecting = ref(false);
const transferring = ref(false);

const primaryPaneRef = ref<InstanceType<typeof KokoFileManagementPane> | null>(null);
const remotePaneRef = ref<InstanceType<typeof KokoFileManagementPane> | null>(null);
const primarySelection = ref<SftpFileEntry | null>(null);
const remoteSelection = ref<SftpFileEntry | null>(null);

async function buildSftpContext(assetId: string, tokenId: string, tabId: string): Promise<ConnectorSessionContext> {
  let endpointUrl = resolveDevHost("koko") || window.location.origin;
  if (isTauriRuntime() && !import.meta.dev) {
    const endpoint = await useTauriCoreInvoke<{ host?: string, port?: number, https_port?: number }>("get_smart_endpoint", {
      query: { protocol: "sftp", assetId, token: tokenId }
    });
    if (!endpoint.host) throw new Error("smart endpoint missing host");
    const secure = Boolean(endpoint.https_port);
    endpointUrl = `${secure ? "https" : "http"}://${endpoint.host}${endpoint.https_port || endpoint.port ? `:${endpoint.https_port || endpoint.port}` : ""}`;
  }

  let ticket = "";
  try {
    ticket = String((await createKokoTicket({ baseUrl: endpointUrl, tokenId })).ticket || "");
  } catch (cause) {
    if (isTauriRuntime()) throw cause;
  }

  return { component: "koko", tokenId, ticket, endpointUrl, tabId };
}

const searchRemoteAssets = useDebounceFn(async (keyword: string) => {
  if (!keyword.trim() || !loggedIn.value) {
    remoteSearchNodes.value = [];
    return;
  }
  remoteSearchLoading.value = true;
  try {
    remoteSearchNodes.value = await fetchTree("search", undefined, keyword.trim());
  } finally {
    remoteSearchLoading.value = false;
  }
}, 250);

watch(remoteSearch, (value) => searchRemoteAssets(value));

function openRemoteConnect() {
  dualMode.value = true;
  connectModalOpen.value = true;
}

function disconnectRemote() {
  remoteContext.value = null;
  remoteAssetName.value = "";
  remoteSelection.value = null;
}

function toggleDualMode() {
  if (dualMode.value) {
    dualMode.value = false;
    disconnectRemote();
    return;
  }
  openRemoteConnect();
}

async function connectRemoteAsset(node: AssetTreeNode) {
  if (node.isParent || node.chkDisabled || remoteConnecting.value) return;
  const asset = treeNodeToAsset(node);
  remoteConnecting.value = true;
  try {
    const preference = userInfoStore.getConnectionPreferenceForAsset(asset.id);
    const remembered = userInfoStore.getConnectionInfoForAsset(asset.id);
    const accountId = preference?.accountId || remembered?.accountId;
    const account = displayUser(asset.id, asset.permedAccounts);

    await new Promise<void>((resolve, reject) => {
      handleAssetConnection(account, asset.id, "ssh", asset.permedAccounts, "sftp", {
        accountMode: preference?.accountMode || remembered?.accountMode || "hosted",
        accountId,
        connectMethod: SFTP_FILE_MANAGER_VALUE,
        asset,
        onSessionReady: async (payload) => {
          try {
            const tokenId = String(payload.id || payload.token?.id || "");
            remoteContext.value = await buildSftpContext(asset.id, tokenId, `remote-sftp:${asset.id}`);
            remoteAssetName.value = asset.name;
            connectModalOpen.value = false;
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onSessionError: reject
      });
    });

    toast.add({ title: t("FileManagement.RemoteConnected"), color: "success" });
  } catch (error) {
    toast.add({
      title: t("FileManagement.RemoteConnectFailed"),
      description: String(error),
      color: "error"
    });
  } finally {
    remoteConnecting.value = false;
  }
}

async function transferEntry(
  fromPane: InstanceType<typeof KokoFileManagementPane> | null,
  toPane: InstanceType<typeof KokoFileManagementPane> | null,
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
    toast.add({
      title: t("FileManagement.TransferFailed"),
      description: String(error),
      color: "error"
    });
  } finally {
    transferring.value = false;
  }
}

const transferToRemote = () => transferEntry(primaryPaneRef.value, remotePaneRef.value, primarySelection.value);
const transferToPrimary = () => transferEntry(remotePaneRef.value, primaryPaneRef.value, remoteSelection.value);
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
    <div class="flex shrink-0 items-center justify-end gap-1 border-b border-default px-2 py-1">
      <UButton
        size="xs"
        :color="dualMode ? 'primary' : 'neutral'"
        :variant="dualMode ? 'soft' : 'ghost'"
        icon="i-lucide-server"
        :label="dualMode ? t('FileManagement.RemoteSftp') : t('FileManagement.ConnectRemoteSftp')"
        @click="toggleDualMode"
      />
      <UButton
        v-if="dualMode && !remoteContext"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-plug"
        :label="t('FileManagement.ConnectRemoteSftp')"
        @click="openRemoteConnect"
      />
      <UButton
        v-if="dualMode && remoteContext"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-unplug"
        :label="t('FileManagement.DisconnectRemote')"
        @click="disconnectRemote"
      />
    </div>

    <div class="flex min-h-0 flex-1" :class="dualMode ? 'gap-1' : ''">
      <KokoFileManagementPane
        ref="primaryPaneRef"
        class="min-h-0 min-w-0 flex-1"
        :context="primaryContext"
        :title="dualMode ? t('FileManagement.LocalSftp') : undefined"
        @select="primarySelection = $event"
      />

      <div v-if="dualMode" class="flex w-8 shrink-0 flex-col items-center justify-center gap-2 border-x border-default px-0.5">
        <UTooltip :text="t('FileManagement.TransferToRemote')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-right"
            :disabled="!primarySelection || !remoteContext || transferring"
            :loading="transferring"
            @click="transferToRemote"
          />
        </UTooltip>
        <UTooltip :text="t('FileManagement.TransferToLocal')">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-left"
            :disabled="!remoteSelection || !remoteContext || transferring"
            :loading="transferring"
            @click="transferToPrimary"
          />
        </UTooltip>
      </div>

      <div v-if="dualMode" class="min-h-0 min-w-0 flex-1">
        <KokoFileManagementPane
          v-if="remoteContext"
          ref="remotePaneRef"
          class="h-full"
          :context="remoteContext"
          :title="remoteAssetName || t('FileManagement.RemoteSftp')"
          @select="remoteSelection = $event"
        />
        <div v-else class="grid h-full place-items-center p-4 text-center text-xs text-muted">
          <div class="space-y-2">
            <UIcon name="i-lucide-server" class="mx-auto size-6 opacity-60" />
            <p>{{ t("FileManagement.RemoteSftpHint") }}</p>
            <UButton size="xs" color="primary" variant="soft" @click="openRemoteConnect">
              {{ t("FileManagement.ConnectRemoteSftp") }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="connectModalOpen" :title="t('FileManagement.ConnectRemoteSftp')" :ui="{ content: 'max-w-md' }">
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="remoteSearch"
            icon="i-lucide-search"
            :placeholder="t('RightPanel.SFTPSearchPlaceholder')"
            :loading="remoteSearchLoading"
          />
          <div class="max-h-64 space-y-1 overflow-y-auto">
            <button
              v-for="node in remoteSearchNodes"
              :key="`remote-sftp-${node.id}`"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-elevated"
              :disabled="remoteConnecting"
              @click="connectRemoteAsset(node)"
            >
              <UIcon name="i-lucide-server" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ node.name }}</span>
            </button>
            <p v-if="remoteSearch.trim() && !remoteSearchLoading && remoteSearchNodes.length === 0" class="py-4 text-center text-xs text-muted">
              {{ t("Common.NoData") }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="connectModalOpen = false" />
      </template>
    </UModal>
  </div>
</template>
