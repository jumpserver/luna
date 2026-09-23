export type CachedSftpPane = {
  paneId: string;
  identity: string;
};

/**
 * Identity is the asset binding, not the SSH session instance. A transient
 * session-detail refresh must not look like a different pane, otherwise the
 * cached SFTP surface unmounts and its websocket drops mid-transfer.
 */
export function compactSftpCacheIdentity(input: {
  paneId: string;
  protocol?: string;
  assetId?: string;
  account?: string;
}): string {
  if (!input.paneId || input.protocol !== "ssh") return "";
  return [input.paneId, input.assetId || "", input.account || "-"].join(":");
}

/** ponytail: no LRU; bound is SSH panes that opened SFTP. */
export function nextSftpSessionCache(input: {
  cached: CachedSftpPane[];
  identities: Map<string, string>;
  activePaneId: string;
  /** The koko session must exist before a surface can be created, never to keep one. */
  activeReady: boolean;
  sftpTabVisible: boolean;
}): CachedSftpPane[] {
  const retained = input.cached.filter((entry) => input.identities.get(entry.paneId) === entry.identity);
  if (!input.sftpTabVisible || !input.activeReady) return retained;
  const identity = input.identities.get(input.activePaneId) || "";
  if (!identity || retained.some((entry) => entry.paneId === input.activePaneId)) return retained;
  return [...retained, { paneId: input.activePaneId, identity }];
}
