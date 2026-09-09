export interface WorkspaceSessionDetails {
  sessionId?: string;
  /** Account used on the asset, as resolved by the connector (never the login user). */
  account?: string;
  shareAllowed?: boolean;
  requestFileToken?: () => Promise<string>;
}

// Workspace surfaces publish a normalized summary here. The right panel only
// renders this contract and does not need to know which protocol/component owns it.
// Asset name, address and protocol are not part of it: the workspace pane already
// holds them, so a connector must not restate (and possibly contradict) them.
const sessionDetailsByTabId = shallowReactive(new Map<string, WorkspaceSessionDetails>());

export function setWorkspaceSessionDetails(tabId: string, details: WorkspaceSessionDetails) {
  if (!tabId) return;
  sessionDetailsByTabId.set(tabId, details);
}

export function clearWorkspaceSessionDetails(tabId: string) {
  if (!tabId) return;
  sessionDetailsByTabId.delete(tabId);
}

// Connectors report accounts the way JumpServer renders them: "name(username)".
// Collapse the redundant form so picking `root` still reads as `root`.
export function formatSessionAccount(account: string) {
  const matched = /^(.+)\((.+)\)$/.exec(account.trim());
  return matched && matched[1] === matched[2] ? matched[1] : account;
}

export function useWorkspaceSessionDetails() {
  const getSessionDetails = (tabId: string) => sessionDetailsByTabId.get(tabId);

  return {
    getSessionDetails,
    clearWorkspaceSessionDetails
  };
}
