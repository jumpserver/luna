import type { ConnectionFormDraft } from "~/composables/useConnectionFormState";
import type { SavedSessionGroup } from "~/composables/useSavedSessionGroups";
import type { WebProxyOpenRequest } from "~/composables/useWebProxyManager";
import type { WorkspaceConnectionProgressStage } from "~/composables/workspaceConnectionProgress";
import type { AssetItem, PermedAccount, PermedProtocol, TokenResponse } from "~/types";
import type { WorkspaceLayout } from "~/utils/workspaceLayout";
import {
  legacyWorkspaceLayout,
  mapWorkspaceLayout,
  removeWorkspaceLayoutPane,
  splitWorkspaceLayout,
  stackWorkspacePanes
} from "~/utils/workspaceLayout";

import { createSharedComposable, useFullscreen } from "@vueuse/core";
import { isKokoBroadcastWorkspace } from "#koko/composables/terminal/useTerminalBroadcast";
import { closeAclScope } from "~/composables/useAclDialog";
import { useRecentConnections } from "~/composables/useRecentConnections";
import {
  getSessionGroupStorageKey,
  persistSessionGroup,
  snapshotSessionPane
} from "~/composables/useSavedSessionGroups";
import { useSettingManager } from "~/composables/useSettingManager";
import { clearWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";
import { createWorkspaceConnectionProgress } from "~/composables/workspaceConnectionProgress";
import { desktopWindow } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export type WorkspaceSessionStatus = "selecting" | "connecting" | "ready" | "connected" | "disconnected" | "failed";
export type WorkspaceSplitDirection = "horizontal" | "vertical";
export type WorkspacePaneDropPlacement = "center" | "left" | "right" | "top" | "bottom";
export type WorkspacePaneMode = "empty" | "setup" | "session";
export type WorkspacePaneLayoutMode = "single" | "columns-2" | "rows-2" | "grid-2x2";

interface WorkspaceSessionPayload {
  id?: string;
  account?: string;
  value?: string;
  token?: TokenResponse | { id?: string; account?: string; value?: string; actions?: unknown[] };
  connectMethod?: { value?: string; component?: string; type?: string };
  endpointUrl?: string;
  webProxy?: WebProxyOpenRequest;
  webUrl?: string;
  actions?: unknown[];
  scriptId?: string;
  name?: string;
  args?: string;
  module?: string;
  comment?: string;
  scope?: "private" | "public";
  variable?: unknown[];
  disableautohash?: unknown;
  [key: string]: unknown;
}

export interface WorkspaceSurfaceSession {
  id: string;
  assetId: string;
  assetName: string;
  assetType: string;
  assetPlatform: string;
  assetCategory: string;
  orgId?: string;
  address: string;
  permedProtocols?: PermedProtocol[];
  permedAccounts?: PermedAccount[];
  protocol: string;
  account: string;
  connectMethod?: string;
  status: WorkspaceSessionStatus;
  connectedAt?: number;
  connectionProgress?: WorkspaceConnectionProgressStage;
  resumeSetupOnFailure?: boolean;
  connectionFailure?: string;
  connectionFailureDismissible?: boolean;
  setupDraft?: ConnectionFormDraft;
  payload?: WorkspaceSessionPayload;
  setupAsset?: AssetItem;
}

export interface WorkspacePane extends WorkspaceSurfaceSession {
  mode: WorkspacePaneMode;
}

export interface WorkspaceTabGroup {
  id: string;
  title: string;
  collapsed: boolean;
  saved?: boolean;
  storageKey?: string;
  restoring?: boolean;
  savePending?: boolean;
}

export interface WorkspaceSessionTab extends WorkspaceSurfaceSession {
  title?: string;
  savedTabId?: string;
  group?: WorkspaceTabGroup;
  // Retained for older saved groups; paneLayout owns the current geometry.
  layoutMode: WorkspacePaneLayoutMode;
  threePaneSpanAxis?: "columns" | "rows";
  paneLayout?: WorkspaceLayout;
  panes: WorkspacePane[];
}

export interface ScriptEditorInput {
  id?: string;
  name?: string;
  args?: string;
  module: string;
  comment?: string;
  scope?: "private" | "public";
  variable?: unknown[];
}

const tabs = ref<WorkspaceSessionTab[]>([]);
const activeTabId = ref("");
interface TemporaryWorkspaceLayout {
  targetId: string;
  imports: WorkspaceSessionTab[];
  order: string[];
  paneIds: Set<string>;
  layout: WorkspaceLayout;
  explicitLayout: boolean;
  activePaneId: string;
}
let temporaryLayout: TemporaryWorkspaceLayout | undefined;
let restoringTemporaryLayout = false;
// Groups belong to their tabs, so closing or merging the last member removes the group too.
const tabGroups = computed(() => [
  ...new Map(tabs.value.flatMap((tab) => (tab.group ? [[tab.group.id, tab.group] as const] : []))).values()
]);
// Refresh connection choices, but closing tabs/panes must not erase the reusable group.
watch(
  () =>
    tabs.value.flatMap((tab) => tab.panes.map((pane) => [pane.id, JSON.stringify(snapshotSessionPane(pane))] as const)),
  (next, previous) => {
    if (restoringTemporaryLayout) return;
    const before = new Map(previous);
    const changed = new Set(next.filter(([id, value]) => before.has(id) && before.get(id) !== value).map(([id]) => id));
    for (const group of tabGroups.value) {
      if (
        !group.restoring &&
        tabs.value.some((tab) => tab.group?.id === group.id && tab.panes.some((pane) => changed.has(pane.id)))
      )
        persistSessionGroup(group, tabs.value);
    }
  },
  { flush: "sync" }
);
const expandTabGroup = (tabId: string) => {
  const group = tabs.value.find((tab) => tab.id === tabId)?.group;
  if (group) group.collapsed = false;
};
watch(activeTabId, expandTabGroup, { flush: "sync" });
const activePaneId = ref("");
const draggedTabId = ref("");
const focusModeTabId = ref("");
const workspaceFullscreen = ref(false);
const nativeFullscreen = ref(false);
const pendingPaneTarget = ref<{ tabId: string; paneId: string } | null>(null);
const SIDEBAR_COLLAPSE_DURATION = 240;
let restoreSidebarAfterFullscreen = false;
let desktopFullscreenListening = false;
const leaveWorkspaceFullscreen = () => {
  if (!workspaceFullscreen.value) return;
  workspaceFullscreen.value = false;
  focusModeTabId.value = "";
  if (restoreSidebarAfterFullscreen) useSettingManager().collapse.value = false;
  restoreSidebarAfterFullscreen = false;
};
const listenDesktopFullscreen = () => {
  if (desktopFullscreenListening || !import.meta.client) return;
  desktopFullscreenListening = true;
  void desktopWindow.onFullscreenChanged((full) => {
    nativeFullscreen.value = full;
    if (!full) leaveWorkspaceFullscreen();
  });
};
const useSharedDocumentFullscreen = createSharedComposable(() => {
  const fullscreen = useFullscreen();

  watch(fullscreen.isFullscreen, (full) => {
    if (!full) leaveWorkspaceFullscreen();
  });

  return fullscreen;
});
let tabSequence = 0;
let paneSequence = 0;
let sessionDisposer: ((id: string) => void | Promise<void>) | null = null;
const sessionCloseGuards = new Map<string, () => boolean | Promise<boolean>>();
let aiTaskTabCloseConfirm: ((tabIds: string[]) => Promise<boolean>) | null = null;

export const registerAiTaskTabCloseConfirm = (confirm: ((tabIds: string[]) => Promise<boolean>) | null) => {
  aiTaskTabCloseConfirm = confirm;
  return () => {
    if (aiTaskTabCloseConfirm === confirm) aiTaskTabCloseConfirm = null;
  };
};

export const registerWorkspaceSessionCloseGuard = (sessionId: string, guard: () => boolean | Promise<boolean>) => {
  sessionCloseGuards.set(sessionId, guard);
  return () => {
    if (sessionCloseGuards.get(sessionId) === guard) sessionCloseGuards.delete(sessionId);
  };
};

const blankSurface = (): Omit<WorkspaceSurfaceSession, "id"> => ({
  assetId: "",
  assetName: "",
  assetType: "",
  assetPlatform: "",
  assetCategory: "",
  orgId: undefined,
  address: "",
  permedProtocols: undefined,
  permedAccounts: undefined,
  protocol: "",
  account: "",
  connectMethod: undefined,
  status: "selecting",
  connectedAt: undefined,
  connectionProgress: undefined,
  resumeSetupOnFailure: undefined,
  connectionFailure: undefined,
  connectionFailureDismissible: undefined,
  setupDraft: undefined,
  payload: undefined,
  setupAsset: undefined
});

const createTabId = (assetId: string, protocol: string, account: string) => {
  tabSequence += 1;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${tabSequence}`;
  return `${assetId}:${protocol}:${account || "-"}:${random}`;
};

const createPaneId = (tabId: string) => {
  paneSequence += 1;
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${paneSequence}`;
  return `pane:${tabId}:${random}`;
};

const createPane = (id: string, session: Partial<WorkspaceSurfaceSession>, mode: WorkspacePaneMode): WorkspacePane => ({
  id,
  ...blankSurface(),
  ...session,
  mode
});

const createEmptyPane = (tabId: string) => createPane(createPaneId(tabId), {}, "empty");

const syncTabFromPrimaryPane = (tab: WorkspaceSessionTab) => {
  const primaryPane = tab.panes[0];
  if (!primaryPane) return;

  tab.assetId = primaryPane.assetId;
  tab.assetName = primaryPane.assetName;
  tab.assetType = primaryPane.assetType;
  tab.assetPlatform = primaryPane.assetPlatform;
  tab.assetCategory = primaryPane.assetCategory;
  tab.orgId = primaryPane.orgId;
  tab.address = primaryPane.address;
  tab.permedProtocols = primaryPane.permedProtocols;
  tab.permedAccounts = primaryPane.permedAccounts;
  tab.protocol = primaryPane.protocol;
  tab.account = primaryPane.account;
  tab.connectMethod = primaryPane.connectMethod;
  tab.status = primaryPane.status;
  tab.connectedAt = primaryPane.connectedAt;
  tab.connectionProgress = primaryPane.connectionProgress;
  tab.resumeSetupOnFailure = primaryPane.resumeSetupOnFailure;
  tab.connectionFailure = primaryPane.connectionFailure;
  tab.connectionFailureDismissible = primaryPane.connectionFailureDismissible;
  tab.setupDraft = primaryPane.setupDraft;
  tab.payload = primaryPane.payload;
  tab.setupAsset = primaryPane.setupAsset;
};

const setLayoutForPaneCount = (
  tab: WorkspaceSessionTab,
  count = tab.panes.length,
  preferredDirection?: WorkspaceSplitDirection
) => {
  if (count <= 1) {
    tab.layoutMode = "single";
    tab.threePaneSpanAxis = undefined;
    return;
  }

  if (count === 2) {
    tab.threePaneSpanAxis = undefined;
    if (preferredDirection) {
      tab.layoutMode = preferredDirection === "vertical" ? "columns-2" : "rows-2";
      return;
    }

    tab.layoutMode = tab.layoutMode === "rows-2" ? "rows-2" : "columns-2";
    return;
  }

  tab.layoutMode = "grid-2x2";
  if (count === 3) {
    tab.threePaneSpanAxis ||= preferredDirection === "horizontal" ? "columns" : "rows";
  } else {
    tab.threePaneSpanAxis = undefined;
  }
};

const paneLayoutFor = (tab: WorkspaceSessionTab) =>
  tab.paneLayout ||
  legacyWorkspaceLayout(
    tab.panes.map((pane) => pane.id),
    tab.layoutMode,
    tab.threePaneSpanAxis
  );

function projectTemporaryLayout(current: WorkspaceSessionTab[], snapshot: TemporaryWorkspaceLayout) {
  const target = current.find((tab) => tab.id === snapshot.targetId);
  if (!target || !snapshot.imports.length) return current;
  const restoredImports = snapshot.imports.flatMap((tab) => {
    const pane = target.panes.find((pane) => pane.id === tab.panes[0]?.id);
    return pane ? [{ ...tab, panes: [pane] }] : [];
  });
  const borrowed = new Set(restoredImports.flatMap((tab) => tab.panes.map((pane) => pane.id)));
  const retained = target.panes.filter((pane) => !borrowed.has(pane.id));
  const remaining = [
    ...[...snapshot.paneIds].flatMap((id) => retained.filter((pane) => pane.id === id)),
    ...retained.filter((pane) => !snapshot.paneIds.has(pane.id))
  ];
  const liveIds = new Set(remaining.map((pane) => pane.id));
  let layout: WorkspaceLayout | undefined = snapshot.layout;
  for (const id of snapshot.paneIds) {
    if (!liveIds.has(id) && layout) layout = removeWorkspaceLayoutPane(layout, id);
  }
  const added = remaining.filter((pane) => !snapshot.paneIds.has(pane.id));
  if (added.length) {
    const extraLayout = stackWorkspacePanes(
      added.map((pane) => pane.id),
      "horizontal"
    );
    // ponytail: new panes stack beside the restored subtree; retaining their edited positions needs a tree merge.
    layout = layout
      ? { type: "split", direction: "vertical", ratio: 50, first: layout, second: extraLayout }
      : extraLayout;
  }
  const layoutMode: WorkspacePaneLayoutMode =
    remaining.length === 1
      ? "single"
      : remaining.length > 2
        ? "grid-2x2"
        : layout?.type === "split" && layout.direction === "horizontal"
          ? "rows-2"
          : "columns-2";
  const threePaneSpanAxis =
    remaining.length === 3 && layout?.type === "split"
      ? layout.direction === "horizontal"
        ? ("columns" as const)
        : ("rows" as const)
      : undefined;
  const projected = current.flatMap((tab) =>
    tab !== target
      ? [tab]
      : remaining.length
        ? [
            {
              ...target,
              panes: remaining,
              paneLayout:
                !snapshot.explicitLayout && !added.length && remaining.length === snapshot.paneIds.size
                  ? undefined
                  : layout,
              layoutMode,
              threePaneSpanAxis
            }
          ]
        : []
  );
  for (const tab of restoredImports) {
    const index = snapshot.order.indexOf(tab.id);
    const next = snapshot.order.slice(index + 1).find((id) => projected.some((item) => item.id === id));
    const previous = snapshot.order
      .slice(0, index)
      .reverse()
      .find((id) => projected.some((item) => item.id === id));
    const position = next
      ? projected.findIndex((item) => item.id === next)
      : previous
        ? projected.findIndex((item) => item.id === previous) + 1
        : projected.length;
    projected.splice(position, 0, tab);
  }
  return projected;
}

// Saved groups describe the durable workspace even while its sessions are temporarily gathered.
export function getWorkspaceTabsForPersistence(current: WorkspaceSessionTab[]) {
  return temporaryLayout ? projectTemporaryLayout(current, temporaryLayout) : current;
}

const createTabFromPane = (pane: WorkspacePane): WorkspaceSessionTab => {
  const tab: WorkspaceSessionTab = {
    ...blankSurface(),
    ...pane,
    title: undefined,
    layoutMode: "single",
    panes: [pane]
  };

  syncTabFromPrimaryPane(tab);
  return tab;
};

const closeNativeSession = (id: string) => {
  Promise.resolve(sessionDisposer?.(id)).catch(() => {});
};

const canCloseWorkspaceSession = async (id: string) => {
  const guard = sessionCloseGuards.get(id);
  if (!guard) return true;

  try {
    return (await guard()) !== false;
  } catch {
    return false;
  }
};

const findPane = (paneId: string) => {
  for (const tab of tabs.value) {
    const paneIndex = tab.panes.findIndex((pane) => pane.id === paneId);
    if (paneIndex !== -1) return { tab, pane: tab.panes[paneIndex]!, paneIndex };
  }

  return null;
};

const getFirstPaneId = (tab: WorkspaceSessionTab | null | undefined) => tab?.panes[0]?.id || "";

const activatePane = (paneId: string) => {
  const match = findPane(paneId);
  if (!match) {
    activePaneId.value = "";
    return false;
  }

  activeTabId.value = match.tab.id;
  activePaneId.value = paneId;
  return true;
};

const ensureActivePaneForTab = (tabId: string) => {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) {
    if (activeTabId.value === tabId) activePaneId.value = "";
    return;
  }

  const hasActivePane = tab.panes.some((pane) => pane.id === activePaneId.value);
  if (!hasActivePane) activePaneId.value = getFirstPaneId(tab);
};

