export function initialChenExpandedKeys(root: { key: string }) {
  return [root.key];
}

export function chenNodeActivationAction(node: { type: string }) {
  return node.type === "table" ? "view_data" : null;
}
