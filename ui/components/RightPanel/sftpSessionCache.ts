export type CachedSftpPane = {
  paneId: string;
  identity: string;
};

export function compactSftpCacheIdentity(input: {
  paneId: string;
  protocol?: string;
  assetId?: string;
  account?: string;
  sessionId?: string;
}): string {
  if (!input.paneId || input.protocol !== "ssh" || !input.sessionId) return "";
  return [input.paneId, input.assetId || "", input.account || "-", input.sessionId].join(":");
}

/** ponytail: no LRU; bound is SSH panes that opened SFTP. */
export function nextSftpSessionCache(input: {
  cached: CachedSftpPane[];
  identities: Map<string, string>;
  activePaneId: string;
  sftpTabVisible: boolean;
}): CachedSftpPane[] {
  const retained = input.cached.filter((entry) => input.identities.get(entry.paneId) === entry.identity);
  if (!input.sftpTabVisible) return retained;
  const identity = input.identities.get(input.activePaneId) || "";
  if (!identity || retained.some((entry) => entry.paneId === input.activePaneId)) return retained;
  return [...retained, { paneId: input.activePaneId, identity }];
}
