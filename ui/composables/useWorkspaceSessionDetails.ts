export interface WorkspaceSessionDetails {
  sessionId?: string;
  asset?: string;
  address?: string;
  account?: string;
  shareAllowed?: boolean;
  requestFileToken?: () => Promise<string>;
}

// Workspace surfaces publish a normalized summary here. The right panel only
// renders this contract and does not need to know which protocol/component owns it.
const sessionDetailsByTabId = shallowReactive(new Map<string, WorkspaceSessionDetails>());

export function setWorkspaceSessionDetails(tabId: string, details: WorkspaceSessionDetails) {
  if (!tabId) return;
  sessionDetailsByTabId.set(tabId, details);
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
