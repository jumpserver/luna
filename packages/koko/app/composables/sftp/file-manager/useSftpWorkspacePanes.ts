import type { KokoSftpAsset } from "@jumpserver/koko/host";
import type { MaybeRefOrGetter } from "vue";
import type {
  FileWorkspacePreconnect,
  FileWorkspaceSourceAsset,
  RecentSftpConnection,
  SftpRemotePane,
  SftpRemotePaneHandle,
  SftpWorkspaceSide
} from "./workspaceTypes";

import { connectorSessionKey, resolveDevHost } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import { computed, inject, reactive, ref, toValue, unref, watch } from "vue";
import { assetSupportsSftp, defaultGlobalLeftPaneId, rememberSftpConnection } from "./selectors";

interface SftpWorkspacePanesOptions {
  sftpToken: MaybeRefOrGetter<string | undefined>;
  global: MaybeRefOrGetter<boolean | undefined>;
  /** Asset that owns the primary session pane (session workbench only). */
  sourceAsset?: MaybeRefOrGetter<FileWorkspaceSourceAsset | null | undefined>;
  translate: (key: string, params?: Record<string, unknown>) => string;
  showError: (title: string, error: unknown) => void;
}

const paneId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export function useSftpWorkspacePanes(options: SftpWorkspacePanesOptions) {
  const toast = useToast();
  const hostAdapter = useKokoHostAdapter();
  const createSftpSession = hostAdapter.sftp.useSessionCreator();
  const pendingPreconnect = useState<FileWorkspacePreconnect | null>("file-workspace-preconnect", () => null);
  const providedContext = inject(connectorSessionKey, ref(null));

  const primaryContext = computed(() => {
    const value = unref(providedContext);
    const tokenId = toValue(options.sftpToken);
    if (!value || !tokenId) return null;
    if (value.tokenId === tokenId) return value;
    return { ...value, tokenId };
  });
  /** Prefer the connected asset name over the generic "Current SFTP" label. */
  const primaryAssetName = computed(() => {
    const name = toValue(options.sourceAsset)?.name?.trim();
    return name || options.translate("koko.fileManagement.localSftp");
  });
  const primaryAsset = computed<FileWorkspaceSourceAsset>(() => ({
    id: toValue(options.sourceAsset)?.id || "",
    name: primaryAssetName.value,
    ...(toValue(options.sourceAsset)?.account ? { account: toValue(options.sourceAsset)!.account } : {})
  }));
  const primaryTransferEndpoint = computed(() => {
    if (!primaryContext.value) return undefined;
    return {
      id: `sftp:${primaryContext.value.tokenId}`,
      label: primaryAssetName.value
    };
  });

  const remotePanes = ref<SftpRemotePane[]>([]);
  /** Session dual pane is implicit: open when any remote exists, collapse when all close. */
  const dualMode = computed(() => remotePanes.value.length > 0);
  const remotePaneRefs = ref<Record<string, SftpRemotePaneHandle | null>>({});
  const activeRemoteId = ref<string | null>(null);
  const connectModalOpen = ref(false);
  const connectSide = ref<SftpWorkspaceSide>("left");
  const remoteAssetSearch = ref("");
  const remoteConnecting = ref(false);
  const preconnecting = ref(false);
  const preconnectingName = ref("");
  const recentConnections = useLocalStorage<RecentSftpConnection[]>("sftp-recent-connections", []);
  const globalActiveIds = reactive<Record<SftpWorkspaceSide, string | null>>({ left: null, right: null });

  const currentOrgId = computed(() => hostAdapter.sftp.currentOrganization.value?.id || "");
  const currentOrgLabel = computed(
    () =>
      hostAdapter.sftp.currentOrganization.value?.name || options.translate("koko.fileManagement.selectOrganization")
  );
  const organizationSelector = hostAdapter.sftp.organizationSelector;
  const assetTree = hostAdapter.sftp.assetTree;
  const isDesktopRuntime = hostAdapter.isDesktopRuntime();

  const panesForSide = (side: SftpWorkspaceSide) => remotePanes.value.filter((pane) => pane.side === side);
  const activePaneForSide = (side: SftpWorkspaceSide) =>
    remotePanes.value.find((pane) => pane.id === globalActiveIds[side]) || null;

  function setRemotePaneRef(id: string, value: unknown) {
    remotePaneRefs.value[id] = (value as SftpRemotePaneHandle | null) || null;
  }

  async function buildSftpContext(assetId: string, tokenId: string, tabId: string) {
    let endpointUrl = resolveDevHost("koko") || hostAdapter.getWindowOrigin();
    if (!import.meta.dev) {
      const endpoint = await hostAdapter.getSmartEndpoint(
        { protocol: "sftp", assetId, token: tokenId },
        currentOrgId.value
      );
      const port = endpoint.https_port || endpoint.port;
      const scheme = endpoint.https_port ? "https" : "http";
      const resolved =
        endpoint.value ||
        (endpoint.host ? (port ? `${scheme}://${endpoint.host}:${port}` : `${scheme}://${endpoint.host}`) : "");
      if (!resolved) throw new Error(options.translate("koko.fileManagement.endpointUnavailable"));

      if (isDesktopRuntime) {
        endpointUrl = resolved;
      } else {
        const resolvedUrl = new URL(resolved);
        const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
        const hostOrigin = hostAdapter.getWindowOrigin();
        const samePort = (resolvedUrl.port || "") === new URL(hostOrigin).port;
        endpointUrl = isLoopback && !samePort ? hostOrigin : resolved;
      }
    }

    let ticket = "";
    try {
      ticket = String((await hostAdapter.createTicket({ baseUrl: endpointUrl, tokenId })).ticket || "");
    } catch (cause) {
      if (isDesktopRuntime) throw cause;
    }

    return { component: "koko" as const, tokenId, ticket, endpointUrl, tabId };
  }

  function openRemoteConnect(side: SftpWorkspaceSide = "right") {
    connectSide.value = side;
    remoteAssetSearch.value = "";
    connectModalOpen.value = true;
  }

  function disconnectAllRemotes() {
    remotePanes.value = [];
    remotePaneRefs.value = {};
    activeRemoteId.value = null;
  }

  function cleanupRemotePaneRefs(ids: Set<string>) {
    for (const id of ids) delete remotePaneRefs.value[id];
  }

  function removeRemotePane(id: string) {
    const removed = remotePanes.value.find((pane) => pane.id === id);
    remotePanes.value = remotePanes.value.filter((pane) => pane.id !== id);
    delete remotePaneRefs.value[id];
    if (activeRemoteId.value === id) {
      const sameSide = removed ? panesForSide(removed.side) : remotePanes.value;
      activeRemoteId.value = sameSide[0]?.id ?? remotePanes.value[0]?.id ?? null;
    }
    if (removed && globalActiveIds[removed.side] === id) {
      globalActiveIds[removed.side] = panesForSide(removed.side)[0]?.id ?? null;
    }
  }

  function closeOtherRemotePanes(id: string) {
    const target = remotePanes.value.find((pane) => pane.id === id);
    if (!target) return;
    const removedIds = new Set(
      remotePanes.value
        .filter((pane) => pane.side === target.side && pane.id !== id && !pane.pinned)
        .map((pane) => pane.id)
    );
    if (!removedIds.size) return;
    remotePanes.value = remotePanes.value.filter((pane) => !removedIds.has(pane.id));
    cleanupRemotePaneRefs(removedIds);
    activeRemoteId.value = id;
    if (toValue(options.global)) globalActiveIds[target.side] = id;
  }

  function closeRightRemotePanes(id: string) {
    const target = remotePanes.value.find((pane) => pane.id === id);
    if (!target) return;
    const sidePanes = panesForSide(target.side);
    const index = sidePanes.findIndex((pane) => pane.id === id);
    if (index < 0 || index === sidePanes.length - 1) return;
    const removedIds = new Set(
      sidePanes.filter((pane, paneIndex) => paneIndex > index && !pane.pinned).map((pane) => pane.id)
    );
    if (!removedIds.size) return;
    remotePanes.value = remotePanes.value.filter((pane) => !removedIds.has(pane.id));
    cleanupRemotePaneRefs(removedIds);
    activeRemoteId.value = id;
    if (toValue(options.global)) globalActiveIds[target.side] = id;
  }

  function togglePinRemotePane(id: string) {
    const index = remotePanes.value.findIndex((pane) => pane.id === id);
    if (index < 0) return;
    const pane = remotePanes.value[index];
    if (!pane) return;
    const nextPinned = !pane.pinned;
    pane.pinned = nextPinned;

    // Keep pinned tabs packed to the front of their side group.
    const side = pane.side;
    const sidePanes = panesForSide(side).filter((item) => item.id !== id);
    const pinned = sidePanes.filter((item) => item.pinned);
    const unpinned = sidePanes.filter((item) => !item.pinned);
    const orderedSide = nextPinned ? [pane, ...pinned, ...unpinned] : [...pinned, pane, ...unpinned];
    const otherSide = remotePanes.value.filter((item) => item.side !== side);
    remotePanes.value = side === "left" ? [...orderedSide, ...otherSide] : [...otherSide, ...orderedSide];
  }

  async function reconnectRemotePane(id: string) {
    const handle = remotePaneRefs.value[id];
    if (!handle) return;
    try {
      await handle.manager.retry.reconnect();
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.remoteConnectFailed"), error);
    }
  }

  function markRemotePaneConnected() {
    // Connection success is visible via tab/status chrome; avoid noisy toasts.
  }

  function reorderRemotePanes(side: SftpWorkspaceSide, orderedIds: string[]) {
    const sideSet = new Set(orderedIds);
    const sidePanes = orderedIds
      .map((id) => remotePanes.value.find((pane) => pane.id === id && pane.side === side))
      .filter((pane): pane is SftpRemotePane => Boolean(pane));
    if (sidePanes.length !== sideSet.size) return;
    const otherSide = remotePanes.value.filter((pane) => pane.side !== side);
    remotePanes.value = side === "left" ? [...sidePanes, ...otherSide] : [...otherSide, ...sidePanes];
  }

  function setRemotePanesOrder(side: SftpWorkspaceSide, nextSidePanes: SftpRemotePane[]) {
    const otherSide = remotePanes.value.filter((pane) => pane.side !== side);
    remotePanes.value = side === "left" ? [...nextSidePanes, ...otherSide] : [...otherSide, ...nextSidePanes];
  }

  function moveRemotePaneToSide(id: string, targetSide: SftpWorkspaceSide) {
    const pane = remotePanes.value.find((item) => item.id === id);
    if (!pane || pane.side === targetSide || pane.pinned) return false;

    const sourceSide = pane.side;
    pane.side = targetSide;
    const orderedForSide = (side: SftpWorkspaceSide) => {
      const sidePanes = remotePanes.value.filter((item) => item.side === side);
      return [...sidePanes.filter((item) => item.pinned), ...sidePanes.filter((item) => !item.pinned)];
    };
    remotePanes.value = [...orderedForSide("left"), ...orderedForSide("right")];

    if (globalActiveIds[sourceSide] === id) {
      globalActiveIds[sourceSide] =
        panesForSide(sourceSide)[0]?.id ?? (sourceSide === "left" ? defaultGlobalLeftPaneId(isDesktopRuntime) : null);
    }
    globalActiveIds[targetSide] = id;
    activeRemoteId.value = id;
    return true;
  }

  function toggleDualMode() {
    if (remotePanes.value.length) {
      disconnectAllRemotes();
      return;
    }
    openRemoteConnect();
  }

  function focusRemotePane(id: string) {
    activeRemoteId.value = id;
  }

  async function attachRemotePane(input: {
    assetId: string;
    assetName: string;
    tokenId: string;
    side: SftpWorkspaceSide;
    replacePaneId?: string;
  }) {
    const id = paneId();
    const replacementIndex = remotePanes.value.findIndex(
      (pane) => pane.id === input.replacePaneId && pane.side === input.side
    );
    const replacement = replacementIndex >= 0 ? remotePanes.value[replacementIndex] : null;
    const nextPane: SftpRemotePane = {
      id,
      side: input.side,
      assetId: input.assetId,
      context: await buildSftpContext(input.assetId, input.tokenId, `remote-sftp:${input.assetId}:${id}`),
      organizationName: currentOrgLabel.value,
      assetName: input.assetName,
      transferEndpoint: {
        id: `sftp:${input.tokenId}`,
        label: `${currentOrgLabel.value} - ${input.assetName}`
      },
      selection: null,
      pinned: replacement?.pinned || false
    };
    if (replacement) {
      remotePanes.value.splice(replacementIndex, 1, nextPane);
      delete remotePaneRefs.value[replacement.id];
    } else {
      remotePanes.value.push(nextPane);
    }
    activeRemoteId.value = id;
    if (toValue(options.global)) globalActiveIds[input.side] = id;
    return id;
  }

  function rememberRecentConnection(entry: RecentSftpConnection) {
    recentConnections.value = rememberSftpConnection(recentConnections.value, entry);
  }

  async function connectRemoteAsset(asset: KokoSftpAsset) {
    if (remoteConnecting.value) return;
    remoteConnecting.value = true;
    try {
      const connectAsset = await hostAdapter.sftp.prepareAsset(asset);
      if (!assetSupportsSftp(connectAsset.permedProtocols)) {
        toast.add({
          title: options.translate("koko.fileManagement.unsupportedAsset"),
          description: options.translate("koko.fileManagement.unsupportedAssetDescription"),
          color: "warning",
          icon: "i-lucide-circle-alert"
        });
        return;
      }

      const side = toValue(options.global) ? connectSide.value : "right";
      const { tokenId } = await createSftpSession(connectAsset);
      await attachRemotePane({
        assetId: connectAsset.id,
        assetName: connectAsset.name,
        tokenId,
        side
      });
      connectModalOpen.value = false;
      rememberRecentConnection({
        assetId: connectAsset.id,
        assetName: connectAsset.name,
        organizationId: currentOrgId.value,
        organizationName: currentOrgLabel.value,
        lastConnectedAt: Date.now()
      });
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.remoteConnectFailed"), error);
    } finally {
      remoteConnecting.value = false;
    }
  }

  async function reconnectRecent(entry: RecentSftpConnection, side?: SftpWorkspaceSide) {
    if (side) connectSide.value = side;
    await connectRemoteAsset({ id: entry.assetId, name: entry.assetName });
  }

  async function consumePendingPreconnect() {
    if (!toValue(options.global) || preconnecting.value) return;
    const intent = pendingPreconnect.value;
    if (!intent?.assetId) return;

    pendingPreconnect.value = null;
    preconnecting.value = true;
    preconnectingName.value = intent.assetName || intent.assetId;
    globalActiveIds.left = defaultGlobalLeftPaneId(isDesktopRuntime);
    connectSide.value = "right";

    try {
      if (intent.tokenId) {
        await attachRemotePane({
          assetId: intent.assetId,
          assetName: intent.assetName || intent.assetId,
          tokenId: intent.tokenId,
          side: "right"
        });
        return;
      }
      await connectRemoteAsset({ id: intent.assetId, name: intent.assetName || intent.assetId });
    } catch (error) {
      options.showError(options.translate("koko.fileManagement.remoteConnectFailed"), error);
    } finally {
      preconnecting.value = false;
      preconnectingName.value = "";
    }
  }

  function initializeGlobalWorkspace() {
    if (!toValue(options.global)) return;
    globalActiveIds.left = defaultGlobalLeftPaneId(isDesktopRuntime);
    void consumePendingPreconnect();
  }

  watch(currentOrgId, () => {
    remoteAssetSearch.value = "";
  });
  watch(pendingPreconnect, (intent) => {
    if (intent && toValue(options.global)) void consumePendingPreconnect();
  });

  return {
    activePaneForSide,
    activeRemoteId,
    assetTree,
    closeOtherRemotePanes,
    closeRightRemotePanes,
    connectModalOpen,
    connectRemoteAsset,
    connectSide,
    consumePendingPreconnect,
    currentOrgId,
    currentOrgLabel,
    disconnectAllRemotes,
    dualMode,
    focusRemotePane,
    globalActiveIds,
    initializeGlobalWorkspace,
    isDesktopRuntime,
    markRemotePaneConnected,
    openRemoteConnect,
    organizationSelector,
    panesForSide,
    pendingPreconnect,
    preconnecting,
    preconnectingName,
    primaryAssetName,
    primaryAsset,
    primaryContext,
    primaryTransferEndpoint,
    recentConnections,
    reconnectRecent,
    reconnectRemotePane,
    remoteAssetSearch,
    remoteConnecting,
    remotePaneRefs,
    remotePanes,
    removeRemotePane,
    reorderRemotePanes,
    moveRemotePaneToSide,
    setRemotePaneRef,
    setRemotePanesOrder,
    toggleDualMode,
    togglePinRemotePane
  };
}
