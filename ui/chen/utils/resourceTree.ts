const QUERY_CONSOLE_NODE_TYPES = new Set(["datasource", "database", "schema", "table"]);

export function initialChenExpandedKeys(root: { key: string }) {
  return [root.key];
}

export function chenNodeActivationAction(node: { type: string }) {
  return node.type === "table" || node.type === "view" ? "view_data" : null;
}

export function canOpenChenQueryConsole<T extends { type: string }>(node: T | null | undefined): node is T {
  return Boolean(node && QUERY_CONSOLE_NODE_TYPES.has(node.type));
}
