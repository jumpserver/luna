<script setup lang="ts">
import type { AssetItem, AssetTreeNode } from "~/types";
import ConnectionEditor from "~/components/ConnectionEditor/connectionEditor.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const toast = useToast();
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { saveConnectionInfo } = useAssetConnection();
const { confirmConnection } = useAssetAction();
const { openSession } = useWorkspaceTabs();
const {
  batchAssets,
  batchCommand,
  addBatchAsset,
  removeBatchAsset,
  clearBatchAssets
} = useRightPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);

const search = ref("");
const searchLoading = ref(false);
const searchNodes = ref<AssetTreeNode[]>([]);
const executing = ref(false);
const connEditorRef = ref<InstanceType<typeof ConnectionEditor> | null>(null);

const hasSshProtocol = (asset: AssetItem) => {
  if (asset.savedConnection?.protocol === "ssh") return true;
  return asset.permedProtocols?.some((item) => item.name === "ssh") ?? false;
};

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
  addBatchAsset(treeNodeToAsset(node));
  search.value = "";
  searchNodes.value = [];
};

const connectWithBuiltinSsh = (asset: AssetItem, info: Record<string, any>) => {
  const protocol = info.protocol || asset.savedConnection?.protocol || "ssh";
  const availableProtocols = info.availableProtocols || asset.savedConnection?.availableProtocols || [];

  if (protocol !== "ssh") return false;
  if (availableProtocols.length > 0 && !availableProtocols.includes("ssh")) return false;

  const builtinInfo = {
    ...info,
    protocol: "ssh",
    connectMethod: "builtin_client"
  };
  saveConnectionInfo(asset, builtinInfo);

  const session = openSession(
    {
      ...asset,
      savedConnection: {
        ...(asset.savedConnection || {}),
        protocol: "ssh",
        username: builtinInfo.account,
        connectMethod: "builtin_client"
      }
    },
    {
      protocol: "ssh",
      account: builtinInfo.account
    }
  );

  confirmConnection(asset, {
    ...builtinInfo,
    connectMethod: "builtin_client",
    tabId: session.id
  });

  return true;
};

const connectAsset = async (asset: AssetItem) => {
  if (!hasSshProtocol(asset)) {
    toast.add({
      title: t("RightPanel.BatchUnsupportedAsset"),
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3000
    });
    return false;
  }

  const saved = asset.savedConnection;
  const canDirectConnect = saved?.protocol === "ssh" && saved.username;

  if (canDirectConnect) {
    return connectWithBuiltinSsh(asset, {
      protocol: "ssh",
      account: saved.username,
      accountId: saved.accountId,
      accountMode: saved.accountMode || "hosted",
      manualUsername: saved.manualUsername || "",
      manualPassword: saved.manualPassword || "",
      dynamicPassword: saved.dynamicPassword || "",
      rememberSecret: !!saved.rememberSecret,
      connectMethod: "builtin_client",
      availableProtocols: saved.availableProtocols || []
    });
  }

  try {
    const info = await connEditorRef.value!.open(asset);
    return connectWithBuiltinSsh(asset, {
      ...info,
      protocol: "ssh"
    });
  } catch {
    return false;
  }
};

const executeBatch = async () => {
  if (executing.value || batchAssets.value.length === 0) return;

  executing.value = true;
  let connected = 0;

  try {
    for (const asset of batchAssets.value) {
      if (await connectAsset(asset)) connected += 1;
    }

    toast.add({
      title: t("RightPanel.BatchStartedTitle"),
      description: batchCommand.value.trim()
        ? t("RightPanel.BatchStartedWithCommand", { count: connected, command: batchCommand.value.trim() })
        : t("RightPanel.BatchStartedDescription", { count: connected }),
      color: connected > 0 ? "success" : "warning",
      icon: connected > 0 ? "i-lucide-terminal" : "i-lucide-circle-alert",
      duration: 4000
    });
  } finally {
    executing.value = false;
  }
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <ConnectionEditor ref="connEditorRef" />

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
          :placeholder="t('RightPanel.BatchSearchPlaceholder')"
          :ui="{ base: 'text-[12px]' }"
        />

        <div v-if="search.trim()" class="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10">
          <div v-if="searchLoading" class="grid h-16 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
          </div>
          <button
            v-for="node in searchNodes"
            v-else
            :key="`batch-search-${node.id}`"
            type="button"
            class="flex h-8 w-full items-center gap-2 px-2.5 text-left text-[12px] transition-colors hover:bg-black/5 dark:hover:bg-white/8"
            @click="selectAsset(node)"
          >
            <UIcon name="i-lucide-server" class="size-3.5 shrink-0 text-gray-400" />
            <span class="min-w-0 flex-1 truncate">{{ node.name }}</span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-gray-500 dark:text-gray-400">
            {{ t("RightPanel.BatchSelectedCount", { count: batchAssets.length }) }}
          </span>
          <UButton
            v-if="batchAssets.length > 0"
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('RightPanel.BatchClear')"
            @click="clearBatchAssets"
          />
        </div>

        <div v-if="batchAssets.length > 0" class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          <button
            v-for="asset in batchAssets"
            :key="asset.id"
            type="button"
            class="inline-flex max-w-full items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-[11px] text-gray-700 transition-colors hover:bg-black/8 dark:bg-white/8 dark:text-gray-200 dark:hover:bg-white/12"
            @click="removeBatchAsset(asset.id)"
          >
            <span class="truncate">{{ asset.name }}</span>
            <UIcon name="i-lucide-x" class="size-3 shrink-0" />
          </button>
        </div>

        <UTextarea
          v-model="batchCommand"
          :rows="3"
          autoresize
          :maxrows="6"
          :placeholder="t('RightPanel.BatchCommandPlaceholder')"
          :ui="{ base: 'text-[12px] font-ui-mono' }"
        />

        <UButton
          color="primary"
          variant="soft"
          size="sm"
          block
          icon="i-lucide-play"
          :label="t('RightPanel.BatchExecute')"
          :disabled="batchAssets.length === 0"
          :loading="executing"
          @click="executeBatch"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <UEmpty
          v-if="batchAssets.length === 0"
          icon="i-lucide-terminal"
          size="sm"
          variant="naked"
          :title="t('RightPanel.BatchEmptyTitle')"
          :description="t('RightPanel.BatchEmptyDescription')"
        />
      </div>
    </template>
  </div>
</template>
