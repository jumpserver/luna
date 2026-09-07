<script setup lang="ts">
import type { SftpCapabilities } from "#koko";
import type { KokoWorkspaceTab } from "#koko/host";
import type { AssetItem, AssetTreeNode } from "~/types";
import { KokoFileManagerSessionSurface } from "#koko";
import {
  createKokoCompactFileAiOwnerId,
  createKokoCompactFileAiTargetId,
  disposeKokoFileAiOwner
} from "#koko/composables/sftp/useFileAiSessions";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { activePaneId, activeTab, tabs } = useWorkspaceTabs();
const { openDevelopmentWorkspace: openDevelopmentWorkspaceSession } = useWorkspaceTabMenu();
const { getSessionDetails } = useWorkspaceSessionDetails();
const { setOpen: setRightPanelOpen } = useRightPanel();
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { displayUser, handleAssetConnection } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const search = ref("");
const searchLoading = ref(false);
const searchNodes = ref<AssetTreeNode[]>([]);
const selectedAsset = ref<AssetItem | null>(null);
const connecting = ref(false);
const inlinePayload = ref<Record<string, any> | null>(null);
const inlineError = ref("");
const inlineCapabilities = shallowRef<SftpCapabilities | null>(null);
const developmentOpening = ref(false);
let connectionAttempt = 0;
const trackedCompactAiOwnerIds = new Set<string>();

const activeWorkspaceSession = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab?.panes[0] || null;
});
const inlineAccount = computed(() => {
  const asset = selectedAsset.value;
  if (!asset) return "";
  const session = activeWorkspaceSession.value;
  if (session?.assetId === asset.id && session.account) return session.account;
  return displayUser(asset.id, asset.permedAccounts);
});
const compactAiOwnerId = computed(() => createKokoCompactFileAiOwnerId(activeWorkspaceSession.value?.id || ""));

const inlineTab = computed<KokoWorkspaceTab | null>(() => {
  const asset = selectedAsset.value;
  if (!asset || !inlinePayload.value) return null;
  return {
    id: createKokoCompactFileAiTargetId(activeWorkspaceSession.value?.id || "", asset.id, inlineAccount.value),
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.type || "",
    assetPlatform: asset.platform || "",
    assetCategory: asset.category || "",
    address: asset.address,
    protocol: "sftp",
    account: inlineAccount.value,
    status: "ready",
    payload: inlinePayload.value
  };
});

const activeWorkspaceAsset = computed(() => {
  const session = activeWorkspaceSession.value;
  if (!session || session.protocol !== "ssh") return null;
  return {
    id: session.assetId,
    name: session.assetName,
    address: session.address
  };
});
const activeWorkspaceSessionKey = computed(() => {
  const session = activeWorkspaceSession.value;
  if (!session || session.protocol !== "ssh") return "";
  return [session.id, session.assetId, session.account || "-"].join(":");
});
const workspaceSessionIdentities = computed(() => {
  const identities = new Map<string, string>();
  for (const tab of tabs.value) {
    const surfaces = tab.panes.length ? tab.panes : [tab];
    for (const surface of surfaces) {
      identities.set(surface.id, [surface.protocol, surface.assetId, surface.account || "-"].join(":"));
    }
  }
  return identities;
});
const activeFileTokenRequester = computed(
  () => getSessionDetails(activeWorkspaceSession.value?.id || "")?.requestFileToken
);
const canOpenDevelopmentWorkspace = computed(() => {
  const session = activeWorkspaceSession.value;
  const editor = inlineCapabilities.value?.file_editor;
  return Boolean(
    session?.protocol === "ssh" &&
    inlineTab.value?.assetId === session.assetId &&
    activeFileTokenRequester.value &&
    editor?.enabled &&
    editor.read &&
    editor.write &&
    editor.save.version === 1 &&
    editor.save.expected_version &&
    editor.save.force
  );
});
const isActiveAssetPreparing = computed(() =>
  Boolean(activeWorkspaceAsset.value && !inlineTab.value && !inlineError.value)
);

const reportError = (error: unknown) => {
  addErrorToast({
    title: t("Asset.GetAssetFailed"),
    error,
    icon: "i-lucide-circle-alert"
  });
};

const searchAssets = useDebounceFn(async (keyword: string) => {
  if (!keyword.trim() || !loggedIn.value) {
    searchNodes.value = [];
    return;
  }

  searchLoading.value = true;
  try {
    searchNodes.value = await fetchTree("search", undefined, keyword.trim());
  } catch (error) {
    reportError(error);
  } finally {
    searchLoading.value = false;
  }
}, 250);

watch(search, (value) => searchAssets(value));

const selectAsset = (node: AssetTreeNode) => {
  if (node.isParent || node.chkDisabled) return;
  selectedAsset.value = treeNodeToAsset(node);
};