function applyProjectedWorkspaceTabs(projected: WorkspaceSessionTab[], imports: WorkspaceSessionTab[]) {
  const originalTabs = new Map([...tabs.value, ...imports].map((tab) => [tab.id, tab]));
  const wasRestoring = restoringTemporaryLayout;
  restoringTemporaryLayout = true;
  try {
    tabs.value = projected.map((projectedTab) => {
      const tab = originalTabs.get(projectedTab.id)!;
      tab.panes = projectedTab.panes;
      tab.paneLayout = projectedTab.paneLayout;
      tab.layoutMode = projectedTab.layoutMode;
      tab.threePaneSpanAxis = projectedTab.threePaneSpanAxis;
      setLayoutForPaneCount(tab);
      syncTabFromPrimaryPane(tab);
      return tab;
    });
  } finally {
    restoringTemporaryLayout = wasRestoring;
  }
}

function restoreTemporaryWorkspaceLayout(snapshot = temporaryLayout) {
  if (!snapshot || temporaryLayout !== snapshot) return;
  const projected = projectTemporaryLayout(tabs.value, snapshot);
  const wasActive = activeTabId.value === snapshot.targetId;
  restoringTemporaryLayout = true;
  try {
    applyProjectedWorkspaceTabs(projected, snapshot.imports);
    if (wasActive || !tabs.value.some((tab) => tab.id === activeTabId.value)) {
      const selected = findPane(snapshot.activePaneId) || findPane(activePaneId.value);
      activeTabId.value = selected?.tab.id || tabs.value[0]?.id || "";
      activePaneId.value = selected?.pane.id || "";
    }
    ensureActivePaneForTab(activeTabId.value);
    if (pendingPaneTarget.value) {
      const match = findPane(pendingPaneTarget.value.paneId);
      pendingPaneTarget.value = match ? { tabId: match.tab.id, paneId: match.pane.id } : null;
    }
    if (focusModeTabId.value === snapshot.targetId && !tabs.value.some((tab) => tab.id === snapshot.targetId))
      focusModeTabId.value = activeTabId.value;
  } finally {
    temporaryLayout = undefined;
    restoringTemporaryLayout = false;
  }
}

