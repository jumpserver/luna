<script setup lang="ts">
import type { AssetItem, AssetTreeNode } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const toast = useToast();
const { activeTab } = useWorkspaceTabs();
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { displayUser, handleAssetConnection } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const search = ref("");
const searchLoading = ref(false);
const searchNodes = ref<AssetTreeNode[]>([]);
const selectedAsset = ref<AssetItem | null>(null);
const connecting = ref(false);

const activeWorkspaceAsset = computed(() => {
  if (!activeTab.value || activeTab.value.protocol !== "ssh") return null;
  return {
    id: activeTab.value.assetId,
    name: activeTab.value.assetName,
    address: activeTab.value.address
  };
});

const reportError = (error: unknown) => {
  toast.add({
    title: t("Asset.GetAssetFailed"),
    description: error instanceof Error ? error.message : String(error),
    color: "error",
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

  connecting.value = true;
  try {
    handleAssetConnection(
      displayUser(asset.id, asset.permedAccounts),
      asset.id,
      "ssh",
      asset.permedAccounts,
      "sftp",
      {
        connectMethod: isTauriRuntime() ? "sftp_client" : "web_sftp",
        asset
      }
    );
  } finally {
    connecting.value = false;
  }
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!loggedIn" class="grid min-h-0 flex-1 place-items-center px-4 text-xs text-gray-500 dark:text-gray-400">
      {{ t("Common.LoginFirst") }}
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
            <div class="truncate font-medium text-gray-700 dark:text-gray-200">{{ activeWorkspaceAsset.name }}</div>
            <div class="truncate font-ui-mono text-[10px] text-gray-500 dark:text-gray-400">{{ activeWorkspaceAsset.address }}</div>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            :label="t('RightPanel.UseActiveAsset')"
            @click="useActiveAsset"
          />
        </div>

        <div
          v-if="selectedAsset"
          class="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2"
        >
          <div class="truncate text-[12px] font-medium text-gray-800 dark:text-gray-100">{{ selectedAsset.name }}</div>
          <div class="truncate font-ui-mono text-[10px] text-gray-500 dark:text-gray-400">{{ selectedAsset.address }}</div>
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
