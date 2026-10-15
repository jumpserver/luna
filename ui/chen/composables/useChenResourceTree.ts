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
  const loadGenerations = new Map<string, number>();
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

  function findNodePathByKey(key: string, nodes = rootNodes.value, ancestors: ChenTreeNode[] = []): ChenTreeNode[] {
    for (const node of nodes) {
      const path = [...ancestors, node];
      if (node.key === key) return path;
      const match = findNodePathByKey(key, node.children || [], path);
      if (match.length) return match;
    }
    return [];
  }

  async function resolveNodePath(keys: string[]) {
    if (!keys.length) return null;
    let nodes = rootNodes.value;
    let current: ChenTreeNode | null = null;

    for (let index = 0; index < keys.length; index += 1) {
      current = nodes.find((node) => node.key === keys[index]) || null;
      if (!current) return null;
      if (index === keys.length - 1) return current;
      if (!current.children?.length && current.hasChildren !== false) await loadNodeChildren(current);
      nodes = current.children || [];
    }

    return current;
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
    if (loadingChildren[key] && !force) return;
    const generation = (loadGenerations.get(key) || 0) + 1;
    loadGenerations.set(key, generation);
    loadingChildren[key] = true;
    loadErrors[key] = "";

    try {
      const items = normalizeTreeNodes(
        await fetchChenTreeChildren(chenToken.value, node, force, options.endpointUrl?.value)
      );
      if (loadGenerations.get(key) !== generation) return;
      if (!node) {
        rootNodes.value = items;
        return;
      }

      childrenMap[node.key] = items;
      node.children = items;
    } catch (cause) {
      if (loadGenerations.get(key) !== generation) return;
      loadErrors[key] = normalizeErrorMessage(cause);
      options.onLoadError?.(node ?? null, cause);
      // Root failures must propagate so the session can surface a fatal error
      // state; per-node failures degrade to an empty subtree + a toast.
      if (!node) throw cause;
    } finally {
      if (loadGenerations.get(key) === generation) loadingChildren[key] = false;
    }
  }

  function collectNodeKeys(nodes: ChenTreeNode[], keys = new Set<string>()) {
    for (const node of nodes) {
      keys.add(node.key);
      if (node.children?.length) collectNodeKeys(node.children, keys);
    }
    return keys;
  }

  function clearChildCaches() {
    for (const key of Object.keys(childrenMap)) delete childrenMap[key];
    for (const key of Object.keys(loadErrors)) {
      if (key !== "__root__") delete loadErrors[key];
    }
  }

  async function restoreExpandedNodes(wanted: Set<string>) {
    const restored: string[] = [];

    async function visit(nodes: ChenTreeNode[]) {
      for (const node of nodes) {
        if (!wanted.has(node.key)) continue;
        if (node.leaf || node.hasChildren === false) {
          restored.push(node.key);
          continue;
        }

        await loadNodeChildren(node, true);
        if (loadErrors[node.key] || !Array.isArray(node.children)) continue;
        restored.push(node.key);
        if (node.children.length) await visit(node.children);
      }
    }

    await visit(rootNodes.value);
    return restored;
  }

  async function refreshRoot(additionalPaths: string[][] = []) {
    const previousExpandedKeys = [...expandedKeys.value];
    const previousTreeKeys = collectNodeKeys(rootNodes.value);
    await loadNodeChildren(null, true);
    clearChildCaches();

    // Drop resource-tree expansion before restoring paths so a newly fetched
    // root cannot render as expanded-without-children.
    const preservedKeys = previousExpandedKeys.filter((key) => !previousTreeKeys.has(key));
    expandedKeys.value = preservedKeys;
    const refreshKeys = new Set(previousExpandedKeys);
    for (const path of additionalPaths) {
      for (const key of path) refreshKeys.add(key);
    }
    const restoredKeys = await restoreExpandedNodes(refreshKeys);
    const kept = new Set([...preservedKeys, ...restoredKeys]);
    expandedKeys.value = previousExpandedKeys.filter((key) => kept.has(key));
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
    findNodePathByKey,
    loadNodeChildren,
    refreshRoot,
    resolveNodePath,
    runTreeAction,
    toggleTreeNode
  };
}
