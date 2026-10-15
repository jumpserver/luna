import type { RightPanelTab } from "~/composables/useRightPanel";
import { assetSupportsSftp } from "#koko/composables/sftp/file-manager/selectors";

/** ponytail: no LRU; bound is workspace panes that opened the right panel. */
const tabByPaneId = new Map<string, RightPanelTab>();

export function rememberRightPanelTab(paneId: string, tab: RightPanelTab) {
  if (paneId) tabByPaneId.set(paneId, tab);
}

export function rememberedRightPanelTab(paneId: string) {
  return tabByPaneId.get(paneId);
}

export function resetRightPanelTabState() {
  tabByPaneId.clear();
}

export function showSftpRightPanelTab(protocol: string | undefined, protocols: Array<{ name?: unknown }> | undefined) {
  if (protocol?.toLowerCase() !== "ssh") return false;
  if (protocols === undefined) return true;
  return assetSupportsSftp(protocols);
}

export function nextRightPanelTab(input: {
  available: RightPanelTab[];
  remembered?: RightPanelTab;
  active: RightPanelTab;
  sftpResolved: boolean;
  paneChanged?: boolean;
}): RightPanelTab {
  const has = (tab: RightPanelTab) => input.available.includes(tab);
  if (input.remembered && has(input.remembered)) return input.remembered;
  if (input.remembered === "sftp" && !input.sftpResolved) return "sftp";
  if (input.paneChanged) return input.available[0] || "session";
  if (has(input.active)) return input.active;
  return input.available[0] || "session";
}
