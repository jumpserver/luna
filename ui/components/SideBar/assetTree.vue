<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AssetItem, AssetTreeKind, AssetTreeNode } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = defineProps<{
  search: string;
  open?: boolean;
}>();

const emit = defineEmits<{
  select: [asset: AssetItem];
  contextmenu: [asset: AssetItem, event: MouseEvent];
  toggle: [];
  openMultiple: [assets: AssetItem[]];
}>();

type PanelKind = Exclude<AssetTreeKind, "search">;

const RECENT_NODE_ID = "__recent_connections__";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const userInfoStore = useUserInfoStore();
const { loggedIn, orgId } = storeToRefs(userInfoStore);
const { fetchTree, treeNodeToAsset } = useAssetTree();
const { clearRecentConnections, recentConnections, load: loadRecentConnections } = useRecentConnections();
const activeTreeKind = ref<PanelKind>("authorization");
const recentNodeOpen = ref(false);
const authorizationNodes = ref<AssetTreeNode[]>([]);
const typeNodes = ref<AssetTreeNode[]>([]);
const searchNodes = ref<AssetTreeNode[]>([]);
const loading = ref(false);
const searchLoading = ref(false);
const batchMode = ref(false);
const checkedAssets = ref<Record<string, AssetItem>>({});
const checkedNodeIds = ref<string[]>([]);
const nodeMenuVisible = ref(false);
const nodeMenuPosition = ref({ x: 0, y: 0 });
const nodeMenuTarget = ref<{ node: AssetTreeNode; kind: PanelKind } | null>(null);
let lastErrorSignature = "";
let lastErrorAt = 0;

const activeTree = computed(() => {
  if (activeTreeKind.value === "authorization") {
    return {
      label: t("Menu.AuthorizedTree"),
      nodes: [buildRecentConnectionsNode(), ...authorizationNodes.value]
    };
  }

  return { label: t("Menu.TypeTree"), nodes: typeNodes.value };
});

const isRecentRootNode = (node: AssetTreeNode) => node.id === RECENT_NODE_ID;

const assetItemToTreeNode = (asset: AssetItem, level: number): AssetTreeNode => ({
  id: `recent-${asset.id}`,
  key: asset.id,
  name: asset.name,
  title: asset.address,
  level,
  meta: {
    data: {
      id: asset.id,
      name: asset.name,
      address: asset.address,
      platform: asset.platform,
      zone: asset.zone,
      category: asset.category,
      type: asset.type,
      is_active: asset.isActive !== false,
      comment: asset.comment,
      permedProtocols: asset.permedProtocols,
      permedAccounts: asset.permedAccounts
    }
  }
});

function buildRecentConnectionsNode(): AssetTreeNode {
  return {
    id: RECENT_NODE_ID,
    key: RECENT_NODE_ID,
    name: t("Menu.RecentConnections"),
    isParent: true,
    open: recentNodeOpen.value,
    loaded: true,
    level: 0,
    children: recentConnections.value.map((asset) => assetItemToTreeNode(asset, 1)),
    meta: { type: "recent-connections" }
  };
}

const treeSwitchLabel = computed(() =>
  activeTreeKind.value === "authorization" ? t("Tree.SwitchToType") : t("Tree.SwitchToAuthorization")
);
const checkedCount = computed(() => Object.keys(checkedAssets.value).length);
const batchMenuItems = computed(() => [
  [
    {
      label: t("Tree.OpenMultiple"),
      icon: "i-lucide-list-checks",
      onSelect: () => {
        batchMode.value = true;
        checkedAssets.value = {};
        checkedNodeIds.value = [];
      }
    }
  ]
]);

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

const removeFavoriteNodes = (nodes: AssetTreeNode[]): AssetTreeNode[] =>
  nodes
    .filter((node) => node.id.toLowerCase() !== "favorite" && node.key?.toLowerCase() !== "favorite")
    .map((node) => ({
      ...node,
      children: node.children?.length ? removeFavoriteNodes(node.children) : node.children
    }));

const reportError = (error: unknown) => {
  const title = t("Asset.GetAssetFailed");
  const description = error instanceof Error ? error.message : String(error);
  const signature = `${title}::${description}`;
  const now = Date.now();

  if (signature === lastErrorSignature && now - lastErrorAt < 1500) {
    return;
  }

  lastErrorSignature = signature;
  lastErrorAt = now;

  addErrorToast({
    title,
    description,
    icon: "i-lucide-circle-alert"
  });
};

