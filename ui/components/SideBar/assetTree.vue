<script setup lang="ts">
import type { AssetItem, AssetTreeKind, AssetTreeNode } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{
  search: string
  open?: boolean
}>();

const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
  toggle: []
  openMultiple: [assets: AssetItem[]]
}>();

type PanelKind = Exclude<AssetTreeKind, "search">;

const { t } = useI18n();
const toast = useToast();
const userInfoStore = useUserInfoStore();
const { loggedIn, orgId } = storeToRefs(userInfoStore);
const { fetchTree, treeNodeToAsset } = useAssetTree();
const activeTreeKind = ref<PanelKind>("authorization");
const authorizationNodes = ref<AssetTreeNode[]>([]);
const typeNodes = ref<AssetTreeNode[]>([]);
const searchNodes = ref<AssetTreeNode[]>([]);
const loading = ref(false);
const searchLoading = ref(false);
const batchMode = ref(false);
const checkedAssets = ref<Record<string, AssetItem>>({});
const checkedNodeIds = ref<string[]>([]);

const activeTree = computed(() => activeTreeKind.value === "authorization"
  ? { label: t("Menu.AuthorizedTree"), nodes: authorizationNodes.value }
  : { label: t("Menu.TypeTree"), nodes: typeNodes.value });

const treeSwitchLabel = computed(() => activeTreeKind.value === "authorization"
  ? t("Tree.SwitchToType")
  : t("Tree.SwitchToAuthorization"));
const checkedCount = computed(() => Object.keys(checkedAssets.value).length);
const batchMenuItems = computed(() => [[{
  label: t("Tree.OpenMultiple"),
  icon: "i-lucide-list-checks",
  onSelect: () => {
    batchMode.value = true;
    checkedAssets.value = {};
    checkedNodeIds.value = [];
  }
}]]);

const resetTreeLevels = (nodes: AssetTreeNode[], level = 0) => {
  for (const node of nodes) {
    node.level = level;
    if (node.children?.length) resetTreeLevels(node.children, level + 1);
  }
  return nodes;
};

const unwrapAllTypesRoot = (nodes: AssetTreeNode[]) => {
  const root = nodes.find((node) => node.id.toUpperCase() === "ROOT");
  if (!root?.children?.length) return nodes;
  return resetTreeLevels(root.children);
};

const removeFavoriteNodes = (nodes: AssetTreeNode[]): AssetTreeNode[] => nodes
  .filter((node) => node.id.toLowerCase() !== "favorite" && node.key?.toLowerCase() !== "favorite")
  .map((node) => ({
    ...node,
    children: node.children?.length ? removeFavoriteNodes(node.children) : node.children
  }));

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
    if (kind === "authorization") authorizationNodes.value = removeFavoriteNodes(nodes);
    else typeNodes.value = unwrapAllTypesRoot(nodes);
  } catch (error) {
    reportError(error);
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  searchNodes.value = [];
  checkedAssets.value = {};
  checkedNodeIds.value = [];
  await Promise.all([loadRoot("authorization"), loadRoot("type")]);
};