const findSession = (match: { tabId?: string; assetId: string; protocol: string; account: string }) => {
  if (match.tabId) return findPane(match.tabId);

  for (const tab of tabs.value) {
    const paneIndex = tab.panes.findIndex(
      (pane) => pane.assetId === match.assetId && pane.protocol === match.protocol && pane.account === match.account
    );
    if (paneIndex !== -1) return { tab, pane: tab.panes[paneIndex]!, paneIndex };
  }

  return null;
};

const connectionProgress = createWorkspaceConnectionProgress({
  findPane,
  findSession,
  syncTabFromPrimaryPane,
  setActivePaneId: (paneId) => {
    activePaneId.value = paneId;
  },
  closeNativeSession
});

const replacePane = (tab: WorkspaceSessionTab, paneIndex: number, pane: WorkspacePane) => {
  tab.panes.splice(paneIndex, 1, pane);
  if (paneIndex === 0) syncTabFromPrimaryPane(tab);
};

const resolvePendingTarget = (explicitPaneId?: string) => {
  if (explicitPaneId) {
    if (pendingPaneTarget.value?.paneId === explicitPaneId) pendingPaneTarget.value = null;
    return findPane(explicitPaneId);
  }
  const pending = pendingPaneTarget.value;
  pendingPaneTarget.value = null;
  if (!pending) return null;
  return findPane(pending.paneId);
};

