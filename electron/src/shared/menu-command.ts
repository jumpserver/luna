export function menuCommandTargetLabel(focusedLabel?: string | null) {
  return focusedLabel || "main";
}

/** darwin keeps Cmd+C. Other platforms must not bind copy to Ctrl+C, or the terminal interrupt never arrives. */
export function editCopyAccelerator(platform: NodeJS.Platform = process.platform) {
  return platform === "darwin" ? "Cmd+C" : "Ctrl+Shift+C";
}
