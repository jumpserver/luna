export interface FileWorkspacePreconnect {
  assetId: string;
  assetName: string;
  /** Reuse an existing SFTP token when upgrading from a live session. */
  tokenId?: string;
}

/**
 * Intent bridge for the professional `/files` workbench.
 * Callers set a pending preconnect, navigate to `/files`, and the global
 * file manager consumes it once to open the asset on the remote side.
 */
export function useFileWorkspaceIntent() {
  const localePath = useLocalePath();
  const pendingPreconnect = useState<FileWorkspacePreconnect | null>("file-workspace-preconnect", () => null);

  async function openProfessional(intent?: FileWorkspacePreconnect | null) {
    if (intent?.assetId) {
      pendingPreconnect.value = {
        assetId: intent.assetId,
        assetName: intent.assetName || intent.assetId,
        tokenId: intent.tokenId
      };
    }
    await navigateTo(localePath({ path: "/files" }));
  }

  function consumePreconnect() {
    const next = pendingPreconnect.value;
    pendingPreconnect.value = null;
    return next;
  }

  return {
    pendingPreconnect,
    openProfessional,
    consumePreconnect
  };
}