const switchTreeKind = () => {
  activeTreeKind.value = activeTreeKind.value === "authorization" ? "type" : "authorization";
  checkedAssets.value = {};
  checkedNodeIds.value = [];
  batchMode.value = false;
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
    const children = await fetchTree(kind, node);
    node.children = kind === "authorization" ? removeFavoriteNodes(children) : children;
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

const toggleCheckedNode = (node: AssetTreeNode) => {
  if (node.chkDisabled || node.isParent) return;

  const asset = treeNodeToAsset(node);
  const next = { ...checkedAssets.value };
  const nextNodeIds = new Set(checkedNodeIds.value);

  if (next[asset.id]) delete next[asset.id];
  else next[asset.id] = asset;

  if (nextNodeIds.has(node.id)) nextNodeIds.delete(node.id);
  else nextNodeIds.add(node.id);

  checkedAssets.value = next;
  checkedNodeIds.value = [...nextNodeIds];
};

const closeBatchMode = () => {
  batchMode.value = false;
  checkedAssets.value = {};
  checkedNodeIds.value = [];
};

const openCheckedAssets = () => {
  const assets = Object.values(checkedAssets.value);
  if (assets.length === 0) return;

  emit("openMultiple", assets);
  closeBatchMode();
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
watch(() => props.search, (value) => {
  if (value.trim()) closeBatchMode();
});
watch([loggedIn, orgId], ([isLoggedIn]) => {
  if (isLoggedIn) {
    refresh();
  } else {
    authorizationNodes.value = [];
    typeNodes.value = [];
    searchNodes.value = [];
    closeBatchMode();
  }
}, { immediate: true });

defineExpose({ refresh, loading });
</script>

<template>
  <div
    class="flex min-h-8 flex-col"
    :class="open === false ? 'h-8 shrink-0' : 'min-h-0 flex-1'"
    role="tree"
    :aria-label="t('Menu.Resource')"
  >
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
      <section class="group flex min-h-0 flex-1 flex-col overflow-hidden border-b border-gray-200 dark:border-white/10">
        <div class="flex h-8 w-full shrink-0 items-center gap-1 px-3 text-xs font-medium text-gray-700 dark:text-gray-300">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            :aria-expanded="open !== false"
            @click="emit('toggle')"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 shrink-0 transition-transform duration-150"
              :class="open === false ? '' : 'rotate-90'"
            />
            <span class="min-w-0 flex-1 truncate">{{ activeTree.label }}</span>
          </button>
          <div
            v-if="batchMode"
            class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"
          >
            <span class="hidden sm:inline">{{ t("Tree.SelectedCount", { count: checkedCount }) }}</span>
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-play"
              :disabled="checkedCount === 0"
              class="h-6 rounded-sm px-2"
              :label="t('Tree.OpenSelected')"
              @click="openCheckedAssets"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              class="size-6 justify-center rounded-sm p-0"
              :aria-label="t('Common.Cancel')"
              @click="closeBatchMode"
            />
          </div>
          <div v-else class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <UTooltip :text="treeSwitchLabel" :delay-duration="150">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                :icon="activeTreeKind === 'authorization' ? 'i-lucide-list-tree' : 'i-lucide-shield-check'"
                class="size-6 justify-center rounded-sm p-0"
                :aria-label="treeSwitchLabel"
                @click="switchTreeKind"
              />
            </UTooltip>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              class="size-6 justify-center rounded-sm p-0"
              :aria-label="t('ToolTips.Refresh')"
              @click="loadRoot(activeTreeKind)"
            />
            <UDropdownMenu
              :items="batchMenuItems"
              :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
              :ui="{ content: 'w-36 p-1' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-ellipsis"
                class="size-6 justify-center rounded-sm p-0"
                :aria-label="t('Tree.OpenMultiple')"
              />
            </UDropdownMenu>
          </div>
        </div>

        <div v-if="open !== false" class="min-h-0 flex-1 overflow-y-auto py-1">
          <div v-if="loading && activeTree.nodes.length === 0" class="grid h-20 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
          </div>
          <UEmpty v-else-if="activeTree.nodes.length === 0" icon="mingcute:inbox-line" size="sm" variant="naked" :title="t('Common.NoData')" />
          <SideBarAssetTreeNode
            v-for="node in activeTree.nodes"
            v-else
            :key="`${activeTreeKind}-${node.id}`"
            :node="node"
            :tree-kind="activeTreeKind"
            :batch-mode="batchMode"
            :checked-asset-ids="checkedNodeIds"
            @select="selectNode"
            @toggle="toggleNode"
            @contextmenu="openContextMenu"
            @check="toggleCheckedNode"
          />
        </div>
      </section>
    </template>
  </div>
</template>