const useActiveAsset = () => {
  if (!activeWorkspaceAsset.value) return;
  selectedAsset.value = {
    id: activeWorkspaceAsset.value.id,
    name: activeWorkspaceAsset.value.name,
    address: activeWorkspaceAsset.value.address,
    platform: "",
    zone: "",
    isActive: true,
    category: "",
    type: ""
  };
};

const openSftp = async () => {
  const asset = selectedAsset.value;
  if (!asset || connecting.value) return;

  const attempt = ++connectionAttempt;
  connecting.value = true;
  inlineError.value = "";
  inlineCapabilities.value = null;
  inlinePayload.value = null;
  try {
    const requestFileToken = activeFileTokenRequester.value;
    const activeSession = activeWorkspaceSession.value;
    // Prefer reusing the active SSH session token (same account/permissions, no extra ACL prompts).
    if (activeSession?.assetId === asset.id && requestFileToken) {
      const tokenId = await requestFileToken();
      if (attempt !== connectionAttempt) return;
      if (!tokenId) throw new Error(t("koko.fileManagement.unavailableInSession") || "SFTP unavailable");
      inlinePayload.value = {
        id: tokenId,
        token: { id: tokenId },
        connectMethod: { value: SFTP_FILE_MANAGER_VALUE, component: "koko" }
      };
      return;
    }

    // SSH session details not ready yet — wait for requestFileToken via the watcher.
    if (activeSession?.assetId === asset.id) return;

    const activeAccount = activeSession?.assetId === asset.id ? activeSession.account : "";
    const account = activeAccount || displayUser(asset.id, asset.permedAccounts);
    const preference = userInfoStore.getConnectionPreferenceForAsset(asset.id);
    const remembered = userInfoStore.getConnectionInfoForAsset(asset.id);
    const activeToken =
      activeSession?.assetId === asset.id ? activeSession.payload?.token || activeSession.payload : undefined;
    const accountId = preference?.accountId || remembered?.accountId || activeToken?.account;

    await new Promise<void>((resolve, reject) => {
      handleAssetConnection(account, asset.id, "ssh", asset.permedAccounts, "sftp", {
        accountMode: preference?.accountMode || remembered?.accountMode || "hosted",
        accountId,
        connectMethod: SFTP_FILE_MANAGER_VALUE,
        asset,
        onSessionReady: (payload) => {
          if (attempt === connectionAttempt) inlinePayload.value = payload;
          resolve();
        },
        onSessionError: reject
      }).catch(reject);
    });
  } catch (error) {
    if (attempt === connectionAttempt) {
      inlineError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (attempt === connectionAttempt) connecting.value = false;
  }
};

const openDevelopmentWorkspace = async () => {
  const workspaceTab = activeTab.value;
  const terminalPane = activeWorkspaceSession.value;
  const requestFileToken = activeFileTokenRequester.value;
  if (!workspaceTab || !terminalPane || !requestFileToken || developmentOpening.value) return;

  developmentOpening.value = true;
  try {
    const editorPane = await openDevelopmentWorkspaceSession(workspaceTab, terminalPane, requestFileToken);
    if (editorPane) setRightPanelOpen(false);
  } finally {
    developmentOpening.value = false;
  }
};

watch(
  [activeWorkspaceSessionKey, activeFileTokenRequester],
  ([sessionKey, requestFileToken], previousValues) => {
    const previousSessionKey = previousValues?.[0];
    const previousRequester = previousValues?.[1];
    const sessionChanged = sessionKey !== previousSessionKey;
    const requesterChanged = Boolean(requestFileToken && previousRequester && requestFileToken !== previousRequester);
    if (sessionChanged || requesterChanged) {
      connectionAttempt += 1;
      connecting.value = false;
      inlinePayload.value = null;
      inlineCapabilities.value = null;
      inlineError.value = "";
      selectedAsset.value = null;
      if (sessionKey) useActiveAsset();
    }
    if (sessionKey && requestFileToken && !inlinePayload.value && !connecting.value) {
      void openSftp();
    }
  },
  { immediate: true }
);
watch(
  workspaceSessionIdentities,
  (identities, previousIdentities) => {
    for (const [paneId, identity] of previousIdentities || []) {
      if (identities.get(paneId) === identity) continue;
      const ownerId = createKokoCompactFileAiOwnerId(paneId);
      disposeKokoFileAiOwner(ownerId);
      trackedCompactAiOwnerIds.delete(ownerId);
    }
    for (const paneId of identities.keys()) trackedCompactAiOwnerIds.add(createKokoCompactFileAiOwnerId(paneId));
  },
  { immediate: true }
);

function disposeTrackedCompactAiOwners() {
  for (const ownerId of trackedCompactAiOwnerIds) disposeKokoFileAiOwner(ownerId);
  trackedCompactAiOwnerIds.clear();
}

watch(
  loggedIn,
  (value) => {
    if (!value) disposeTrackedCompactAiOwners();
  },
  { immediate: true }
);
onUnmounted(disposeTrackedCompactAiOwners);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!loggedIn" class="grid min-h-0 flex-1 place-items-center px-4 text-xs text-gray-500 dark:text-gray-400">
      {{ t("Common.LoginFirst") }}
    </div>

    <div v-else-if="inlineTab" class="flex min-h-0 flex-1 flex-col">
      <div v-if="canOpenDevelopmentWorkspace" class="shrink-0 border-b border-default px-2 py-2">
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          block
          icon="i-lucide-panels-top-left"
          :label="t('RightPanel.OpenDevelopmentWorkspace')"
          :title="t('RightPanel.OpenDevelopmentWorkspaceHint')"
          :loading="developmentOpening"
          @click="openDevelopmentWorkspace"
        />
      </div>

      <KokoFileManagerSessionSurface
        :key="inlineTab.id"
        :tab="inlineTab"
        :ai-owner-id="compactAiOwnerId"
        compact
        class="min-h-0 flex-1"
        @capabilities="inlineCapabilities = $event"
      />
    </div>

    <div v-else-if="isActiveAssetPreparing" class="grid min-h-0 flex-1 place-items-center text-xs text-muted">
      <div class="flex flex-col items-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        <span>{{ t("koko.workspace.preparingSftp") }}</span>
      </div>
    </div>

    <div v-else-if="activeWorkspaceAsset && inlineError" class="grid min-h-0 flex-1 place-items-center px-4 text-xs">
      <div class="flex max-w-full flex-col items-center gap-3 text-center">
        <UIcon name="i-lucide-circle-alert" class="size-6 text-error" />
        <span class="break-all text-muted">{{ inlineError }}</span>
        <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" @click="openSftp">
          {{ t("koko.fileManagement.reconnect") }}
        </UButton>
      </div>
    </div>

    <template v-else>
      <div class="shrink-0 space-y-2 border-b border-gray-200 p-3 dark:border-white/10">
        <UInput
          v-model="search"
          size="sm"
          clearable
          icon="i-lucide-search"
          :placeholder="t('RightPanel.SFTPSearchPlaceholder')"
          :ui="{ base: 'text-[12px]' }"
        />

        <div
          v-if="activeWorkspaceAsset"
          class="flex items-center justify-between gap-2 rounded-lg bg-black/4 px-2.5 py-2 text-[11px] dark:bg-white/6"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-gray-700 dark:text-gray-200">
              {{ activeWorkspaceAsset.name }}
            </div>
            <div class="truncate font-ui-mono text-[10px] text-gray-500 dark:text-gray-400">
              {{ activeWorkspaceAsset.address }}
            </div>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            :label="t('RightPanel.UseActiveAsset')"
            @click="useActiveAsset"
          />
        </div>

        <div v-if="selectedAsset" class="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2">
          <div class="truncate text-[12px] font-medium text-gray-800 dark:text-gray-100">
            {{ selectedAsset.name }}
          </div>
          <div class="truncate font-ui-mono text-[10px] text-gray-500 dark:text-gray-400">
            {{ selectedAsset.address }}
          </div>
        </div>

        <UButton
          color="primary"
          variant="soft"
          size="sm"
          block
          icon="i-lucide-folder-symlink"
          :label="t('RightPanel.OpenSFTP')"
          :disabled="!selectedAsset"
          :loading="connecting"
          @click="openSftp"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto py-1">
        <div v-if="inlineError" class="px-3 py-2 text-xs text-error">
          {{ inlineError }}
        </div>
        <div v-if="searchLoading" class="grid h-20 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
        </div>

        <UEmpty
          v-else-if="!search.trim()"
          icon="i-lucide-folder-search"
          size="sm"
          variant="naked"
          :title="t('RightPanel.SFTPEmptyTitle')"
          :description="t('RightPanel.SFTPEmptyDescription')"
        />

        <UEmpty
          v-else-if="searchNodes.length === 0"
          icon="mingcute:inbox-line"
          size="sm"
          variant="naked"
          :title="t('Common.NoData')"
        />

        <button
          v-for="node in searchNodes"
          v-else
          :key="`sftp-search-${node.id}`"
          type="button"
          class="flex h-8 w-full items-center gap-2 px-3 text-left text-[12px] transition-colors hover:bg-black/5 dark:hover:bg-white/8"
          :class="selectedAsset?.id === treeNodeToAsset(node).id ? 'bg-primary/8' : ''"
          @click="selectAsset(node)"
        >
          <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-gray-400" />
          <span class="min-w-0 flex-1 truncate">{{ node.name }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
