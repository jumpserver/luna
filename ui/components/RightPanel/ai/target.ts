interface ResolveAiPanelTargetOptions {
  workspaceMode: "assets" | "files" | "tools";
  paneId: string;
  ownerFileTargetId: string;
  ownerFileTargetAllowed: boolean;
  globalFileTargetId: string;
  compactFileTargetId: string;
  preferCompactFileAi: boolean;
}

export function resolveAiPanelTarget(options: ResolveAiPanelTargetOptions) {
  if (options.workspaceMode === "files") return options.globalFileTargetId;
  if (options.ownerFileTargetAllowed && options.ownerFileTargetId) return options.ownerFileTargetId;
  if (options.preferCompactFileAi) return options.compactFileTargetId;
  return options.paneId;
}
