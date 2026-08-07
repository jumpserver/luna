import type { Ref } from "vue";
import type { ChenTreeNode } from "~/chen/types";

import { fetchChenTreeChildren, runChenAction } from "~/chen/api";
import { initialChenExpandedKeys } from "~/chen/utils/resourceTree";

interface UseChenResourceTreeOptions {
  endpointUrl?: Ref<string>;
  onLoadError?: (node: ChenTreeNode | null, cause: unknown) => void;
}

export function useChenResourceTree(chenToken: Ref<string>, options: UseChenResourceTreeOptions = {}) {
  const rootNodes = ref<ChenTreeNode[]>([]);
  const childrenMap = reactive<Record<string, ChenTreeNode[]>>({});
  const loadingChildren = reactive<Record<string, boolean>>({});
  const loadErrors = reactive<Record<string, string>>({});
  const expandedKeys = ref<string[]>([]);
  const selectedNodeKey = ref("");

  function normalizeErrorMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function findNodeByKey(key: string, nodes = rootNodes.value): ChenTreeNode | null {
    for (const node of nodes) {
      if (node.key === key) return node;
      const children = node.children || [];
      const match = findNodeByKey(key, children);
      if (match) return match;
    }

    return null;
  }

  function normalizeTreeNodes(items: ChenTreeNode[]): ChenTreeNode[] {
    return items.map((item) => {
      if (item.type === "table") {
        return { ...item, leaf: true, children: undefined };
      }

      return {
        ...item,
        leaf: item.hasChildren === false,
        children: Array.isArray(item.children) ? normalizeTreeNodes(item.children) : undefined
      };
    });
  }

  async function loadNodeChildren(node?: ChenTreeNode | null, force = false) {
    const key = node?.key || "__root__";
    if (loadingChildren[key]) return;
    loadingChildren[key] = true;
    loadErrors[key] = "";

    try {
      const items = normalizeTreeNodes(
        await fetchChenTreeChildren(chenToken.value, node, force, options.endpointUrl?.value)
      );
      if (!node) {
        rootNodes.value = items;
        return;
      }

      childrenMap[node.key] = items;
      node.children = items;
    } catch (cause) {
      loadErrors[key] = normalizeErrorMessage(cause);
      options.onLoadError?.(node ?? null, cause);
      // Root failures must propagate so the session can surface a fatal error
      // state; per-node failures degrade to an empty subtree + a toast.
      if (!node) throw cause;
    } finally {
      loadingChildren[key] = false;
    }
  }

  async function refreshRoot() {
    await loadNodeChildren(null, true);
  }

  async function expandInitialTree() {
    const root = rootNodes.value[0];
    if (!root?.key) return;

    expandedKeys.value = initialChenExpandedKeys(root);
    if (rootNodes.value.length === 1 && root.hasChildren !== false) {
      await loadNodeChildren(root);
    }
  }

  function toggleTreeNode(node: ChenTreeNode) {
    expandedKeys.value = expandedKeys.value.includes(node.key)
      ? expandedKeys.value.filter((key) => key !== node.key)
      : [...expandedKeys.value, node.key];

    if (!node.children?.length && node.hasChildren !== false) {
      void loadNodeChildren(node);
    }
  }

  async function runTreeAction(node: ChenTreeNode, action: string) {
    return runChenAction(chenToken.value, node, action, options.endpointUrl?.value);
  }

  return {
    childrenMap,
    expandedKeys,
    loadErrors,
    loadingChildren,
    rootNodes,
    selectedNodeKey,
    expandInitialTree,
    findNodeByKey,
    loadNodeChildren,
    refreshRoot,
    runTreeAction,
    toggleTreeNode
  };
}