export const useWorkspaceTabs = () => {
  const desktopRuntime = isDesktopRuntime();
  if (desktopRuntime) listenDesktopFullscreen();
  const webFullscreen = desktopRuntime ? null : useSharedDocumentFullscreen();
  const { collapse } = useSettingManager();
  const collapseSidebar = async () => {
    collapse.value = true;
    await new Promise<void>((resolve) => setTimeout(resolve, SIDEBAR_COLLAPSE_DURATION));
  };
  const setRuntimeFullscreen = async (fullscreen: boolean) => {
    if (desktopRuntime) {
      await desktopWindow.setFullscreen(fullscreen);
      return;
    }

    if (fullscreen) await webFullscreen!.enter();
    else await webFullscreen!.exit();
  };

  const exitFocusMode = async () => {
    const shouldExitFullscreen = workspaceFullscreen.value;
    focusModeTabId.value = "";
    leaveWorkspaceFullscreen();
    if (shouldExitFullscreen) await setRuntimeFullscreen(false).catch(() => {});
  };

  const registerSessionDisposer = (disposer: ((id: string) => void | Promise<void>) | null) => {
    sessionDisposer = disposer;
  };

  const openSession = (
    asset: AssetItem,
    connection: {
      protocol: string;
      account: string;
      connectMethod?: string;
      payload?: WorkspaceSessionPayload;
      paneId?: string;
      newTab?: boolean;
    }
  ) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = connection.protocol || asset.savedConnection?.protocol || "ssh";
    const account = connection.account || asset.savedConnection?.username || "";
    const target = connection.newTab ? null : resolvePendingTarget(connection.paneId);

    const pane = createPane(
      target?.pane.id || createTabId(asset.id, protocol, account),
      {
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.type || "",
        assetPlatform: asset.platform || "",
        assetCategory: asset.category || "",
        orgId: asset.org_id,
        address: asset.address,
        permedProtocols: asset.permedProtocols,
        permedAccounts: asset.permedAccounts,
        protocol,
        account,
        connectMethod: connection.connectMethod,
        status: connection.payload ? "ready" : "connecting",
        payload: connection.payload,
        setupAsset: undefined
      },
      "session"
    );

    if (target) {
      replacePane(target.tab, target.paneIndex, pane);
      activeTabId.value = target.tab.id;
      activePaneId.value = pane.id;
      return pane;
    }

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const openSetupSession = (
    asset: AssetItem,
    options: { protocol?: string; paneId?: string; newTab?: boolean } = {}
  ) => {
    useRecentConnections().recordRecentConnection(asset);
    const protocol = options.protocol || asset.savedConnection?.protocol || "";
    const account = asset.savedConnection?.username || "";
    const target = options.newTab ? null : resolvePendingTarget(options.paneId);

    const pane = createPane(
      target?.pane.id || createTabId(asset.id, protocol || "setup", account),
      {
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.type || "",
        assetPlatform: asset.platform || "",
        assetCategory: asset.category || "",
        orgId: asset.org_id,
        address: asset.address,
        permedProtocols: asset.permedProtocols,
        permedAccounts: asset.permedAccounts,
        protocol,
        account,
        status: "selecting",
        setupAsset: asset,
        payload: undefined,
        connectedAt: undefined
      },
      "setup"
    );

    if (target) {
      replacePane(target.tab, target.paneIndex, pane);
      activeTabId.value = target.tab.id;
      activePaneId.value = pane.id;
      return pane;
    }

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const openLocalShell = (displayName = "Local Shell") => {
    const pane = createPane(
      createTabId("local", "local-shell", ""),
      {
        assetId: "local",
        assetName: displayName,
        assetType: "local",
        assetPlatform: "",
        assetCategory: "terminal",
        address: "",
        protocol: "local-shell",
        account: "",
        status: "ready"
      },
      "session"
    );

    const tab = createTabFromPane(pane);
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  const openScriptEditor = (script: ScriptEditorInput) => {
    const existing = script.id
      ? tabs.value.find((tab) => tab.protocol === "script-editor" && tab.payload?.scriptId === script.id)
      : null;
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = getFirstPaneId(existing);
      return existing.panes[0];
    }

    const tabId = createTabId(script.id || "new-script", "script-editor", "");
    const pane = createPane(
      tabId,
      {
        assetId: script.id || tabId,
        assetName: script.name || "Untitled script",
        assetType: "script",
        assetPlatform: script.module,
        assetCategory: "script",
        address: "",
        protocol: "script-editor",
        account: "",
        status: "ready",
        payload: {
          scriptId: script.id,
          name: script.name || "",
          args: script.args || "",
          module: script.module,
          comment: script.comment || "",
          scope: script.scope || "private",
          variable: script.variable || []
        }
      },
      "session"
    );
    const tab = createTabFromPane(pane);
    tab.title = script.name || "Untitled script";
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return pane;
  };

  function removeSession(tab: WorkspaceSessionTab) {
    const index = tabs.value.findIndex((item) => item.id === tab.id);
    if (index === -1) return false;

    for (const pane of tab.panes) {
      pendingPaneTarget.value = pendingPaneTarget.value?.paneId === pane.id ? null : pendingPaneTarget.value;
      sessionCloseGuards.delete(pane.id);
      void closeAclScope(pane.id);
      connectionProgress.clearConnectionProgress(pane);
      clearWorkspaceSessionDetails(pane.id);
      closeNativeSession(pane.id);
    }

    tabs.value.splice(index, 1);
    if (focusModeTabId.value === tab.id) void exitFocusMode();

    if (activeTabId.value === tab.id) {
      activeTabId.value = tabs.value[Math.max(index - 1, 0)]?.id || tabs.value[0]?.id || "";
    }
    ensureActivePaneForTab(activeTabId.value);
    return true;
  }

  async function canCloseTab(tab: WorkspaceSessionTab) {
    for (const pane of tab.panes) {
      if (!(await canCloseWorkspaceSession(pane.id))) return false;
    }
    return true;
  }

  async function closeSession(id: string, assertCurrent: () => void = () => {}) {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) {
      return closePane(id, assertCurrent);
    }

    const tab = tabs.value[index]!;
    if (aiTaskTabCloseConfirm && !(await aiTaskTabCloseConfirm([tab.id]))) return false;
    const originalPanes = [...tab.panes];
    if (!(await canCloseTab(tab))) return false;
    assertCurrent();
    if (
      tabs.value.find((item) => item.id === id) !== tab ||
      tab.panes.length !== originalPanes.length ||
      tab.panes.some((pane, index) => pane !== originalPanes[index])
    )
      return false;
    return removeSession(tab);
  }

  async function closePane(paneId: string, assertCurrent: () => void = () => {}) {
    const match = findPane(paneId);
    if (!match) return false;

    const { tab, pane, paneIndex } = match;
    if (aiTaskTabCloseConfirm && !(await aiTaskTabCloseConfirm([tab.id]))) return false;
    if (!(await canCloseWorkspaceSession(pane.id))) return false;
    assertCurrent();
    const current = findPane(paneId);
    if (current?.tab !== tab || current.pane !== pane || current.paneIndex !== paneIndex) return false;
    if (tab.panes.length === 1) {
      return removeSession(tab);
    }

    pendingPaneTarget.value = pendingPaneTarget.value?.paneId === paneId ? null : pendingPaneTarget.value;

    sessionCloseGuards.delete(pane.id);
    void closeAclScope(pane.id);
    connectionProgress.clearConnectionProgress(pane);
    clearWorkspaceSessionDetails(pane.id);
    closeNativeSession(pane.id);
    tab.paneLayout = removeWorkspaceLayoutPane(paneLayoutFor(tab), paneId);
    tab.panes.splice(paneIndex, 1);
    setLayoutForPaneCount(tab);
    syncTabFromPrimaryPane(tab);
    if (activePaneId.value === paneId) activePaneId.value = getFirstPaneId(tab);
    return true;
  }

  const closeTabs = async (targets: WorkspaceSessionTab[]) => {
    if (aiTaskTabCloseConfirm && targets.length && !(await aiTaskTabCloseConfirm(targets.map((tab) => tab.id))))
      return false;
    for (const tab of targets) {
      if (!(await canCloseTab(tab))) return false;
    }
    for (const tab of targets) removeSession(tab);
    return true;
  };

  const closeAllSessions = async (options?: { force?: boolean }) => {
    if (options?.force === true) {
      for (const tab of [...tabs.value]) removeSession(tab);
      pendingPaneTarget.value = null;
      return true;
    }

    const closed = await closeTabs([...tabs.value]);
    if (closed) pendingPaneTarget.value = null;
    return closed;
  };

  const closeOtherSessions = async (id: string) => {
    if (!tabs.value.some((tab) => tab.id === id)) return false;
    if (!(await closeTabs(tabs.value.filter((tab) => tab.id !== id)))) return false;
    pendingPaneTarget.value = pendingPaneTarget.value?.tabId === id ? pendingPaneTarget.value : null;
    activeTabId.value = id;
    ensureActivePaneForTab(id);
    return true;
  };

  const closeLeftSessions = async (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) return false;
    return closeTabs(tabs.value.slice(0, index));
  };

  const closeRightSessions = async (id: string) => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    if (index === -1) return false;
    return closeTabs(tabs.value.slice(index + 1));
  };

  const reorderTabs = (sourceTabId: string, targetTabId: string, placement: "before" | "after" = "before") => {
    if (sourceTabId === targetTabId) return false;
    const sourceIndex = tabs.value.findIndex((tab) => tab.id === sourceTabId);
    const targetIndex = tabs.value.findIndex((tab) => tab.id === targetTabId);
    if (sourceIndex === -1 || targetIndex === -1) return false;

    const targetGroup = tabs.value[targetIndex]!.group;
    const [sourceTab] = tabs.value.splice(sourceIndex, 1);
    const previousGroup = sourceTab!.group;
    const normalizedTargetIndex = tabs.value.findIndex((tab) => tab.id === targetTabId);
    if (normalizedTargetIndex === -1) return false;
    const insertIndex = placement === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex;
    sourceTab!.group = targetGroup;
    tabs.value.splice(insertIndex, 0, sourceTab!);
    if (sourceTabId === activeTabId.value) expandTabGroup(sourceTabId);
    if (previousGroup) persistSessionGroup(previousGroup, tabs.value);
    if (targetGroup) persistSessionGroup(targetGroup, tabs.value);
    return true;
  };

  const moveTabToGroup = (tabId: string, groupId?: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    const group = groupId ? tabGroups.value.find((item) => item.id === groupId) : undefined;
    if (!tab || (groupId && !group)) return false;
    if (tab.group?.id === groupId) return true;

    // Keep every group contiguous, including when removing one of its middle tabs.
    const anchorGroupId = groupId || tab.group?.id;
    const previousGroup = tab.group;
    const sourceIndex = tabs.value.indexOf(tab);
    tabs.value.splice(sourceIndex, 1);
    const lastMember = tabs.value.findLastIndex((item) => item.group?.id === anchorGroupId);
    tab.group = group;
    tabs.value.splice(lastMember < 0 ? sourceIndex : lastMember + 1, 0, tab);
    if (tabId === activeTabId.value) expandTabGroup(tabId);
    if (previousGroup) persistSessionGroup(previousGroup, tabs.value);
    if (group) persistSessionGroup(group, tabs.value);
    return true;
  };

  const createTabGroup = (tabId: string, title: string, temporary = false) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || (!temporary && !title.trim())) return null;
    moveTabToGroup(tabId);
    tab.group = {
      id: createTabId("group", "tabs", ""),
      title: title.trim(),
      collapsed: false,
      saved: !temporary,
      storageKey: temporary ? undefined : getSessionGroupStorageKey()
    };
    persistSessionGroup(tab.group, tabs.value);
    return tab.group;
  };

  const groupTabs = (sourceTabId: string, targetTabId: string) => {
    if (sourceTabId === targetTabId || !tabs.value.some((tab) => tab.id === sourceTabId)) return false;
    const target = tabs.value.find((tab) => tab.id === targetTabId);
    if (!target) return false;
    const group = target.group || createTabGroup(targetTabId, "", true);
    return group ? moveTabToGroup(sourceTabId, group.id) : false;
  };

  const renameTabGroup = (groupId: string, title: string) => {
    const group = tabGroups.value.find((item) => item.id === groupId);
    if (!group || !title.trim()) return false;
    if (group.storageKey && group.storageKey !== getSessionGroupStorageKey()) return false;
    group.title = title.trim();
    group.saved = true;
    group.storageKey = getSessionGroupStorageKey();
    persistSessionGroup(group, tabs.value);
    return true;
  };

  const toggleTabGroup = (groupId: string) => {
    const group = tabGroups.value.find((item) => item.id === groupId);
    if (group) group.collapsed = !group.collapsed;
  };

  const ungroupTabs = (groupId: string) => {
    const group = tabGroups.value.find((item) => item.id === groupId);
    for (const tab of tabs.value) {
      if (tab.group?.id === groupId) tab.group = undefined;
    }
    if (group) persistSessionGroup(group, tabs.value);
  };

  const restoreSessionGroup = (saved: SavedSessionGroup, group: WorkspaceTabGroup) => {
    const existing = tabs.value.filter(
      (tab) => tab.group?.id === group.id && tab.group.storageKey === group.storageKey
    );
    const missing = saved.tabs.filter((item) => !existing.some((tab) => (tab.savedTabId || tab.id) === item.id));
    if (!missing.length) return [];
    const restored = missing.map((item) => {
      const id = createTabId("group", "session", "");
      const panes = item.panes.map((source) => {
        const paneId = createPaneId(id);
        if (source.kind === "empty") return createPane(paneId, {}, "empty");
        if (source.kind === "local-shell")
          return createPane(
            paneId,
            { assetId: "local", assetName: source.name, protocol: "local-shell", status: "ready" },
            isDesktopRuntime() ? "session" : "empty"
          );
        if (source.kind === "script")
          return createPane(
            paneId,
            {
              assetId: source.id,
              assetName: item.title || "",
              protocol: "script-editor",
              status: "connecting",
              payload: { scriptId: source.id }
            },
            "empty"
          );
        const asset = source.asset;
        return createPane(
          paneId,
          {
            assetId: asset.id,
            assetName: asset.name,
            address: asset.address,
            orgId: asset.org_id,
            assetType: asset.type,
            assetPlatform: asset.platform,
            assetCategory: asset.category,
            protocol: source.connection.protocol,
            account: source.connection.username,
            connectMethod: source.connection.connectMethod,
            status: "connecting",
            connectionProgress: "token",
            setupAsset: { ...asset, savedConnection: source.connection }
          },
          "session"
        );
      });
      const tab: WorkspaceSessionTab = {
        ...blankSurface(),
        id,
        savedTabId: item.id,
        title: item.title,
        group,
        panes,
        layoutMode: item.layoutMode,
        threePaneSpanAxis: item.threePaneSpanAxis,
        paneLayout: item.paneLayout ? mapWorkspaceLayout(item.paneLayout, (index) => panes[index]!.id) : undefined
      };
      syncTabFromPrimaryPane(tab);
      return tab;
    });
    tabs.value.push(...restored);
    const opened = tabs.value.slice(-restored.length);
    const members = [...existing, ...opened];
    const ordered = saved.tabs.flatMap((item) => members.filter((tab) => (tab.savedTabId || tab.id) === item.id));
    const firstIndex = tabs.value.findIndex((tab) => members.includes(tab));
    tabs.value = tabs.value.filter((tab) => !members.includes(tab));
    tabs.value.splice(firstIndex, 0, ...ordered, ...members.filter((tab) => !ordered.includes(tab)));
    if (ordered[0]) {
      group.collapsed = false;
      activeTabId.value = ordered[0].id;
      ensureActivePaneForTab(ordered[0].id);
    }
    return opened;
  };

  const canSplitWorkspace = (tabId: string, _direction: WorkspaceSplitDirection) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    return Boolean(tab && tab.protocol !== "script-editor" && !isKokoBroadcastWorkspace(tabId));
  };

  const splitWorkspace = (tabId: string, direction: WorkspaceSplitDirection, paneId = activePaneId.value) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || !canSplitWorkspace(tabId, direction)) return [];
    const target = tab.panes.find((pane) => pane.id === paneId) || tab.panes[0]!;
    const pane = createEmptyPane(tab.id);
    tab.paneLayout = splitWorkspaceLayout(paneLayoutFor(tab), target.id, pane.id, direction);
    tab.panes.push(pane);
    setLayoutForPaneCount(tab, tab.panes.length, direction);
    activePaneId.value = pane.id;
    if (tab.group) persistSessionGroup(tab.group, tabs.value);
    return [pane];
  };

  const persistPaneLayout = (tabId: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab?.group) persistSessionGroup(tab.group, tabs.value);
  };

  const setPaneLayout = (tabId: string, layout: WorkspaceLayout) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab) tab.paneLayout = layout;
  };

  const swapPanes = (tabId: string, sourcePaneId: string, targetPaneId: string) => {
    if (sourcePaneId === targetPaneId) return false;
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return false;

    const sourceIndex = tab.panes.findIndex((pane) => pane.id === sourcePaneId);
    const targetIndex = tab.panes.findIndex((pane) => pane.id === targetPaneId);
    if (sourceIndex === -1 || targetIndex === -1) return false;

    tab.paneLayout = mapWorkspaceLayout(paneLayoutFor(tab), (id) =>
      id === sourcePaneId ? targetPaneId : id === targetPaneId ? sourcePaneId : id
    );
    const panes = [...tab.panes];
    [panes[sourceIndex], panes[targetIndex]] = [panes[targetIndex]!, panes[sourceIndex]!];
    tab.panes = panes;
    syncTabFromPrimaryPane(tab);
    if (tab.group) persistSessionGroup(tab.group, tabs.value);
    return true;
  };

  const placePane = (
    tabId: string,
    sourcePaneId: string,
    targetPaneId: string,
    placement: WorkspacePaneDropPlacement
  ) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || placement === "center") return swapPanes(tabId, sourcePaneId, targetPaneId);
    if (
      sourcePaneId === targetPaneId ||
      !tab.panes.some((pane) => pane.id === sourcePaneId) ||
      !tab.panes.some((pane) => pane.id === targetPaneId)
    )
      return false;
    const remaining = removeWorkspaceLayoutPane(paneLayoutFor(tab), sourcePaneId)!;
    tab.paneLayout = splitWorkspaceLayout(
      remaining,
      targetPaneId,
      sourcePaneId,
      placement === "left" || placement === "right" ? "vertical" : "horizontal",
      placement === "left" || placement === "top"
    );
    if (tab.group) persistSessionGroup(tab.group, tabs.value);
    return true;
  };

  const canMergeTabs = (sourceTabId: string, targetTabId: string, forBroadcast = false) => {
    if (sourceTabId === targetTabId) return false;
    const source = tabs.value.find((tab) => tab.id === sourceTabId);
    const target = tabs.value.find((tab) => tab.id === targetTabId);
    if (!source || !target) return false;

    return (
      source.panes.length === 1 &&
      target.protocol !== "script-editor" &&
      (forBroadcast || !isKokoBroadcastWorkspace(targetTabId))
    );
  };

  const beginTemporaryWorkspaceLayout = (tabId: string, sourceTabIds: string[]) => {
    restoreTemporaryWorkspaceLayout();
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (
      !target ||
      new Set(sourceTabIds).size !== sourceTabIds.length ||
      !sourceTabIds.every((id) => canMergeTabs(id, tabId))
    )
      return null;
    const snapshot: TemporaryWorkspaceLayout = {
      targetId: tabId,
      imports: tabs.value.filter((tab) => sourceTabIds.includes(tab.id)),
      order: tabs.value.map((tab) => tab.id),
      paneIds: new Set(target.panes.map((pane) => pane.id)),
      layout: mapWorkspaceLayout(paneLayoutFor(target), (id) => id),
      explicitLayout: Boolean(target.paneLayout),
      activePaneId: activePaneId.value
    };
    temporaryLayout = snapshot;
    // Close/disconnect callbacks may run before their pane is removed. Restore after that mutation.
    return () =>
      new Promise<void>((resolve) =>
        queueMicrotask(() => {
          restoreTemporaryWorkspaceLayout(snapshot);
          resolve();
        })
      );
  };

  const extendTemporaryWorkspaceLayout = (tabId: string, sourceTabIds: string[]) => {
    const snapshot = temporaryLayout;
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (
      !snapshot ||
      snapshot.targetId !== tabId ||
      !target ||
      !sourceTabIds.every((id) => canMergeTabs(id, tabId, true))
    )
      return false;
    if (!snapshot.imports.length) {
      snapshot.paneIds = new Set(target.panes.map((pane) => pane.id));
      snapshot.layout = mapWorkspaceLayout(paneLayoutFor(target), (id) => id);
      snapshot.explicitLayout = Boolean(target.paneLayout);
    }
    const currentOrder = tabs.value.map((tab) => tab.id);
    for (const [index, id] of currentOrder.entries()) {
      if (snapshot.order.includes(id)) continue;
      const next = currentOrder.slice(index + 1).find((item) => snapshot.order.includes(item));
      snapshot.order.splice(next ? snapshot.order.indexOf(next) : snapshot.order.length, 0, id);
    }
    for (const tab of tabs.value) {
      if (sourceTabIds.includes(tab.id) && !snapshot.imports.some((item) => item.id === tab.id))
        snapshot.imports.push(tab);
    }
    snapshot.imports.sort((a, b) => snapshot.order.indexOf(a.id) - snapshot.order.indexOf(b.id));
    return true;
  };

  const releaseTemporaryWorkspaceTabs = (tabId: string, paneIds: string[]) => {
    const snapshot = temporaryLayout;
    const target = tabs.value.find((tab) => tab.id === tabId);
    if (!snapshot || snapshot.targetId !== tabId || !target) return;
    const released = snapshot.imports.filter((tab) => paneIds.includes(tab.panes[0]!.id));
    if (!released.length) return;
    const rest = snapshot.imports.filter((tab) => !released.includes(tab));
    let projection = snapshot;
    if (rest.length) {
      const ids = new Set(released.map((tab) => tab.panes[0]!.id));
      let layout: WorkspaceLayout | undefined = paneLayoutFor(target);
      for (const id of ids) if (layout) layout = removeWorkspaceLayoutPane(layout, id);
      if (!layout) return;
      projection = {
        ...snapshot,
        imports: released,
        paneIds: new Set(target.panes.filter((pane) => !ids.has(pane.id)).map((pane) => pane.id)),
        layout,
        explicitLayout: true
      };
    }
    const projected = projectTemporaryLayout(tabs.value, projection);
    const active = activePaneId.value;
    snapshot.imports = rest;
    applyProjectedWorkspaceTabs(projected, released);
    if (findPane(active)) activatePane(active);
    else ensureActivePaneForTab(activeTabId.value);
  };

  const mergeTabIntoWorkspace = (
    sourceTabId: string,
    targetTabId: string,
    targetPaneId = "",
    placement: WorkspacePaneDropPlacement = "center",
    forBroadcast = false
  ) => {
    if (!canMergeTabs(sourceTabId, targetTabId, forBroadcast)) return false;

    const sourceIndex = tabs.value.findIndex((tab) => tab.id === sourceTabId);
    const target = tabs.value.find((tab) => tab.id === targetTabId);
    if (sourceIndex === -1 || !target) return false;

    const [source] = tabs.value.splice(sourceIndex, 1);
    if (!source) return false;

    const sourcePane = source.panes[0]!;
    const targetPane = target.panes.find((pane) => pane.id === targetPaneId) || target.panes[0]!;
    target.paneLayout = splitWorkspaceLayout(
      paneLayoutFor(target),
      targetPane.id,
      sourcePane.id,
      placement === "top" || placement === "bottom" ? "horizontal" : "vertical",
      placement === "left" || placement === "top"
    );
    target.panes.push(sourcePane);
    setLayoutForPaneCount(target, target.panes.length);
    syncTabFromPrimaryPane(target);
    if (pendingPaneTarget.value?.tabId === source.id) {
      pendingPaneTarget.value = { tabId: target.id, paneId: pendingPaneTarget.value.paneId };
    }
    activeTabId.value = target.id;
    activePaneId.value = sourcePane.id;
    if (source.group) persistSessionGroup(source.group, tabs.value);
    if (target.group) persistSessionGroup(target.group, tabs.value);
    return true;
  };

  const getTabById = (tabId: string) => tabs.value.find((tab) => tab.id === tabId) || null;

  const beginPaneAssetSelection = (tabId: string, paneId: string) => {
    const match = findPane(paneId);
    if (!match || match.tab.id !== tabId) return;
    pendingPaneTarget.value = { tabId, paneId };
    activeTabId.value = tabId;
    activePaneId.value = paneId;
  };

  const cancelPaneAssetSelection = (paneId?: string) => {
    if (!paneId || pendingPaneTarget.value?.paneId === paneId) pendingPaneTarget.value = null;
  };

  const isPaneAwaitingAssetSelection = (paneId: string) => pendingPaneTarget.value?.paneId === paneId;

  const toSurfaceTab = (pane: WorkspacePane): WorkspaceSessionTab => ({
    ...blankSurface(),
    ...pane,
    title: undefined,
    layoutMode: "single",
    panes: [pane]
  });

  const renameTabTitle = (tabId: string, title: string) => {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) return false;

    tab.title = title.trim() || undefined;
    if (tab.group) persistSessionGroup(tab.group, tabs.value);
    return true;
  };

  const updateSessionPayload = (
    match: { tabId?: string; assetId: string; protocol: string; account: string },
    payload: WorkspaceSessionPayload
  ) => {
    const found = findSession(match);
    if (!found) return;

    found.pane.payload = payload;
    found.pane.connectionFailure = undefined;
    found.pane.connectionFailureDismissible = undefined;
    found.pane.connectMethod = String(payload.connectMethod?.value || found.pane.connectMethod || "") || undefined;
    found.pane.status = "ready";
    found.pane.mode = "session";
    if (found.pane.connectMethod?.endsWith("_guide")) {
      connectionProgress.hideProgressAfterGuide(found);
    }
    if (found.paneIndex === 0) syncTabFromPrimaryPane(found.tab);
  };

  const setSessionConnectMethod = (paneId: string, connectMethod: string) => {
    const match = findPane(paneId);
    if (!match) return;

    match.pane.connectMethod = connectMethod || undefined;
    if (match.paneIndex === 0) syncTabFromPrimaryPane(match.tab);
  };

  const setActiveSession = (id: string) => {
    activeTabId.value = id;
    expandTabGroup(id);
    ensureActivePaneForTab(id);
  };

  const enterFocusMode = (tabId: string) => {
    if (!tabs.value.some((tab) => tab.id === tabId)) return false;

    setActiveSession(tabId);
    focusModeTabId.value = tabId;
    return true;
  };

  const enterFullscreenMode = async (tabId: string) => {
    if (!tabs.value.some((tab) => tab.id === tabId)) return false;

    setActiveSession(tabId);
    restoreSidebarAfterFullscreen = !collapse.value;
    workspaceFullscreen.value = true;
    try {
      if (restoreSidebarAfterFullscreen && desktopRuntime) await collapseSidebar();
      if (!workspaceFullscreen.value) return false;
      await setRuntimeFullscreen(true);
      if (!workspaceFullscreen.value) return false;
      if (restoreSidebarAfterFullscreen && !desktopRuntime) await collapseSidebar();
      if (!workspaceFullscreen.value) return false;
      focusModeTabId.value = tabId;
      return true;
    } catch {
      leaveWorkspaceFullscreen();
      return false;
    }
  };

  const setActivePane = (paneId: string) => {
    activatePane(paneId);
  };

  const activateAdjacentSession = (direction: "previous" | "next") => {
    if (tabs.value.length < 2) return;

    const currentIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value);
    const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      direction === "next"
        ? (normalizedIndex + 1) % tabs.value.length
        : (normalizedIndex - 1 + tabs.value.length) % tabs.value.length;

    activeTabId.value = tabs.value[nextIndex]!.id;
    ensureActivePaneForTab(activeTabId.value);
  };

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);
  const focusMode = computed(() => Boolean(focusModeTabId.value && activeTabId.value === focusModeTabId.value));

  return {
    tabs,
    tabGroups,
    createTabGroup,
    groupTabs,
    restoreSessionGroup,
    moveTabToGroup,
    renameTabGroup,
    toggleTabGroup,
    ungroupTabs,
    activeTab,
    activeTabId,
    activePaneId,
    activateAdjacentSession,
    beginPaneAssetSelection,
    beginTemporaryWorkspaceLayout,
    extendTemporaryWorkspaceLayout,
    releaseTemporaryWorkspaceTabs,
    canSplitWorkspace,
    canCloseWorkspaceSession,
    canMergeTabs,
    cancelPaneAssetSelection,
    closeAllSessions,
    closeLeftSessions,
    closeOtherSessions,
    closePane,
    closeRightSessions,
    closeSession,
    draggedTabId,
    enterFocusMode,
    enterFullscreenMode,
    exitFocusMode,
    focusMode,
    getTabById,
    isPaneAwaitingAssetSelection,
    markSessionConnected: connectionProgress.markSessionConnected,
    getSessionConnectionAttempt: connectionProgress.getSessionConnectionAttempt,
    markSessionConnecting: connectionProgress.markSessionConnecting,
    markSessionTokenCreated: connectionProgress.markSessionTokenCreated,
    markSessionDisconnected: connectionProgress.markSessionDisconnected,
    setSessionConnectMethod,
    markSessionFailed: connectionProgress.markSessionFailed,
    resumeConnectionSetup: connectionProgress.resumeConnectionSetup,
    openLocalShell,
    openScriptEditor,
    openSession,
    openSetupSession,
    placePane,
    persistPaneLayout,
    setPaneLayout,
    reorderTabs,
    registerSessionDisposer,
    renameTabTitle,
    setActivePane,
    setActiveSession,
    splitWorkspace,
    startSessionConnection: connectionProgress.startSessionConnection,
    swapPanes,
    toSurfaceTab,
    updateSessionPayload,
    nativeFullscreen,
    workspaceFullscreen,
    mergeTabIntoWorkspace
  };
};
