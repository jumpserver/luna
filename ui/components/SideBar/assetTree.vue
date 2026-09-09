<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { WorkspaceUiAssetCandidate } from "~/composables/useWorkspaceUiAutomation";
import type { AssetItem, AssetTreeKind, AssetTreeNode } from "~/types";
import {
  applyAssetRename,
  authorizationTreeMetricId,
  hasAssetName,
  registerAssetNameLookup,
  useAssetTree,
  useAssetTreeSearch
} from "~/composables/useAssetTree";
import { workspaceTourArmed, workspaceTourCompleted } from "~/composables/useWorkspaceTour";
import { toWorkspaceUiAssetCandidate } from "~/composables/useWorkspaceUiAutomation";
import { useUserInfoStore } from "~/store/modules/userInfo";
import {
  authorizationTreeHasLoadedNodes,
  buildWorkspaceTourDemoTree,
  isWorkspaceTourDemoNode,
  shouldShowWorkspaceTourDemoTree
} from "~/utils/workspaceTour";

const props = defineProps<{
  search: string;
  open?: boolean;
  hideHeader?: boolean;
}>();

const emit = defineEmits<{
  select: [asset: AssetItem];
  contextmenu: [asset: AssetItem, event: MouseEvent];
  toggle: [];
  openMultiple: [assets: AssetItem[]];
  favoriteMultiple: [assets: AssetItem[], folderId: string | null];
}>();

type PanelKind = Exclude<AssetTreeKind, "search">;
type BatchAction = "open" | "favorite";

const RECENT_NODE_ID = "__recent_connections__";

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const userInfoStore = useUserInfoStore();
const { currentAccountId, currentSite, currentUser, loggedIn, orgId } = storeToRefs(userInfoStore);
const { fetchAuthorizationTreeMetrics, fetchAuthorizationTreePage, fetchTree, fetchTypeTreePage, treeNodeToAsset } =
  useAssetTree();
const {
  clearRecentConnections,
  recentConnections,
  load: loadRecentConnections,
  renameRecentConnection
} = useRecentConnections();
const workspaceUiAutomationHost = useWorkspaceUiAutomationHost();
const {
  currentCommand: workspaceUiCommand,
  focusedAsset: workspaceFocusedAsset,
  rejectCommand: rejectWorkspaceUiCommand,
  reportFocusedAsset: reportWorkspaceFocusedAsset,
  reportSearchResults: reportWorkspaceSearchResults,
  searchQuery: workspaceSearchQuery
} = workspaceUiAutomationHost;
const activeTreeKind = ref<PanelKind>("authorization");
const recentNodeOpen = ref(false);
const authorizationNodes = ref<AssetTreeNode[]>([]);
const typeNodes = ref<AssetTreeNode[]>([]);
registerAssetNameLookup(
  (name, excludeId) =>
    hasAssetName(authorizationNodes.value, name, excludeId) || hasAssetName(typeNodes.value, name, excludeId)
);
const loading = ref(false);
const authorizationLoaded = ref(false);
const tourDemoNodes = ref<AssetTreeNode[]>([]);
const batchMode = ref(false);
const batchAction = ref<BatchAction>("open");
const batchFavoriteMenuOpen = ref(false);
const checkedAssets = ref<Record<string, AssetItem>>({});
const checkedNodeIds = ref<string[]>([]);
const nodeMenuVisible = ref(false);
const nodeMenuPosition = ref({ x: 0, y: 0 });
const nodeMenuTarget = ref<{ node: AssetTreeNode; kind: PanelKind } | null>(null);
const treeScrollRef = useTemplateRef<HTMLElement>("treeScroll");
let treeRequestEpoch = 0;
let lastErrorSignature = "";
let lastErrorAt = 0;
let autoPageLoadFrame: number | null = null;

const showTourDemoTree = computed(() =>
  shouldShowWorkspaceTourDemoTree({
    authorizationLoaded: authorizationLoaded.value,
    hasLoadedNodes: authorizationTreeHasLoadedNodes(authorizationNodes.value),
    tourCompleted: workspaceTourCompleted.value,
    tourArmed: workspaceTourArmed.value
  })
);

