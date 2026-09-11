import type { ChenDataViewPropertyTab } from "~/chen/types/dataView";

const QUERY_CONSOLE_NODE_TYPES = new Set(["datasource", "database", "schema", "table"]);
const TABLE_PROPERTY_TABS: ChenDataViewPropertyTab[] = [
  "basic",
  "columns",
  "indexes",
  "foreignKeys",
  "constraints",
  "ddl",
  "diagram"
];
const VIEW_PROPERTY_TABS: ChenDataViewPropertyTab[] = ["basic", "columns", "ddl"];

export function initialChenExpandedKeys(root: { key: string }) {
  return [root.key];
}

export function chenNodeActivationAction(node: { type: string }) {
  return node.type === "table" || node.type === "view" ? "view_data" : null;
}

export function chenNodeTypeFromKey(nodeKey: string) {
  const last = String(nodeKey || "").split(",").pop() || "";
  return last.split(":")[0] || "";
}

export function isChenViewRelation(input: { nodeKey?: string; kind?: string | null }) {
  if (input.kind === "view") return true;
  if (input.kind === "table") return false;
  return chenNodeTypeFromKey(input.nodeKey || "") === "view";
}

export function chenDataViewPropertyTabIds(input: {
  nodeKey?: string;
  kind?: string | null;
  ddlSupported?: boolean;
}): ChenDataViewPropertyTab[] {
  if (!isChenViewRelation(input)) return TABLE_PROPERTY_TABS;
  return input.ddlSupported === true ? VIEW_PROPERTY_TABS : VIEW_PROPERTY_TABS.filter((tab) => tab !== "ddl");
}

export function canOpenChenQueryConsole<T extends { type: string }>(node: T | null | undefined): node is T {
  return Boolean(node && QUERY_CONSOLE_NODE_TYPES.has(node.type));
}
