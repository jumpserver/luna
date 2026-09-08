import type { WorkspacePane, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { sendKokoTerminalDataToMany } from "#koko/composables/useTerminalSessionRegistry";

const EXCLUDED_BATCH_COMMAND_PROTOCOLS = new Set(["sftp", "k8s", "kubernetes"]);

export function collectConnectedBatchCommandPanes(tabs: WorkspaceSessionTab[]): WorkspacePane[] {
  return tabs
    .flatMap((tab) => tab.panes)
    .filter((pane) => !EXCLUDED_BATCH_COMMAND_PROTOCOLS.has(pane.protocol) && pane.status === "connected");
}

export function reconcileSelectedBatchCommandIds(
  newTargets: Array<{ id: string }>,
  oldTargets: Array<{ id: string }> = [],
  selectedIds: string[]
): string[] {
  const oldIds = new Set(oldTargets.map((target) => target.id));
  const next = [...selectedIds];
  for (const target of newTargets) {
    if (!oldIds.has(target.id)) next.push(target.id);
  }
  return next.filter((id) => newTargets.some((target) => target.id === id));
}

export function sendBatchCommandToTargets(targetIds: string[], command: string) {
  const text = command.trim();
  if (!text || targetIds.length === 0) return null;

  const total = targetIds.length;
  const sent = sendKokoTerminalDataToMany(targetIds, `${text}\r`);
  return { sent, total, failed: total - sent };
}