const activeTree = computed(() => {
  if (activeTreeKind.value === "authorization") {
    return {
      label: t("Menu.AuthorizedTree"),
      nodes: [buildRecentConnectionsNode(), ...tourDemoNodes.value, ...authorizationNodes.value]
    };
  }

  return { label: t("Menu.TypeTree"), nodes: typeNodes.value };
});

// Recent connections is always prepended, so the tree is never "empty" while
// Default and other first-level nodes are still in flight. Keep the spinner
// until that first paint can include them.
const showTreeLoading = computed(() => {
  if (activeTreeKind.value === "authorization") return !authorizationLoaded.value;
  return loading.value && typeNodes.value.length === 0;
});

watch(
  showTourDemoTree,
  (show) => {
    if (show) {
      if (tourDemoNodes.value.length === 0) tourDemoNodes.value = buildWorkspaceTourDemoTree((key) => t(key));
      return;
    }
    tourDemoNodes.value = [];
  },
  { immediate: true }
);

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
      org_id: asset.org_id,
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
const { folders: favoriteFolders, rootAssets: favoriteRootAssets, load: loadFavoriteFolders } = useFavoriteFolders();
const favoriteRootAssetCount = computed(() =>
  getFavoriteRootAssetCount(favoriteFolders.value, favoriteRootAssets.value)
);
const batchFavoriteFolderMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("Favorite.All"),
    type: "label",
    favoriteFolderTree: true,
    favoriteFolders: favoriteFolders.value,
    favoriteRootAssetCount: favoriteRootAssetCount.value,
    class: "w-max min-w-full p-0",
    ui: {
      itemWrapper: "w-full min-w-max overflow-visible",
      itemLabel: "w-full overflow-visible"
    }
  }
]);
const startBatchMode = (action: BatchAction) => {
  batchAction.value = action;
  batchMode.value = true;
  batchFavoriteMenuOpen.value = false;
  checkedAssets.value = {};
  checkedNodeIds.value = [];
};
const batchMenuItems = computed(() => [
  [
    {
      label: t("Tree.OpenMultiple"),
      icon: "i-lucide-list-checks",
      onSelect: () => startBatchMode("open")
    },
    {
      label: t("Tree.FavoriteMultiple"),
      icon: "i-lucide-star",
      onSelect: () => startBatchMode("favorite")
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

const loadAuthorizationNodeCounts = async (nodes: AssetTreeNode[]) => {
  const pendingNodes: AssetTreeNode[] = [];
  const visit = (items: AssetTreeNode[]) => {
    for (const node of items) {
      if ((node.meta?.type === "node" || node.isParent) && node.assetCount == null && !node.assetCountLoading) {
        pendingNodes.push(node);
      }
      if (node.children?.length) visit(node.children);
    }
  };
  visit(nodes);
  if (!pendingNodes.length) return;

  pendingNodes.forEach((node) => {
    node.assetCountLoading = true;
  });
  try {
    const counts = await fetchAuthorizationTreeMetrics(pendingNodes);
    pendingNodes.forEach((node) => {
      const id = authorizationTreeMetricId(node);
      if (counts.has(id)) node.assetCount = counts.get(id)!;
    });
  } catch (error) {
    console.warn("Failed to load authorization tree metrics", error);
  } finally {
    pendingNodes.forEach((node) => {
      node.assetCountLoading = false;
    });
  }
};

const loadRoot = async (kind: PanelKind, requestEpoch: number) => {
  if (!loggedIn.value) return;
  if (kind === "authorization") {
    loadRecentConnections();
    authorizationLoaded.value = false;
  }
  loading.value = true;
  try {
    const rootPage = kind === "authorization" ? await fetchAuthorizationTreePage() : null;
    const nodes = rootPage?.nodes || (await fetchTree(kind));
    if (requestEpoch !== treeRequestEpoch) return;
    if (kind === "authorization") {
      authorizationNodes.value = removeFavoriteNodes(nodes);
      const roots = authorizationNodes.value;
      void loadAuthorizationNodeCounts(roots);

      // A concrete organization opens only its organization root. Global
      // organization and special branches such as Ungrouped stay collapsed.
      if (!currentUser.value?.org?.is_root) {
        await Promise.all(
          roots
            .filter((node) => node.meta?.data?.is_root === true)
            .map(async (node) => {
              if (!node.open) await toggleNode(node, kind);
            })
        );
      }
    } else {
      typeNodes.value = unwrapAllTypesRoot(nodes);
    }
  } catch (error) {
    if (requestEpoch === treeRequestEpoch) reportError(error);
  } finally {
    if (requestEpoch === treeRequestEpoch) {
      loading.value = false;
      if (kind === "authorization") authorizationLoaded.value = true;
    }
  }
};

const refresh = async () => {
  treeRequestEpoch += 1;
  const requestEpoch = treeRequestEpoch;
  checkedAssets.value = {};
  checkedNodeIds.value = [];
  loadRecentConnections();
  await Promise.all([loadRoot("authorization", requestEpoch), loadRoot("type", requestEpoch)]);
};

const reloadRoot = (kind: PanelKind) => {
  treeRequestEpoch += 1;
  void loadRoot(kind, treeRequestEpoch);
};

const switchTreeKind = () => {
  activeTreeKind.value = activeTreeKind.value === "authorization" ? "type" : "authorization";
  checkedAssets.value = {};
  checkedNodeIds.value = [];
  batchMode.value = false;
};

async function toggleNode(node: AssetTreeNode, kind: PanelKind) {
  if (isWorkspaceTourDemoNode(node.id)) {
    node.open = !node.open;
    return;
  }

  if (isRecentRootNode(node)) {
    recentNodeOpen.value = !recentNodeOpen.value;
    if (recentNodeOpen.value) loadRecentConnections();
    return;
  }

  if (node.open) {
    node.open = false;
    return;
  }

  if (!node.loaded) {
    if (node.loading) return;
    node.loading = true;
    try {
      if (kind === "authorization") {
        const page = await fetchAuthorizationTreePage(node);
        node.children = removeFavoriteNodes(page.nodes);
        updateNodePagination(node, page.nextPage, node.children.length);
        void loadAuthorizationNodeCounts(node.children);
      } else {
        const page = await fetchTypeTreePage(node);
        node.children = page.nodes;
        updateNodePagination(node, page.nextPage, node.children.length);
      }
      node.loaded = true;
    } catch (error) {
      reportError(error);
      return;
    } finally {
      node.loading = false;
    }
  }

  node.open = true;
  await nextTick();
  scheduleAutoPageLoad();
}

function updateNodePagination(node: AssetTreeNode, nextPage: AssetTreeNode["nextPage"], appendedCount: number) {
  node.nextPage = nextPage;
  if (!nextPage) {
    node.nextPageTriggerIndex = undefined;
    return;
  }

  const total = node.children?.length || 0;
  node.nextPageTriggerIndex = Math.max(1, total - Math.floor(appendedCount / 2));
}

async function loadMoreNode(node: AssetTreeNode, kind: PanelKind) {
  if (!node.nextPage || node.loadingMore) return;
  node.loadingMore = true;
  let loaded = false;
  try {
    const page =
      kind === "authorization"
        ? await fetchAuthorizationTreePage(node, node.nextPage)
        : await fetchTypeTreePage(node, node.nextPage);
    const knownIds = new Set((node.children || []).map((child) => child.id));
    const pageNodes = kind === "authorization" ? removeFavoriteNodes(page.nodes) : page.nodes;
    const appended = pageNodes.filter((child) => !knownIds.has(child.id));
    const previousLength = node.children?.length || 0;
    node.children = [...(node.children || []), ...appended];
    updateNodePagination(node, page.nextPage, appended.length);
    if (kind === "authorization") {
      // Read the inserted rows back through Vue's reactive array before
      // writing metrics. Mutating the raw response objects would not repaint.
      void loadAuthorizationNodeCounts((node.children || []).slice(previousLength));
    }
    loaded = true;
  } catch (error) {
    reportError(error);
  } finally {
    node.loadingMore = false;
  }
  if (loaded) {
    await nextTick();
    scheduleAutoPageLoad();
  }
}

const collectExpandedTreeRows = (nodes: AssetTreeNode[]) => {
  const rows: AssetTreeNode[] = [];
  const visit = (items: AssetTreeNode[]) => {
    for (const node of items) {
      rows.push(node);
      if (node.open && node.children?.length) visit(node.children);
    }
  };
  visit(nodes);
  return rows;
};

const maybeLoadNextTreePage = (scrollElement: HTMLElement) => {
  const rows = collectExpandedTreeRows(activeTree.value.nodes);
  if (!rows.length) return;

  const rowIndexes = new Map(rows.map((node, index) => [node, index]));
  const measuredRow = scrollElement.querySelector<HTMLElement>(".app-tree-row");
  const rowHeight = measuredRow?.getBoundingClientRect().height || 26;
  const lastVisibleIndex = Math.ceil((scrollElement.scrollTop + scrollElement.clientHeight) / rowHeight);
  const candidate = rows
    .filter((node) => node.open && node.nextPage && !node.loadingMore)
    .map((node) => {
      const children = node.children || [];
      const triggerIndex = Math.min(node.nextPageTriggerIndex || children.length, children.length);
      const triggerNode = children[triggerIndex - 1];
      return { node, rowIndex: rowIndexes.get(triggerNode || node) ?? Number.POSITIVE_INFINITY };
    })
    .filter(({ rowIndex }) => rowIndex <= lastVisibleIndex)
    .sort((left, right) => left.rowIndex - right.rowIndex)[0];

  if (candidate) void loadMoreNode(candidate.node, activeTreeKind.value);
};

function scheduleAutoPageLoad(scrollElement = treeScrollRef.value) {
  if (!scrollElement || typeof window === "undefined" || autoPageLoadFrame != null) return;
  autoPageLoadFrame = window.requestAnimationFrame(() => {
    autoPageLoadFrame = null;
    maybeLoadNextTreePage(scrollElement);
  });
}

const handleTreeScroll = (event: Event) => {
  scheduleAutoPageLoad(event.currentTarget as HTMLElement);
};

const isBranchNode = (node: AssetTreeNode) => Boolean(node.isParent || node.children?.length);

const assetIdForNode = (node: AssetTreeNode) =>
  String(node.meta?.data?.id || node.key || (isRecentRootNode(node) ? "" : node.id));

const findAssetNode = (nodes: AssetTreeNode[], assetId: string): AssetTreeNode | null => {
  for (const node of nodes) {
    if (!isBranchNode(node) && assetIdForNode(node) === assetId) return node;
    const child = findAssetNode(node.children || [], assetId);
    if (child) return child;
  }
  return null;
};

const collectAssetCandidates = (nodes: AssetTreeNode[]) => {
  const candidates = new Map<string, WorkspaceUiAssetCandidate>();

  const visit = (items: AssetTreeNode[]) => {
    for (const node of items) {
      if (!isBranchNode(node) && !node.chkDisabled && !isWorkspaceTourDemoNode(node.id)) {
        const candidate = toWorkspaceUiAssetCandidate(treeNodeToAsset(node));
        if (candidate.id) candidates.set(candidate.id, candidate);
      }
      if (node.children?.length) visit(node.children);
    }
  };

  visit(nodes);
  return [...candidates.values()];
};

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

const expandNodeRecursive = async (node: AssetTreeNode, kind: PanelKind) => {
  if (isWorkspaceTourDemoNode(node.id)) {
    node.open = true;
    return;
  }

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
  if (node.chkDisabled || isWorkspaceTourDemoNode(node.id)) return;
  const asset = treeNodeToAsset(node);
  const selectionOnly = reportWorkspaceFocusedAsset(asset, { source: "user" });
  if (!selectionOnly) emit("select", asset);
};

const toggleCheckedNode = (node: AssetTreeNode) => {
  if (node.chkDisabled || node.isParent || isWorkspaceTourDemoNode(node.id)) return;

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
  batchFavoriteMenuOpen.value = false;
  checkedAssets.value = {};
  checkedNodeIds.value = [];
};

const submitCheckedAssets = () => {
  const assets = Object.values(checkedAssets.value);
  if (assets.length === 0 || batchAction.value === "favorite") return;

  emit("openMultiple", assets);
  closeBatchMode();
};

const updateBatchFavoriteMenuOpen = (open: boolean) => {
  batchFavoriteMenuOpen.value = open;
  if (open) void loadFavoriteFolders();
};

const submitCheckedFavoriteAssets = (folderId: string | null) => {
  const assets = Object.values(checkedAssets.value);
  if (assets.length === 0) return;

  emit("favoriteMultiple", assets, folderId);
  closeBatchMode();
};

const openContextMenu = (node: AssetTreeNode, event: MouseEvent) => {
  if (node.chkDisabled || isWorkspaceTourDemoNode(node.id)) return;

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
  const canCollapseAll = canCollapse;

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

const {
  nodes: searchNodes,
  loading: searchLoading,
  completedQuery: completedSearchQuery
} = useAssetTreeSearch(() => props.search, {
  onResults(query, nodes) {
    reportWorkspaceSearchResults(query, collectAssetCandidates(nodes));
    respondToWorkspaceUiCommand();
  },
  onError(query, error) {
    reportError(error);
    const command = workspaceUiCommand.value;
    if (command?.status === "pending" && command.type === "set-search" && command.query === query) {
      rejectWorkspaceUiCommand(command.id, "search_failed", error instanceof Error ? error.message : String(error));
    }
  }
});

function respondToWorkspaceUiCommand() {
  const command = workspaceUiCommand.value;
  if (!command || command.status !== "pending") return;

  const query = props.search.trim();
  if (command.type === "set-search") {
    if (!query || query !== command.query || completedSearchQuery.value !== query) return;
    reportWorkspaceSearchResults(query, collectAssetCandidates(searchNodes.value));
    return;
  }

  if (command.type !== "focus-asset" || !command.assetId) return;
  const nodes = query ? searchNodes.value : activeTree.value.nodes;
  const node = findAssetNode(nodes, command.assetId);
  if (node) {
    reportWorkspaceFocusedAsset(treeNodeToAsset(node), {
      commandId: command.id,
      source: "automation"
    });
    return;
  }

  if (query && completedSearchQuery.value === query && query === workspaceSearchQuery.value) {
    rejectWorkspaceUiCommand(command.id, "asset_not_found", `Asset ${command.assetId} is not in the current search`);
  }
}

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
  [loggedIn, orgId, currentSite, currentAccountId, () => Boolean(props.search.trim())],
  ([isLoggedIn]) => {
    authorizationNodes.value = [];
    typeNodes.value = [];
    authorizationLoaded.value = false;
    tourDemoNodes.value = [];
    closeBatchMode();
    closeNodeMenu();
    if (isLoggedIn && !props.search.trim()) {
      refresh();
    } else {
      treeRequestEpoch += 1;
      loading.value = false;
    }
  },
  { immediate: true }
);

watch(workspaceUiCommand, respondToWorkspaceUiCommand, { immediate: true });

onBeforeUnmount(() => {
  if (autoPageLoadFrame != null) window.cancelAnimationFrame(autoPageLoadFrame);
});

useEventBus().on("assetRenamed", ({ assetId, name }) => {
  applyAssetRename(authorizationNodes.value, assetId, name);
  applyAssetRename(typeNodes.value, assetId, name);
  applyAssetRename(searchNodes.value, assetId, name);
  renameRecentConnection(assetId, name);
  const checked = checkedAssets.value[assetId];
  if (checked) checkedAssets.value[assetId] = { ...checked, name };
});

defineExpose({
  refresh,
  loading,
  switchTreeKind,
  activeTreeKind,
  treeSwitchLabel,
  batchMenuItems
});
</script>

<template>
  <div
    class="app-tree flex min-h-8 flex-col"
    :class="open === false && !hideHeader ? 'h-8 shrink-0' : 'min-h-0 flex-1'"
    role="tree"
    :aria-label="t('Menu.Resource')"
    :data-workspace-tour="search.trim() ? undefined : 'assets'"
  >
    <div
      v-if="!loggedIn"
      class="grid min-h-0 flex-1 place-items-center px-2.5 text-xs text-gray-500 dark:text-gray-400"
    >
      请先登录
    </div>

    <template v-else-if="search.trim()">
      <div
        class="flex h-8 shrink-0 items-center border-b border-gray-200 px-2.5 text-sm font-medium dark:border-white/10"
      >
        <UIcon name="i-lucide-search" class="mr-1.5 sidebar-icon" />
        <span class="truncate">{{ t("Operation.Search") }}</span>
      </div>
      <div class="sidebar-tree-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto py-0">
        <Transition appear name="tree-appear" mode="out-in">
          <div v-if="searchLoading" key="search-loading" class="grid h-20 place-items-center">
            <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
          </div>
          <div v-else-if="searchNodes.length === 0" key="search-empty">
            <UEmpty icon="mingcute:inbox-line" size="sm" variant="naked" :title="t('Common.NoData')" />
          </div>
          <div v-else key="search-nodes">
            <SideBarAssetTreeNode
              v-for="node in searchNodes"
              :key="`search-${node.id}`"
              :node="node"
              tree-kind="authorization"
              :focused-asset-id="workspaceFocusedAsset?.id"
              search-mode
              @select="selectNode"
              @contextmenu="openContextMenu"
            />
          </div>
        </Transition>
      </div>
    </template>

    <template v-else>
      <section class="app-tree-panel group min-h-0 flex-1" :class="hideHeader || open !== false ? 'is-open' : ''">
        <div
          v-if="!hideHeader || batchMode"
          class="flex h-8 w-full shrink-0 items-center gap-1 px-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          <button
            v-if="!hideHeader"
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
            :aria-expanded="open !== false"
            @click="emit('toggle')"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="sidebar-icon transition-transform duration-200 ease-out motion-reduce:transition-none"
              :class="open === false ? '' : 'rotate-90'"
            />
            <span class="min-w-0 flex-1 truncate">{{ activeTree.label }}</span>
          </button>
          <div v-else class="min-w-0 flex-1" />
          <div v-if="batchMode" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span class="hidden sm:inline">{{ t("Tree.SelectedCount", { count: checkedCount }) }}</span>
            <UDropdownMenu
              v-if="batchAction === 'favorite'"
              :open="batchFavoriteMenuOpen"
              :items="batchFavoriteFolderMenuItems"
              size="sm"
              :content="{ align: 'start', side: 'right', sideOffset: 6 }"
              :ui="{ content: 'favorite-folder-submenu w-72 max-h-[70vh] p-0' }"
              @update:open="updateBatchFavoriteMenuOpen"
            >
              <UButton
                color="primary"
                variant="soft"
                size="xs"
                icon="i-lucide-star"
                :disabled="checkedCount === 0"
                class="h-6 rounded-sm px-2"
                :ui="{ leadingIcon: 'sidebar-icon' }"
                :label="t('Tree.FavoriteSelected')"
              />
              <template #item-label="{ item }">
                <SideBarFavoriteFolderMenuTree
                  v-if="item.favoriteFolderTree"
                  :folders="item.favoriteFolders"
                  :root-asset-count="item.favoriteRootAssetCount"
                  @select="submitCheckedFavoriteAssets"
                />
                <template v-else>{{ item.label }}</template>
              </template>
            </UDropdownMenu>
            <UButton
              v-else
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-play"
              :disabled="checkedCount === 0"
              class="h-6 rounded-sm px-2"
              :ui="{ leadingIcon: 'sidebar-icon' }"
              :label="t('Tree.OpenSelected')"
              @click="submitCheckedAssets"
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
                :icon="activeTreeKind === 'authorization' ? 'i-lucide-shapes' : 'i-lucide-folder-tree'"
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
              @click="reloadRoot(activeTreeKind)"
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
                :aria-label="t('Tree.BatchActions')"
              />
            </UDropdownMenu>
          </div>
        </div>

        <div class="app-tree-panel__body">
          <div
            ref="treeScroll"
            class="sidebar-tree-scroll h-full overflow-x-auto overflow-y-auto py-0"
            @scroll.passive="handleTreeScroll"
          >
            <Transition appear name="tree-appear" mode="out-in">
              <div v-if="showTreeLoading" key="tree-loading" class="grid h-20 place-items-center">
                <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
              </div>
              <div v-else-if="activeTree.nodes.length === 0" key="tree-empty">
                <UEmpty icon="mingcute:inbox-line" size="sm" variant="naked" :title="t('Common.NoData')" />
              </div>
              <div v-else :key="`tree-${activeTreeKind}`">
                <SideBarAssetTreeNode
                  v-for="node in activeTree.nodes"
                  :key="`${activeTreeKind}-${node.id}`"
                  :node="node"
                  :tree-kind="activeTreeKind"
                  :focused-asset-id="workspaceFocusedAsset?.id"
                  :batch-mode="batchMode"
                  :checked-asset-ids="checkedNodeIds"
                  @select="selectNode"
                  @toggle="toggleNode"
                  @contextmenu="openContextMenu"
                  @check="toggleCheckedNode"
                  @clear-recent="clearRecentConnections"
                />
              </div>
            </Transition>
          </div>
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
