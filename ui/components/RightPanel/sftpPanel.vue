<script setup lang="ts">
import type { KokoWorkspaceTab } from "#koko/host";
import type { CachedSftpPane } from "~/components/RightPanel/sftpSessionCache";
import type { WorkspacePane } from "~/composables/useWorkspaceTabs";
import type { AssetItem, AssetTreeNode } from "~/types";
import { KokoFileManagerSessionSurface } from "#koko";
import {
  createKokoCompactFileAiOwnerId,
  createKokoCompactFileAiTargetId,
  disposeKokoFileAiOwner
} from "#koko/composables/sftp/useFileAiSessions";
import { compactSftpCacheIdentity, nextSftpSessionCache } from "~/components/RightPanel/sftpSessionCache";
import SftpSessionInline from "~/components/RightPanel/sftpSessionInline.vue";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { activePaneId, activeTab, tabs } = useWorkspaceTabs();
const { open: rightPanelOpen, activeTab: rightPanelTab } = useRightPanel();
const { getSessionDetails } = useWorkspaceSessionDetails();
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { displayUser, handleAssetConnection } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const search = ref("");
const searchLoading = ref(false);
const searchNodes = ref<AssetTreeNode[]>([]);
const selectedAsset = ref<AssetItem | null>(null);
const connecting = ref(false);
const searchPayload = ref<Record<string, unknown> | null>(null);
const searchError = ref("");
const cachedSessions = ref<CachedSftpPane[]>([]);
let connectionAttempt = 0;

const activeWorkspaceSession = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab?.panes[0] || null;
});
const panesById = computed(() => {
  const panes = new Map<string, WorkspacePane>();
  for (const tab of tabs.value) {
    for (const pane of tab.panes) panes.set(pane.id, pane);
  }
  return panes;
});
const liveIdentities = computed(() => {
  const identities = new Map<string, string>();
  for (const [paneId, surface] of panesById.value) {
    const identity = compactSftpCacheIdentity({
      paneId,
      protocol: surface.protocol,
      assetId: surface.assetId,
      account: surface.account,
      sessionId: getSessionDetails(paneId)?.sessionId
    });
    if (identity) identities.set(paneId, identity);
  }
  return identities;
});
const sftpTabVisible = computed(() => loggedIn.value && rightPanelOpen.value && rightPanelTab.value === "sftp");
const activeSshPaneId = computed(() =>
  activeWorkspaceSession.value?.protocol === "ssh" ? activeWorkspaceSession.value.id : ""
);
const activeCached = computed(() => cachedSessions.value.some((entry) => entry.paneId === activeSshPaneId.value));
const activeWorkspaceAsset = computed(() => {
  const session = activeWorkspaceSession.value;
  if (!session || session.protocol !== "ssh") return null;
  return {
    id: session.assetId,
    name: session.assetName,
    address: session.address
  };
});
const searchAccount = computed(() => {
  const asset = selectedAsset.value;
  if (!asset) return "";
  return displayUser(asset.id, asset.permedAccounts);
});
const searchTab = computed<KokoWorkspaceTab | null>(() => {
  const asset = selectedAsset.value;
  if (!asset || !searchPayload.value) return null;
  return {
    id: createKokoCompactFileAiTargetId(activeWorkspaceSession.value?.id || "", asset.id, searchAccount.value),
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.type || "",
    assetPlatform: asset.platform || "",
    assetCategory: asset.category || "",
    protocol: "sftp",
    account: searchAccount.value,
    payload: searchPayload.value
  };
});
const showPreparing = computed(() => Boolean(activeWorkspaceAsset.value && !activeCached.value));
const showSearch = computed(() => !activeCached.value && !showPreparing.value);
const mountedSessions = computed(() =>
  cachedSessions.value.flatMap((entry) => {
    const session = panesById.value.get(entry.paneId);
    return session ? [{ ...entry, session }] : [];
  })
);

function disposeCachedOwner(paneId: string) {
  disposeKokoFileAiOwner(createKokoCompactFileAiOwnerId(paneId));
}

function syncCachedSessions() {
  const previous = cachedSessions.value;
  const next = loggedIn.value
    ? nextSftpSessionCache({
        cached: previous,
        identities: liveIdentities.value,
        activePaneId: activeSshPaneId.value,
        sftpTabVisible: sftpTabVisible.value
      })
    : [];
  cachedSessions.value = next;
  const nextKeys = new Set(next.map((entry) => `${entry.paneId}:${entry.identity}`));
  for (const entry of previous) {
    if (!nextKeys.has(`${entry.paneId}:${entry.identity}`)) disposeCachedOwner(entry.paneId);
  }
}

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

const openSearchSftp = async () => {
  const asset = selectedAsset.value;
  if (!asset || connecting.value) return;

  const attempt = ++connectionAttempt;
  connecting.value = true;
  searchError.value = "";
  searchPayload.value = null;
  try {
    const account = displayUser(asset.id, asset.permedAccounts);
    const preference = userInfoStore.getConnectionPreferenceForAsset(asset.id);
    const remembered = userInfoStore.getConnectionInfoForAsset(asset.id);
    const accountId = preference?.accountId || remembered?.accountId;

    await new Promise<void>((resolve, reject) => {
      handleAssetConnection(account, asset.id, "ssh", asset.permedAccounts, "sftp", {
        accountMode: preference?.accountMode || remembered?.accountMode || "hosted",
        accountId,
        connectMethod: SFTP_FILE_MANAGER_VALUE,
        asset,
        onSessionReady: (payload) => {
          if (attempt === connectionAttempt) searchPayload.value = payload;
          resolve();
        },
        onSessionError: reject
      }).catch(reject);
    });
  } catch (error) {
    if (attempt === connectionAttempt) {
      searchError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (attempt === connectionAttempt) connecting.value = false;
  }
};

watch([liveIdentities, activeSshPaneId, sftpTabVisible, loggedIn], syncCachedSessions, { immediate: true });

watch(loggedIn, (value) => {
  if (value) return;
  searchPayload.value = null;
  selectedAsset.value = null;
  searchError.value = "";
});

onUnmounted(() => {
  for (const entry of cachedSessions.value) disposeCachedOwner(entry.paneId);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!loggedIn" class="grid min-h-0 flex-1 place-items-center px-4 text-xs text-gray-500 dark:text-gray-400">
      {{ t("Common.LoginFirst") }}
    </div>

    <template v-else>
      <SftpSessionInline
        v-for="entry in mountedSessions"
        v-show="entry.paneId === activeSshPaneId"
        :key="entry.identity"
        :session="entry.session"
        class="min-h-0 flex-1"
      />

      <div v-if="showPreparing" class="grid min-h-0 flex-1 place-items-center text-xs text-muted">
        <div class="flex flex-col items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
          <span>{{ t("koko.workspace.preparingSftp") }}</span>
        </div>
      </div>

      <div v-else-if="!activeCached && searchTab" class="flex min-h-0 flex-1 flex-col">
        <KokoFileManagerSessionSurface :key="searchTab.id" :tab="searchTab" compact class="min-h-0 flex-1" />
      </div>

      <template v-else-if="showSearch">
        <div class="shrink-0 space-y-2 border-b border-gray-200 p-3 dark:border-white/10">
          <UInput
            v-model="search"
            size="sm"
            clearable
            icon="i-lucide-search"
            :placeholder="t('RightPanel.SFTPSearchPlaceholder')"
            :ui="{ base: 'text-[12px]' }"
          />

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
            @click="openSearchSftp"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto py-1">
          <div v-if="searchError" class="px-3 py-2 text-xs text-error">
            {{ searchError }}
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
    </template>
  </div>
</template>