const loadRoot = async (kind: PanelKind) => {
  if (!loggedIn.value) return;
  if (kind === "authorization") loadRecentConnections();
  loading.value = true;
  try {
    const nodes = await fetchTree(kind);
    if (kind === "authorization") {
      const roots = removeFavoriteNodes(nodes);
      authorizationNodes.value = roots;

      // The authorization API commonly returns one synthetic root. Showing
      // only that node makes the tree look empty, so reveal its first level.
      await Promise.all(
        roots
          .filter((node) => node.isParent || node.children?.length)
          .map(async (node) => {
            if (!node.open) await toggleNode(node, kind);
          })
      );
    } else {
      typeNodes.value = unwrapAllTypesRoot(nodes);
    }
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
  loadRecentConnections();
  await Promise.all([loadRoot("authorization"), loadRoot("type")]);
};

const switchTreeKind = () => {
  activeTreeKind.value = activeTreeKind.value === "authorization" ? "type" : "authorization";
  checkedAssets.value = {};
  checkedNodeIds.value = [];
  batchMode.value = false;
};

async function toggleNode(node: AssetTreeNode, kind: PanelKind) {
  if (isRecentRootNode(node)) {
    recentNodeOpen.value = !recentNodeOpen.value;
    if (recentNodeOpen.value) loadRecentConnections();
    return;
  }

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
}

const isBranchNode = (node: AssetTreeNode) => Boolean(node.isParent || node.children?.length);

const collapseNode = (node: AssetTreeNode) => {
  if (isRecentRootNode(node)) {
    recentNodeOpen.value = false;
    return;
  }

  node.open = false;
};

const collapseNodeRecursive = (node: AssetTreeNode) => {
  if (isRecentRootNode(node)) {
    recentNodeOpen.value = false;
    return;
  }

  node.open = false;
  for (const child of node.children || []) {
    collapseNodeRecursive(child);
  }
};

const nodeHasClosedBranch = (node: AssetTreeNode): boolean => {
  if (isRecentRootNode(node)) return !recentNodeOpen.value;
  if (!isBranchNode(node)) return false;
  if (!node.open || !node.loaded) return true;
  return (node.children || []).some((child) => nodeHasClosedBranch(child));
};

const nodeHasOpenBranch = (node: AssetTreeNode): boolean => {
  if (isRecentRootNode(node)) return recentNodeOpen.value;
  if (!isBranchNode(node)) return false;
  if (node.open) return true;
  return (node.children || []).some((child) => nodeHasOpenBranch(child));
};

const expandNodeRecursive = async (node: AssetTreeNode, kind: PanelKind) => {
  if (isRecentRootNode(node)) {
    recentNodeOpen.value = true;
    loadRecentConnections();
    return;
  }

  if (!isBranchNode(node)) return;

  if (!node.open || !node.loaded) {
    await toggleNode(node, kind);
  }

  for (const child of node.children || []) {
    await expandNodeRecursive(child, kind);
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
  if (node.chkDisabled) return;

  if (isBranchNode(node)) {
    event.preventDefault();
    event.stopPropagation();
    nodeMenuTarget.value = { node, kind: activeTreeKind.value };
    nodeMenuPosition.value = { x: event.clientX, y: event.clientY };
    nodeMenuVisible.value = true;
    return;
  }

  emit("contextmenu", treeNodeToAsset(node), event);
};

const closeNodeMenu = () => {
  nodeMenuVisible.value = false;
  nodeMenuTarget.value = null;
};

const nodeMenuItems = computed<DropdownMenuItem[]>(() => {
  const target = nodeMenuTarget.value;
  if (!target) return [];

  const { node, kind } = target;
  const canExpand = !node.open;
  const canCollapse = !!node.open;
  const canExpandAll = nodeHasClosedBranch(node);
  const canCollapseAll = nodeHasOpenBranch(node);

  return [
    ...(canExpand
      ? [
          {
            label: t("Tree.Expand"),
            icon: "i-lucide-chevron-right",
            onSelect: async () => {
              closeNodeMenu();
              await toggleNode(node, kind);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canCollapse
      ? [
          {
            label: t("Tree.Collapse"),
            icon: "i-lucide-chevron-down",
            onSelect: () => {
              closeNodeMenu();
              collapseNode(node);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canExpandAll
      ? [
          {
            label: t("Tree.ExpandAll"),
            icon: "i-lucide-chevrons-down",
            onSelect: async () => {
              closeNodeMenu();
              await expandNodeRecursive(node, kind);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canCollapseAll
      ? [
          {
            label: t("Tree.CollapseAll"),
            icon: "i-lucide-chevrons-up",
            onSelect: () => {
              closeNodeMenu();
              collapseNodeRecursive(node);
            }
          } satisfies DropdownMenuItem
        ]
      : [])
  ];
});

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

watch(
  () => props.search,
  (value) => searchTree(value)
);
watch(
  () => props.search,
  (value) => {
    if (value.trim()) {
      closeBatchMode();
      closeNodeMenu();
    }
  }
);
watch(
  [loggedIn, orgId],
  ([isLoggedIn]) => {
    if (isLoggedIn) {
      refresh();
    } else {
      authorizationNodes.value = [];
      typeNodes.value = [];
      searchNodes.value = [];
      closeBatchMode();
      closeNodeMenu();
    }
  },
  { immediate: true }
);

defineExpose({ refresh, loading });
</script>

<template>
  <div
    class="flex min-h-8 flex-col"
    :class="open === false ? 'h-8 shrink-0' : 'min-h-0 flex-1'"
    role="tree"
    :aria-label="t('Menu.Resource')"
  >
    <div
      v-if="!loggedIn"
      class="grid min-h-0 flex-1 place-items-center px-2.5 text-xs text-gray-500 dark:text-gray-400"
    >
      请先登录
    </div>

    <template v-else-if="search.trim()">
      <div
        class="flex h-8 shrink-0 items-center border-b border-gray-200 px-2.5 text-xs font-medium dark:border-white/10"
      >
        <UIcon name="i-lucide-search" class="mr-1.5 sidebar-icon" />
        <span class="truncate">{{ t("Operation.Search") }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto py-0">
        <div v-if="searchLoading" class="grid h-20 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
        </div>
        <UEmpty
          v-else-if="searchNodes.length === 0"
          icon="mingcute:inbox-line"
          size="sm"
          variant="naked"
          :title="t('Common.NoData')"
        />
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
      <section class="group flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="flex h-8 w-full shrink-0 items-center gap-1 px-2.5 text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
            :aria-expanded="open !== false"
            @click="emit('toggle')"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="sidebar-icon transition-transform duration-150"
              :class="open === false ? '' : 'rotate-90'"
            />
            <span class="min-w-0 flex-1 truncate">{{ activeTree.label }}</span>
          </button>
          <div v-if="batchMode" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span class="hidden sm:inline">{{ t("Tree.SelectedCount", { count: checkedCount }) }}</span>
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-play"
              :disabled="checkedCount === 0"
              class="h-6 rounded-sm px-2"
              :ui="{ leadingIcon: 'sidebar-icon' }"
              :label="t('Tree.OpenSelected')"
              @click="openCheckedAssets"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              class="sidebar-icon-button size-6 justify-center p-0"
              :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
              :aria-label="t('Common.Cancel')"
              @click="closeBatchMode"
            />
          </div>
          <div
            v-else
            class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <UTooltip :text="treeSwitchLabel" :delay-duration="150">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                :icon="activeTreeKind === 'authorization' ? 'i-lucide-list-tree' : 'i-lucide-shield-check'"
                class="sidebar-icon-button size-6 justify-center p-0"
                :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
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
              class="sidebar-icon-button size-6 justify-center p-0"
              :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
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
                class="sidebar-icon-button size-6 justify-center p-0"
                :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                :aria-label="t('Tree.OpenMultiple')"
              />
            </UDropdownMenu>
          </div>
        </div>

        <div v-if="open !== false" class="min-h-0 flex-1 overflow-y-auto py-0">
          <div v-if="loading && activeTree.nodes.length === 0" class="grid h-20 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
          </div>
          <UEmpty
            v-else-if="activeTree.nodes.length === 0"
            icon="mingcute:inbox-line"
            size="sm"
            variant="naked"
            :title="t('Common.NoData')"
          />
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
            @clear-recent="clearRecentConnections"
          />
        </div>
      </section>
    </template>
  </div>

  <UDropdownMenu
    :open="nodeMenuVisible"
    :items="nodeMenuItems"
    size="sm"
    :content="{ align: 'start', side: 'bottom' }"
    @update:open="nodeMenuVisible = $event"
  >
    <div
      class="fixed pointer-events-none"
      :style="{
        left: `${nodeMenuPosition.x}px`,
        top: `${nodeMenuPosition.y}px`,
        width: '1px',
        height: '1px'
      }"
    />
  </UDropdownMenu>
</template>
