import type { AssetItem, AssetTreeKind, AssetTreeNode, PermedAccount, PermedProtocol } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface TreeQuery {
  key?: string
  n?: string
  lv?: number
  type?: string
  category?: string
  search?: string
}

const normalizeChoice = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    return String((value as { value?: unknown }).value || "");
  }
  return "";
};

const normalizeTreeNodes = (value: unknown, baseLevel = 0): AssetTreeNode[] => {
  const rawNodes = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.results)
      ? (value as any).results
      : [];
  const nodes = rawNodes.map((raw: any) => ({
    ...raw,
    id: String(raw.id ?? raw.key ?? ""),
    pId: raw.pId == null ? null : String(raw.pId),
    name: String(raw.name || raw.title || ""),
    isParent: Boolean(raw.isParent),
    open: Boolean(raw.open && Array.isArray(raw.children)),
    level: Number.isFinite(raw.level) ? raw.level : baseLevel,
    loaded: Array.isArray(raw.children),
    children: Array.isArray(raw.children)
      ? normalizeTreeNodes(raw.children, baseLevel + 1)
      : []
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

    return {
      key: parent.key || parent.id,
      n: parent.name,
      lv: parent.level || 0
    };
  };

  const fetchTree = async (
    kind: AssetTreeKind,
    parent?: AssetTreeNode,
    search?: string,
    options?: { orgId?: string }
  ) => {
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
      platform: String(data.platform?.name || data.platform || data.platform_type || ""),
      zone: String(data.zone?.name || data.zone || ""),
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
    fetchTree,
    treeNodeToAsset
  };
};
