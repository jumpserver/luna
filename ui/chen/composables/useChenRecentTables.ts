import type { ChenTreeNode } from "~/chen/types";

import { useLocalStorage } from "@vueuse/core";

export interface ChenRecentTable {
  node: ChenTreeNode;
  path?: string[];
  label?: string;
  openedAt: number;
}

const RECENT_TABLE_LIMIT = 10;

function recentTableLabel(node: ChenTreeNode, path: ChenTreeNode[], dbType: string) {
  const normalizedDbType = dbType.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const tableNode = path.findLast((item) => item.type === "table" || item.type === "view") || node;
  const databaseNode = path.findLast((item) => item.type === "database");
  const schemaNode = path.findLast((item) => item.type === "schema");
  const tableName = tableNode.label || tableNode.name || tableNode.key;
  const databaseName = databaseNode?.label || databaseNode?.name;
  const schemaName = schemaNode?.label || schemaNode?.name;

  if (normalizedDbType.includes("oracle") || normalizedDbType.includes("dameng")) {
    return [schemaName, tableName].filter(Boolean).join(".");
  }
  if (normalizedDbType.includes("postgres") || normalizedDbType.includes("sqlserver")) {
    return [databaseName, schemaName, tableName].filter(Boolean).join(".");
  }
  if (
    normalizedDbType.includes("mysql") ||
    normalizedDbType.includes("mariadb") ||
    normalizedDbType.includes("mongodb") ||
    normalizedDbType.includes("clickhouse")
  ) {
    return [databaseName, tableName].filter(Boolean).join(".");
  }

  return path
    .filter(
      (item) => item.type === "database" || item.type === "schema" || item.type === "table" || item.type === "view"
    )
    .map((item) => item.label || item.name || item.key)
    .join(".");
}

export function useChenRecentTables(scope: string) {
  const entries = useLocalStorage<ChenRecentTable[]>(`jumpserver-client:chen-recent-tables:${scope}`, []);
  entries.value = entries.value.slice(0, RECENT_TABLE_LIMIT);

  function add(node: ChenTreeNode, path: ChenTreeNode[], dbType = "") {
    if (node.type !== "table" && node.type !== "view") return;
    const storedNode = { ...node, children: undefined };
    const qualifiedLabel = recentTableLabel(node, path, dbType);
    entries.value = [
      {
        node: storedNode,
        path: path.map((item) => item.key),
        label: qualifiedLabel || storedNode.label || storedNode.name || storedNode.key,
        openedAt: Date.now()
      },
      ...entries.value.filter((entry) => entry.node.key !== node.key)
    ].slice(0, RECENT_TABLE_LIMIT);
  }

  function clear() {
    entries.value = [];
  }

  return { add, clear, entries };
}
