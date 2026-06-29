<script setup lang="ts">
import type { AssetItem, AssetTreeKind, AssetTreeNode } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{
  search: string
}>();

const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
}>();

type PanelKind = Exclude<AssetTreeKind, "search">;

const { t } = useI18n();
const toast = useToast();
const userInfoStore = useUserInfoStore();
const { loggedIn, orgId } = storeToRefs(userInfoStore);
const { fetchTree, treeNodeToAsset } = useAssetTree();
const openPanel = ref<PanelKind | null>("authorization");
const authorizationNodes = ref<AssetTreeNode[]>([]);
const typeNodes = ref<AssetTreeNode[]>([]);
const searchNodes = ref<AssetTreeNode[]>([]);
const loading = ref(false);
const searchLoading = ref(false);

const panels = computed(() => [
  { kind: "authorization" as const, label: t("Menu.AuthorizedTree"), nodes: authorizationNodes.value },
  { kind: "type" as const, label: t("Menu.TypeTree"), nodes: typeNodes.value }
]);

const reportError = (error: unknown) => {
  toast.add({
    title: t("Asset.GetAssetFailed"),
    description: error instanceof Error ? error.message : String(error),
    color: "error",
    icon: "i-lucide-circle-alert"
  });
};

const loadRoot = async (kind: PanelKind) => {
  if (!loggedIn.value) return;
  loading.value = true;
  try {
    const nodes = await fetchTree(kind);
    if (kind === "authorization") authorizationNodes.value = nodes;
    else typeNodes.value = nodes;
  } catch (error) {
    reportError(error);
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  searchNodes.value = [];
  await Promise.all([loadRoot("authorization"), loadRoot("type")]);
};

const togglePanel = (kind: PanelKind) => {
  openPanel.value = openPanel.value === kind ? null : kind;
};

const toggleNode = async (node: AssetTreeNode, kind: PanelKind) => {
  if (node.open) {
    node.open = false;
    return;
  }

  node.open = true;
  if (node.loaded || node.loading) return;
  node.loading = true;
  try {
    node.children = await fetchTree(kind, node);
    node.loaded = true;
  } catch (error) {
    node.open = false;
    reportError(error);
  } finally {
    node.loading = false;
  }
};

const selectNode = (node: AssetTreeNode) => {
  if (node.chkDisabled) return;
  emit("select", treeNodeToAsset(node));
};

const openContextMenu = (node: AssetTreeNode, event: MouseEvent) => {
  if (node.isParent || node.chkDisabled) return;
  emit("contextmenu", treeNodeToAsset(node), event);
};

const searchTree = useDebounceFn(async (keyword: string) => {
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

watch(() => props.search, (value) => searchTree(value));
watch([loggedIn, orgId], ([isLoggedIn]) => {
  if (isLoggedIn) {
    refresh();
  } else {
    authorizationNodes.value = [];
    typeNodes.value = [];
    searchNodes.value = [];
  }
}, { immediate: true });

defineExpose({ refresh, loading });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" role="tree" :aria-label="t('Menu.Resource')">
    <div v-if="!loggedIn" class="grid min-h-0 flex-1 place-items-center px-3 text-xs text-gray-500 dark:text-gray-400">
      请先登录
    </div>

    <template v-else-if="search.trim()">
      <div class="flex h-8 shrink-0 items-center border-b border-gray-200 px-3 text-xs font-medium dark:border-white/10">
        <UIcon name="i-lucide-search" class="mr-1.5 size-3.5 text-gray-400" />
        <span class="truncate">{{ t("Operation.Search") }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto py-1">
        <div v-if="searchLoading" class="grid h-20 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
        </div>
        <UEmpty v-else-if="searchNodes.length === 0" icon="mingcute:inbox-line" size="sm" variant="naked" :title="t('Common.NoData')" />
        <SideBarAssetTreeNode
          v-for="node in searchNodes"
          v-else
          :key="`search-${node.id}`"
          :node="node"
          tree-kind="authorization"
          search-mode
          @select="selectNode"
          @contextmenu="openContextMenu"
        />
      </div>
    </template>

    <template v-else>
      <section
        v-for="panel in panels"
        :key="panel.kind"
        class="flex min-h-0 flex-col border-b border-gray-200 dark:border-white/10"
        :class="openPanel === panel.kind ? 'flex-1' : 'shrink-0'"
      >
        <button
          type="button"
          class="flex h-8 w-full shrink-0 items-center gap-1.5 px-3 text-left text-xs font-medium text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
          :aria-expanded="openPanel === panel.kind"
          @click="togglePanel(panel.kind)"
        >
          <UIcon name="i-lucide-chevron-down" class="size-3 transition-transform" :class="openPanel === panel.kind ? '' : '-rotate-90'" />
          <span class="min-w-0 flex-1 truncate">{{ panel.label }}</span>
          <UButton
            v-if="openPanel === panel.kind"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            class="size-6 justify-center rounded-sm p-0"
            :aria-label="t('ToolTips.Refresh')"
            @click.stop="loadRoot(panel.kind)"
          />
        </button>

        <div v-if="openPanel === panel.kind" class="min-h-0 flex-1 overflow-y-auto py-1">
          <div v-if="loading && panel.nodes.length === 0" class="grid h-20 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
          </div>
          <UEmpty v-else-if="panel.nodes.length === 0" icon="mingcute:inbox-line" size="sm" variant="naked" :title="t('Common.NoData')" />
          <SideBarAssetTreeNode
            v-for="node in panel.nodes"
            v-else
            :key="`${panel.kind}-${node.id}`"
            :node="node"
            :tree-kind="panel.kind"
            @select="selectNode"
            @toggle="toggleNode"
            @contextmenu="openContextMenu"
          />
        </div>
      </section>
    </template>
  </div>
</template>
