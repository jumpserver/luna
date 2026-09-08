import type {
  AssetItem,
  AssetTreeKind,
  AssetTreeNextPage,
  AssetTreeNode,
  PermedAccount,
  PermedProtocol
} from "~/types";
import { onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { hasItemName } from "~/utils/itemName";

interface TreeQuery {
  parent_key?: string;
  type?: string;
  category?: string;
  search?: string;
}

interface AssetTreePage {
  nodes: AssetTreeNode[];
  nextPage: AssetTreeNextPage | null;
}

const AUTHORIZATION_NODE_PAGE_SIZE = 100;
const AUTHORIZATION_ASSET_PAGE_SIZE = 100;
const TYPE_TREE_ASSET_PAGE_SIZE = 100;

const treeNodeType = (node: Pick<AssetTreeNode, "isParent" | "meta">) =>
  node.meta?.type === "node" || node.isParent ? "node" : "asset";

export const authorizationTreeMetricId = (node: AssetTreeNode) => String(node.meta?.data?.id ?? node.key ?? node.id);

const normalizeChoice = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    return String((value as { value?: unknown }).value || "");
  }
  return "";
};

const normalizeTreeNodes = (value: unknown, baseLevel = 0): AssetTreeNode[] => {
  const rawNodes = Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];
  const nodes = rawNodes.map((raw: any) => ({
    ...raw,
    id: String(raw.id ?? raw.key ?? ""),
    pId: raw.pId == null ? null : String(raw.pId),
    name: String(raw.name || raw.title || ""),
    isParent: treeNodeType(raw) === "node",
    open: Boolean(raw.open && Array.isArray(raw.children)),
    level: Number.isFinite(raw.level) ? raw.level : baseLevel,
    loaded: Array.isArray(raw.children),
    children: Array.isArray(raw.children) ? normalizeTreeNodes(raw.children, baseLevel + 1) : []
  })) as AssetTreeNode[];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: AssetTreeNode[] = [];

  for (const node of nodes) {
    const parent = node.pId ? byId.get(node.pId) : undefined;
    if (parent && parent !== node) {
      parent.children ||= [];
      parent.children.push(node);
      parent.isParent = true;
      parent.loaded = true;
      node.level = (parent.level || baseLevel) + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
};

export function applyAssetRename(nodes: AssetTreeNode[], assetId: string, name: string) {
  for (const node of nodes) {
    const isBranch = Boolean(node.isParent || node.children?.length);
    if (!isBranch && String(node.meta?.data?.id || node.key || node.id) === assetId) {
      node.name = name;
      if (node.meta?.data) node.meta.data.name = name;
    }
    if (node.children?.length) applyAssetRename(node.children, assetId, name);
  }
}

const collectAssetLeaves = (nodes: AssetTreeNode[]): Array<{ id: string; name: string }> => {
  const items: Array<{ id: string; name: string }> = [];
  const walk = (tree: AssetTreeNode[]) => {
    for (const node of tree) {
      const isBranch = Boolean(node.isParent || node.children?.length);
      if (!isBranch) items.push({ id: String(node.meta?.data?.id || node.key || node.id), name: node.name });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return items;
};

export function hasAssetName(nodes: AssetTreeNode[], name: string, excludeId?: string): boolean {
  return hasItemName(collectAssetLeaves(nodes), name, excludeId);
}

type AssetNameLookup = (name: string, excludeId?: string) => boolean;
const assetNameLookups = new Set<AssetNameLookup>();

export function registerAssetNameLookup(lookup: AssetNameLookup) {
  assetNameLookups.add(lookup);
  onBeforeUnmount(() => assetNameLookups.delete(lookup));
}

export function isAssetNameTaken(name: string, excludeId?: string) {
  for (const lookup of assetNameLookups) {
    if (lookup(name, excludeId)) return true;
  }
  return false;
}

export const useAssetTree = () => {
  const userInfoStore = useUserInfoStore();

  const buildQuery = (kind: AssetTreeKind, parent?: AssetTreeNode, search?: string): TreeQuery => {
    if (kind === "search") return { search: search || "" };
    if (!parent) return {};

    if (kind === "type") {
      const data = parent.meta?.data || {};
      return {
        type: parent.type || normalizeChoice(data.type),
        category: parent.category || normalizeChoice(data.category)
      };
    }

    return { parent_key: parent.key || parent.id };
  };

  const requestAuthorizationPage = async (
    parent?: AssetTreeNode,
    nextPage: AssetTreeNextPage = { phase: "nodes" },
    options?: { orgId?: string }
  ): Promise<AssetTreePage> => {
    const parentKey = parent?.key || parent?.id;
    const query =
      nextPage.phase === "assets"
        ? {
            ...(parentKey ? { parent_key: parentKey } : {}),
            include_nodes: false,
            include_assets: true,
            asset_page_size: AUTHORIZATION_ASSET_PAGE_SIZE,
            ...(nextPage.assetOffset ? { asset_offset: nextPage.assetOffset } : {})
          }
        : {
            ...(parentKey ? { parent_key: parentKey } : {}),
            node_page_size: AUTHORIZATION_NODE_PAGE_SIZE,
            ...(nextPage.nodeCursor ? { node_cursor: nextPage.nodeCursor } : {})
          };
    const response: any = await getAssetTree("authorization", query, options?.orgId);
    const nodes = normalizeTreeNodes(response, parent ? (parent.level || 0) + 1 : 0);
    const nodePagination = response?.node_pagination;
    const assetPagination = response?.asset_pagination;

    if (nextPage.phase === "nodes" && nodePagination?.has_more && nodePagination.next) {
      const cursor = new URL(nodePagination.next, "http://localhost").searchParams.get("node_cursor");
      return {
        nodes,
        nextPage: cursor ? { phase: "nodes", nodeCursor: cursor } : null
      };
    }
    if (nextPage.phase === "assets" && assetPagination?.has_more) {
      return {
        nodes,
        nextPage: { phase: "assets", assetOffset: assetPagination.next_offset }
      };
    }
    return { nodes, nextPage: null };
  };

  const fetchAuthorizationTreePage = async (
    parent?: AssetTreeNode,
    nextPage?: AssetTreeNextPage,
    options?: { orgId?: string }
  ): Promise<AssetTreePage> => {
    const nodePage = await requestAuthorizationPage(parent, nextPage || { phase: "nodes" }, options);
    if (nodePage.nextPage || !parent || nextPage?.phase === "assets") return nodePage;

    // A branch exposes all direct child nodes before the first direct asset
    // page, matching the regular Lina node/asset tree contract.
    const assetPage = await requestAuthorizationPage(parent, { phase: "assets" }, options);
    return {
      nodes: [...nodePage.nodes, ...assetPage.nodes],
      nextPage: assetPage.nextPage
    };
  };

  const fetchTypeTreePage = async (
    parent: AssetTreeNode,
    nextPage?: AssetTreeNextPage,
    options?: { orgId?: string }
  ): Promise<AssetTreePage> => {
    const query = {
      ...buildQuery("type", parent),
      asset_page_size: TYPE_TREE_ASSET_PAGE_SIZE,
      ...(nextPage?.assetOffset ? { asset_offset: nextPage.assetOffset } : {})
    };
    const response: any = await getAssetTree("type", query, options?.orgId);
    const nodes = normalizeTreeNodes(response, (parent.level || 0) + 1);
    const assetPagination = response?.asset_pagination;
    return {
      nodes,
      nextPage: assetPagination?.has_more ? { phase: "assets", assetOffset: assetPagination.next_offset } : null
    };
  };

  const fetchAuthorizationTreeMetrics = async (
    nodes: AssetTreeNode[],
    options?: { orgId?: string }
  ): Promise<Map<string, number>> => {
    const resources = Array.from(
      new Map(
        nodes
          .filter((node) => treeNodeType(node) === "node")
          .map((node) => {
            const id = authorizationTreeMetricId(node);
            return [id, { type: "node" as const, id }];
          })
      ).values()
    );
    if (!resources.length) return new Map();

    const response = await getUserAssetTreeMetrics(resources, options?.orgId);
    return new Map(
      (response?.results || [])
        .filter((item) => item.type === "node" && Number.isFinite(Number(item.count)))
        .map((item) => [String(item.id), Number(item.count)])
    );
  };

  const fetchTree = async (
    kind: AssetTreeKind,
    parent?: AssetTreeNode,
    search?: string,
    options?: { orgId?: string }
  ) => {
    if (kind === "authorization") {
      return (await fetchAuthorizationTreePage(parent, undefined, options)).nodes;
    }
    if (kind === "type" && parent) {
      return (await fetchTypeTreePage(parent, undefined, options)).nodes;
    }
    const query = buildQuery(kind, parent, search);
    const data = await getAssetTree(kind, query, options?.orgId);

    return normalizeTreeNodes(data, parent ? (parent.level || 0) + 1 : 0);
  };

  const treeNodeToAsset = (node: AssetTreeNode): AssetItem => {
    const data = node.meta?.data || {};
    const protocols = (data.permedProtocols || data.permed_protocols || []) as PermedProtocol[];
    const accounts = (data.permedAccounts || data.permed_accounts || []) as PermedAccount[];

    return {
      id: String(data.id || node.id),
      name: String(data.name || node.name),
      address: String(data.address || ""),
      org_id: typeof data.org_id === "string" ? data.org_id : undefined,
      platform: String(
        (typeof data.platform === "object" ? data.platform?.name : data.platform) || data.platform_type || ""
      ),
      zone: String((typeof data.zone === "object" ? data.zone?.name : data.zone) || ""),
      category: normalizeChoice(data.category),
      type: normalizeChoice(data.type) || String(data.platform_type || ""),
      isActive: data.is_active !== false && !node.chkDisabled,
      comment: String(data.comment || node.title || ""),
      permedProtocols: protocols,
      permedAccounts: accounts,
      savedConnection: userInfoStore.getConnectionInfoForAsset(String(data.id || node.id)) || undefined
    };
  };

  return {
    fetchAuthorizationTreePage,
    fetchAuthorizationTreeMetrics,
    fetchTypeTreePage,
    fetchTree,
    treeNodeToAsset
  };
};

export const useAssetTreeSearch = (
  search: () => string,
  callbacks: {
    onResults: (query: string, nodes: AssetTreeNode[]) => void;
    onError: (query: string, error: unknown) => void;
  }
) => {
  const userInfoStore = useUserInfoStore();
  const { fetchTree } = useAssetTree();
  const nodes = ref<AssetTreeNode[]>([]);
  const loading = shallowRef(false);
  const completedQuery = shallowRef("");

  watch(
    [
      () => search().trim(),
      () => userInfoStore.loggedIn,
      () => userInfoStore.orgId,
      () => userInfoStore.currentSite,
      () => userInfoStore.currentAccountId
    ],
    ([query, loggedIn], _previous, onCleanup) => {
      nodes.value = [];
      completedQuery.value = "";
      loading.value = Boolean(query && loggedIn);
      if (!query || !loggedIn) return;

      let active = true;
      const timer = setTimeout(async () => {
        try {
          const results = await fetchTree("search", undefined, query);
          if (!active) return;
          nodes.value = results;
          completedQuery.value = query;
          callbacks.onResults(query, results);
        } catch (error) {
          if (active) callbacks.onError(query, error);
        } finally {
          if (active) loading.value = false;
        }
      }, 250);

      onCleanup(() => {
        active = false;
        clearTimeout(timer);
      });
    },
    { immediate: true }
  );

  return { nodes, loading, completedQuery };
};
