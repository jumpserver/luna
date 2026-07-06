import type { TerminalSessionInfo } from "~/koko/types";

const sessionDetailsByTabId = new Map<string, TerminalSessionInfo>();

export function setWorkspaceSessionDetails(tabId: string, info: TerminalSessionInfo) {
  if (!tabId) return;
  sessionDetailsByTabId.set(tabId, info);
}

export function clearWorkspaceSessionDetails(tabId: string) {
  if (!tabId) return;
  sessionDetailsByTabId.delete(tabId);
}

export function useWorkspaceSessionDetails() {
  const getSessionDetails = (tabId: string) => sessionDetailsByTabId.get(tabId);

  return {
    getSessionDetails,
    clearWorkspaceSessionDetails
  };
}
