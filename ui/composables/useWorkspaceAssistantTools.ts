import type { AgentMcpTool } from "#koko/composables/agent/types";
import type { WorkspacePane, WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { watch } from "vue";
import {
  getLocalShellTerminalSnapshot,
  sendLocalShellTerminalData
} from "#koko/composables/useTerminalSessionRegistry";
import {
  favoriteAsset,
  unfavoriteAsset,
  getAssetDetailRequest,
  getAuthorizedAssets
} from "~/composables/useApiRequest";
import { useFavoriteFolders } from "~/composables/useFavoriteFolders";
import { useRecentConnections } from "~/composables/useRecentConnections";
import { useWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { useRightPanel } from "~/composables/useRightPanel";
import { useSettingManager } from "~/composables/useSettingManager";
import { useSettingsWindow } from "~/composables/useSettingsWindow";
import { useWorkspaceTabMenu } from "~/composables/useWorkspaceTabMenu";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import { useWorkspacePaneSurfaceRegistry } from "~/composables/useWorkspacePaneSurfaceRegistry";
import { isDesktopRuntime } from "~/utils/runtime";

export class WorkspaceOperationError extends Error {}

const id = { type: "string", minLength: 1, maxLength: 1024 };
const assetId = { type: "string", minLength: 1, maxLength: 128 };
const pageSize = { type: "integer", minimum: 1, maximum: 50 };
const offset = { type: "integer", minimum: 0, maximum: 10000 };
const choice = (...values: string[]) => ({ type: "string", enum: values });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { ...read, readOnlyHint: false, idempotentHint: false };
const destructive = { ...write, destructiveHint: true };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  annotations = read
): AgentMcpTool {
  return {
    name,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties, required },
    annotations
  };
}

export const workspaceOperationTools: AgentMcpTool[] = [
  tool(
    "get_workspace_state",
    "Read a credential-free workspace snapshot, or one pane by pane_id. Optional wait_ms waits for connected/failed/closed; ready is not connected. Pagination applies only to the snapshot.",
    { pane_id: id, wait_ms: { type: "integer", minimum: 0, maximum: 30000 }, offset, limit: pageSize }
  ),
  tool(
    "navigate_workspace",
    "Open a Luna page, settings section, panel, tab, pane or authorized asset. id is required only for tab/pane/asset; section only for settings; visible only for panels (default true).",
    {
      target: choice(
        "workspace",
        "files",
        "tools",
        "player",
        "transcode",
        "settings",
        "assets",
        "favorites",
        "session",
        "tab",
        "pane",
        "asset"
      ),
      id,
      section: choice("general", "user", "appearance", "application", "about"),
      visible: { type: "boolean" }
    },
    ["target"]
  ),
  tool(
    "close_sessions",
    "Close exact tab or pane IDs, retaining unsaved-content guards. Returns per-target outcomes.",
    { target: choice("tab", "pane"), ids: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: id } },
    ["target", "ids"],
    destructive
  ),
  tool(
    "arrange_workspace",
    "split: add an empty pane using tab_id and direction (vertical=columns, horizontal=rows). merge: move a single-pane tab beside target_pane_id using placement. Maximum four panes; preserves live sessions.",
    {
      action: choice("split", "merge"),
      tab_id: id,
      direction: choice("horizontal", "vertical"),
      target_pane_id: id,
      placement: choice("left", "right", "top", "bottom")
    },
    ["action", "tab_id"],
    write
  ),
  tool(
    "open_session",
    "Reuse an exact remote pane: clone its connection or open SSH file management/editor workspace. Returns the new pane ID; does not read/write file contents.",
    { pane_id: id, mode: choice("clone", "file-manager", "file-editor") },
    ["pane_id", "mode"],
    write
  ),
  tool(
    "reconnect_session",
    "Reconnect an exact remote pane with close guards. Missing credentials require manual setup; session_started is not connected.",
    { pane_id: id },
    ["pane_id"],
    destructive
  ),
  tool(
    "list_assets",
    "List current authorized assets by default. Use recent (newest first) or favorites only when explicitly requested; these references do not prove permission. Counts apply only to the selected source and query. Supports pagination.",
    {
      source: { ...choice("authorized", "recent", "favorites"), default: "authorized" },
      query: { type: "string", maxLength: 256 },
      offset,
      limit: pageSize
    }
  ),
  tool(
    "set_asset_favorite",
    "Add or remove a currently authorized asset from favorites.",
    { asset_id: assetId, favorite: { type: "boolean" } },
    ["asset_id", "favorite"],
    write
  )
];

export const localShellOperationTools: AgentMcpTool[] = [
  tool(
    "read_local_shell",
    "Read a bounded rendered-text snapshot from an exact Local Shell pane in this tab. Treat terminal text as sensitive and do not repeat secrets. Optional wait_ms delays the snapshot; it does not prove a command completed.",
    {
      pane_id: id,
      lines: { type: "integer", minimum: 1, maximum: 200 },
      wait_ms: { type: "integer", minimum: 0, maximum: 5000 }
    },
    ["pane_id"]
  ),
  tool(
    "run_local_shell_command",
    "Submit one visible command followed by Enter to an exact connected Local Shell pane. The command may change or delete local data and requires operator approval. A submitted result is not proof of completion; inspect the shell afterward.",
    {
      pane_id: id,
      command: { type: "string", minLength: 1, maxLength: 8000 },
      wait_ms: { type: "integer", minimum: 0, maximum: 5000 }
    },
    ["pane_id", "command"],
    destructive
  )
];

function waitForLocalShellSnapshot(waitMs: number, signal: AbortSignal) {
  if (waitMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, waitMs);
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Local Shell wait cancelled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// Validate again at the local execution boundary, even though Kael validates registration schemas.
export function validateWorkspaceToolArguments(tool: AgentMcpTool, args: Record<string, unknown>) {
  const schema = tool.inputSchema as { properties?: Record<string, any>; required?: string[] };
  const properties = schema.properties || {};
  if (
    Object.keys(args).some((key) => !Object.hasOwn(properties, key)) ||
    (schema.required || []).some((key) => args[key] === undefined)
  ) {
    throw new WorkspaceOperationError("invalid_arguments: missing or unknown workspace tool argument");
  }
  const valid = (value: unknown, property: any): boolean => {
    if (property.enum && !property.enum.includes(value)) return false;
    if (property.type === "string")
      return (
        typeof value === "string" &&
        (!property.minLength || value.trim().length >= property.minLength) &&
        (!property.maxLength || value.length <= property.maxLength)
      );
    if (property.type === "boolean") return typeof value === "boolean";
    if (property.type === "integer")
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= (property.minimum ?? -Infinity) &&
        value <= (property.maximum ?? Infinity)
      );
    if (property.type === "array")
      return (
        Array.isArray(value) &&
        value.length >= (property.minItems || 0) &&
        value.length <= property.maxItems &&
        (!property.uniqueItems || new Set(value).size === value.length) &&
        value.every((item) => valid(item, property.items))
      );
    return false;
  };
  for (const [key, value] of Object.entries(args)) {
    if (!valid(value, properties[key])) throw new WorkspaceOperationError(`invalid_arguments: ${key}`);
  }
  const invalidCombination =
    (tool.name === "get_workspace_state" &&
      ((args.wait_ms !== undefined && !args.pane_id) ||
        (args.pane_id !== undefined && (args.offset !== undefined || args.limit !== undefined)))) ||
    (tool.name === "navigate_workspace" &&
      (["tab", "pane", "asset"].includes(String(args.target)) !== (args.id !== undefined) ||
        (args.section !== undefined && args.target !== "settings") ||
        (args.visible !== undefined && !["assets", "favorites", "session"].includes(String(args.target))) ||
        (args.target === "asset" && String(args.id).length > 128))) ||
    (tool.name === "arrange_workspace" &&
      (args.action === "split"
        ? args.direction === undefined || args.target_pane_id !== undefined || args.placement !== undefined
        : args.direction !== undefined || args.target_pane_id === undefined || args.placement === undefined));
  if (invalidCombination) throw new WorkspaceOperationError("invalid_arguments: incompatible target arguments");
}

export function workspacePaneSummary(pane: WorkspacePane) {
  return {
    pane_id: pane.id,
    asset_id: pane.assetId,
    asset_name: pane.assetName.slice(0, 256),
    protocol: pane.protocol,
    account: pane.account.slice(0, 256),
    status: pane.status,
    mode: pane.mode,
    connect_method: String(pane.payload?.connectMethod?.value || pane.connectMethod || "").slice(0, 128)
  };
}

export function findWorkspacePane(tabs: WorkspaceSessionTab[], paneId: string) {
  for (const tab of tabs) {
    const pane = tab.panes.find((item) => item.id === paneId);
    if (pane) return { tab, pane };
  }
  throw new WorkspaceOperationError("session_closed: workspace pane no longer exists");
}

export function requireWorkspaceEmptyPane(
  tabs: WorkspaceSessionTab[],
  paneId: string,
  organizationId: string,
  expected?: WorkspacePane
) {
  const { tab, pane } = findWorkspacePane(tabs, paneId);
  if (
    pane.mode !== "empty" ||
    (expected && pane !== expected) ||
    tab.panes.some((item) => item.orgId && item.orgId !== organizationId)
  ) {
    throw new WorkspaceOperationError("pane_changed: choose an empty pane in the current organization");
  }
  return pane;
}

export function waitWorkspacePane(
  getPane: () => WorkspacePane | undefined,
  signal: AbortSignal,
  timeoutMs: number,
  assertCurrent: () => void
) {
  const initial = getPane();
  if (!initial) return Promise.resolve({ status: "closed" });
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      stop();
      signal.removeEventListener("abort", abort);
    };
    function abort() {
      cleanup();
      reject(new DOMException("Workspace wait cancelled", "AbortError"));
    }
    const inspect = (timedOut = false) => {
      try {
        assertCurrent();
        const pane = getPane();
        if (!pane || pane !== initial || pane.status === "connected" || pane.status === "failed" || timedOut) {
          cleanup();
          resolve(
            !pane
              ? { status: "closed" }
              : pane !== initial
                ? { status: "session_changed" }
                : {
                    status: timedOut && !["connected", "failed"].includes(pane.status) ? "waiting" : pane.status,
                    session: workspacePaneSummary(pane)
                  }
          );
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    timer = setTimeout(() => inspect(true), timeoutMs);
    stop = watch(
      () => [getPane(), getPane()?.status],
      () => inspect(),
      { flush: "sync" }
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else inspect();
  });
}

export function useWorkspaceAssistantTools() {
  const tabs = useWorkspaceTabs();
  const menu = useWorkspaceTabMenu();
  const details = useWorkspaceSessionDetails();
  const favorites = useFavoriteFolders();
  const recent = useRecentConnections();
  const settings = useSettingsWindow();
  const preferences = useSettingManager();
  const rightPanel = useRightPanel();
  const surfaces = useWorkspacePaneSurfaceRegistry();
  const router = useRouter();
  const localePath = useLocalePath();
  const events = useEventBus();
  return {
    tabs,
    menu,
    details,
    favorites,
    recent,
    settings,
    preferences,
    rightPanel,
    surfaces,
    router,
    localePath,
    events
  };
}

export async function executeWorkspaceOperation(
  runtime: ReturnType<typeof useWorkspaceAssistantTools>,
  name: string,
  args: Record<string, any>,
  signal: AbortSignal,
  organizationId: string,
  assertCurrent: () => void,
  tabId: string | null = null
): Promise<Record<string, unknown>> {
  assertCurrent();
  const {
    tabs,
    menu,
    details,
    favorites,
    recent,
    settings,
    preferences,
    rightPanel,
    surfaces,
    router,
    localePath,
    events
  } = runtime;
  const visibleTab = (tab: WorkspaceSessionTab) =>
    (tabId === null || tab.id === tabId) && tab.panes.every((pane) => !pane.orgId || pane.orgId === organizationId);
  const visibleTabs = () => tabs.tabs.value.filter(visibleTab);
  const requireTab = (tabId: string) => {
    const tab = tabs.getTabById(tabId);
    if (!tab || !visibleTab(tab))
      throw new WorkspaceOperationError("session_closed: workspace tab is unavailable in this organization");
    return tab;
  };
  const requirePane = (paneId: string) => {
    const target = findWorkspacePane(tabId === null ? tabs.tabs.value : visibleTabs(), paneId);
    requireTab(target.tab.id);
    return target;
  };
  const page = <T>(items: T[]) => {
    const start = args.offset || 0;
    const limit = args.limit || 20;
    return {
      items: items.slice(start, start + limit),
      total: items.length,
      returned_count: items.slice(start, start + limit).length,
      next_offset: start + limit < items.length ? start + limit : null
    };
  };
  const queryMatches = (value: string) =>
    value.toLocaleLowerCase().includes(String(args.query || "").toLocaleLowerCase());
  const workspacePage = async () => {
    await settings.closeSettings();
    assertCurrent();
    await router.push(localePath({ path: "/" }));
    assertCurrent();
  };
  if (name === "get_workspace_state" && args.pane_id) {
    const { pane } = requirePane(args.pane_id);
    if (!args.wait_ms) return { status: "ok", session: workspacePaneSummary(pane) };
    return waitWorkspacePane(
      () =>
        visibleTabs()
          .flatMap((tab) => tab.panes)
          .find((item) => item.id === args.pane_id),
      signal,
      args.wait_ms,
      assertCurrent
    );
  }
  if (name === "read_local_shell" || name === "run_local_shell_command") {
    const { pane } = requirePane(args.pane_id);
    if (pane.mode !== "session" || pane.protocol !== "local-shell" || pane.status !== "connected") {
      throw new WorkspaceOperationError("unsupported_surface: select a connected Local Shell pane");
    }
    if (name === "run_local_shell_command") {
      const command = String(args.command);
      const hasControlCharacter = [...command].some((character) => {
        const code = character.codePointAt(0) || 0;
        return code < 32 || code === 127;
      });
      if (!command.trim() || hasControlCharacter) {
        throw new WorkspaceOperationError("invalid_arguments: command must be one visible terminal line");
      }
      if (!sendLocalShellTerminalData(pane.id, `${command}\r`)) {
        throw new WorkspaceOperationError("session_closed: Local Shell is no longer available");
      }
    }
    const waitMs = args.wait_ms === undefined ? (name === "run_local_shell_command" ? 500 : 0) : args.wait_ms;
    await waitForLocalShellSnapshot(waitMs, signal);
    assertCurrent();
    if (requirePane(pane.id).pane !== pane) throw new WorkspaceOperationError("session_changed: Local Shell changed");
    const snapshot = getLocalShellTerminalSnapshot(pane.id, args.lines || 80);
    if (!snapshot) throw new WorkspaceOperationError("session_closed: Local Shell is no longer available");
    return {
      status: name === "run_local_shell_command" ? "submitted" : "ok",
      pane_id: pane.id,
      snapshot
    };
  }
  if (name === "get_workspace_state")
    return {
      status: "ok",
      runtime: isDesktopRuntime() ? "desktop" : "web",
      page: router.currentRoute.value.path,
      organization_id: organizationId,
      active_tab_id: tabs.tabs.value.some((tab) => tab.id === tabs.activeTabId.value && visibleTab(tab))
        ? tabs.activeTabId.value
        : "",
      active_pane_id: tabs.tabs.value.some(
        (tab) => visibleTab(tab) && tab.panes.some((pane) => pane.id === tabs.activePaneId.value)
      )
        ? tabs.activePaneId.value
        : "",
      settings: { open: settings.open.value, section: settings.activeSection.value },
      panels: {
        sidebar_visible: !preferences.collapse.value,
        assets: preferences.sidebarSections.value.assets,
        favorites: preferences.sidebarSections.value.favorites,
        session_details: rightPanel.open.value && rightPanel.activeTab.value === "session"
      },
      focus_mode: tabs.focusMode.value,
      fullscreen: tabs.workspaceFullscreen.value,
      ...page(
        visibleTabs().map((tab) => ({
          tab_id: tab.id,
          title: String(tab.title || tab.assetName).slice(0, 128),
          layout: tab.layoutMode,
          panes: tab.panes.map(workspacePaneSummary)
        }))
      )
    };
  if (name === "navigate_workspace" && !["assets", "favorites", "session", "tab", "pane"].includes(args.target)) {
    if (args.target === "settings") {
      await settings.openSettings(`/setting/${args.section || "general"}`);
    } else {
      await settings.closeSettings();
      assertCurrent();
      const paths: Record<string, string> = {
        workspace: "/",
        files: "/files",
        tools: "/tools",
        player: "/videoplayer",
        transcode: "/transcode"
      };
      await router.push(localePath({ path: paths[args.target]! }));
    }
    assertCurrent();
    return { status: "opened", page: args.target };
  }
  if (name === "navigate_workspace" && ["assets", "favorites", "session"].includes(args.target)) {
    const visible = args.visible ?? true;
    await workspacePage();
    if (args.target === "session") {
      if (visible) rightPanel.openWithTab("session");
      else rightPanel.setOpen(false);
    } else {
      preferences.setSidebarSections({ [args.target]: visible });
      if (visible) preferences.setCollapse(false);
    }
    return {
      status: "applied",
      panel: args.target,
      visible:
        args.target === "session"
          ? rightPanel.open.value
          : preferences.sidebarSections.value[args.target as "assets" | "favorites"]
    };
  }
  if (name === "navigate_workspace") {
    await workspacePage();
    if (args.target === "tab") tabs.setActiveSession(requireTab(args.id).id);
    else {
      const { pane } = requirePane(args.id);
      tabs.setActivePane(pane.id);
      surfaces.focusPaneSurface(pane.id);
    }
    return { status: "activated", tab_id: tabs.activeTabId.value, pane_id: tabs.activePaneId.value };
  }
  if (name === "close_sessions") {
    const targets = (args.ids as string[]).map((id) => {
      if (args.target === "pane") return { id, pane: requirePane(id).pane, tab: null, panes: [] as WorkspacePane[] };
      const tab = requireTab(id);
      return { id, tab, pane: null, panes: [...tab.panes] };
    });
    const outcomes: Record<string, unknown>[] = [];
    for (const target of targets) {
      assertCurrent();
      const currentTab = target.tab ? tabs.getTabById(target.id) : null;
      const currentPane = target.pane
        ? tabs.tabs.value.flatMap((tab) => tab.panes).find((pane) => pane.id === target.id)
        : null;
      if (
        (target.tab &&
          (currentTab !== target.tab ||
            currentTab.panes.length !== target.panes.length ||
            currentTab.panes.some((pane, index) => pane !== target.panes[index]))) ||
        (target.pane && currentPane !== target.pane)
      ) {
        outcomes.push({ id: target.id, status: "session_changed" });
        continue;
      }
      const result =
        args.target === "pane"
          ? await tabs.closePane(target.id, assertCurrent)
          : await tabs.closeSession(target.id, assertCurrent);
      outcomes.push({ id: target.id, status: result ? "closed" : "blocked_or_closed" });
    }
    return { status: outcomes.every((item) => item.status === "closed") ? "closed" : "partial", outcomes };
  }
  if (name === "arrange_workspace" && args.action === "split") {
    const tab = requireTab(args.tab_id);
    if (!tabs.canSplitWorkspace(tab.id, args.direction)) return { status: "layout_limit" };
    tabs.setActiveSession(tab.id);
    return { status: "split", panes: tabs.splitWorkspace(tab.id, args.direction).map(workspacePaneSummary) };
  }
  if (name === "arrange_workspace" && args.action === "merge") {
    const source = requireTab(args.tab_id);
    const target = requirePane(args.target_pane_id);
    if ([...source.panes, ...target.tab.panes].some((pane) => pane.protocol === "script-editor"))
      throw new WorkspaceOperationError("unsupported_surface: script editors cannot be merged");
    return {
      status: tabs.mergeTabIntoWorkspace(source.id, target.tab.id, target.pane.id, args.placement)
        ? "merged"
        : "layout_limit"
    };
  }
  if (name === "open_session" && args.mode !== "clone") {
    const { tab, pane } = requirePane(args.pane_id);
    const requestFileToken = details.getSessionDetails(pane.id)?.requestFileToken;
    if (pane.protocol !== "ssh" || pane.status !== "connected" || !requestFileToken)
      throw new WorkspaceOperationError("unsupported_surface: file access is unavailable for this pane");
    const payload = pane.payload;
    const request = async () => {
      const tokenId = await requestFileToken();
      assertCurrent();
      if (requirePane(pane.id).pane !== pane || pane.payload !== payload)
        throw new WorkspaceOperationError("session_changed");
      if (!tokenId) throw new WorkspaceOperationError("file_session_unavailable");
      return tokenId;
    };
    await workspacePage();
    tabs.setActivePane(pane.id);
    if (args.mode === "file-editor") {
      const editor = await menu.openDevelopmentWorkspace(tab, pane, request);
      assertCurrent();
      return editor
        ? { status: "session_started", pane_id: editor.id }
        : { status: "not_opened", reason: "layout_or_session_changed" };
    }
    const tokenId = await request();
    const opened = tabs.openSession(
      {
        id: pane.assetId,
        name: pane.assetName,
        address: pane.address,
        platform: pane.assetPlatform,
        type: pane.assetType,
        category: pane.assetCategory,
        org_id: pane.orgId,
        zone: "",
        isActive: true
      },
      {
        protocol: "sftp",
        account: pane.account,
        connectMethod: SFTP_FILE_MANAGER_VALUE,
        newTab: true,
        payload: {
          id: tokenId,
          token: { id: tokenId },
          connectMethod: { value: SFTP_FILE_MANAGER_VALUE, component: "koko", type: "web" }
        }
      }
    );
    return { status: "session_started", pane_id: opened.id };
  }
  if (name === "open_session" || name === "reconnect_session") {
    const { pane } = requirePane(args.pane_id);
    if (pane.mode !== "session" || ["script-editor", "local-shell"].includes(pane.protocol))
      throw new WorkspaceOperationError("unsupported_surface: select a remote session");
    const payload = pane.payload;
    const assertTarget = () => {
      assertCurrent();
      if (requirePane(pane.id).pane !== pane || pane.payload !== payload)
        throw new WorkspaceOperationError("session_changed: reconnect target changed");
    };
    if (name === "reconnect_session") {
      if (!(await tabs.canCloseWorkspaceSession(pane.id)))
        return { status: "user_action_required", reason: "close_guard" };
      assertTarget();
    }
    return name === "open_session"
      ? await menu.cloneSession(tabs.toSurfaceTab(pane), assertTarget)
      : await menu.reconnectSession(tabs.toSurfaceTab(pane), assertTarget);
  }
  if (name === "list_assets" && (!args.source || args.source === "authorized")) {
    const start = args.offset || 0;
    const limit = args.limit || 20;
    const result = await getAuthorizedAssets(
      { search: String(args.query || "").trim(), offset: start, limit },
      organizationId
    );
    assertCurrent();
    if (!Array.isArray(result.results) || !Number.isSafeInteger(result.count) || result.count < 0)
      throw new WorkspaceOperationError("invalid_asset_response");
    const unique = new Map<string, { asset_id: string; name: string; address: string; is_active: boolean }>();
    for (const asset of result.results.slice(0, limit)) {
      if (asset.org_id && asset.org_id !== organizationId) throw new WorkspaceOperationError("asset_scope_mismatch");
      if (typeof asset.id !== "string" || !asset.id) throw new WorkspaceOperationError("invalid_asset_response");
      unique.set(asset.id, {
        asset_id: asset.id,
        name: String(asset.name || "").slice(0, 256),
        address: String(asset.address || "").slice(0, 256),
        is_active: asset.is_active !== false
      });
    }
    return {
      status: "ok",
      source: "authorized",
      permission_status: "authorized",
      organization_id: organizationId,
      query: String(args.query || "").trim(),
      total: result.count,
      returned_count: unique.size,
      next_offset: result.next ? start + limit : null,
      items: [...unique.values()]
    };
  }
  if (name === "list_assets" && args.source === "recent")
    return {
      status: "ok",
      source: "recent",
      permission_status: "unverified",
      organization_id: organizationId,
      query: String(args.query || ""),
      ...page(
        recent.recentConnections.value
          .filter((asset) => asset.org_id === organizationId && queryMatches(`${asset.name} ${asset.address}`))
          .map((asset) => ({
            asset_id: asset.id,
            name: asset.name.slice(0, 256),
            address: asset.address.slice(0, 256)
          }))
      )
    };

  if (name === "set_asset_favorite") {
    await getAssetDetailRequest(args.asset_id, organizationId);
    assertCurrent();
    if (args.favorite) await favoriteAsset(args.asset_id);
    else await unfavoriteAsset(args.asset_id);
    assertCurrent();
    events.emit("favoriteChanged", { assetId: args.asset_id, favorite: args.favorite });
    return { status: "updated", asset_id: args.asset_id, favorite: args.favorite };
  }
  if (name !== "list_assets") throw new WorkspaceOperationError("unknown_tool");
  if (favorites.loading.value) return { status: "busy", reason: "favorites_loading" };
  await favorites.load();
  assertCurrent();
  const folders: typeof favorites.folders.value = [];
  const queue = [...favorites.folders.value];
  const seen = new Set<string>();
  while (queue.length && folders.length < 10000) {
    const folder = queue.shift()!;
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    folders.push(folder);
    queue.push(...folder.children);
  }
  const assets = [...favorites.rootAssets.value, ...folders.flatMap((folder) => folder.assets)];
  const unique = new Map(
    assets
      .filter(
        (asset) => (!asset.org_id || asset.org_id === organizationId) && queryMatches(`${asset.name} ${asset.address}`)
      )
      .map((asset) => [asset.id, asset])
  );
  return {
    status: "ok",
    source: "favorites",
    permission_status: "unverified",
    organization_id: organizationId,
    query: String(args.query || ""),
    ...page(
      [...unique.values()].map((asset) => ({
        asset_id: asset.id,
        name: asset.name.slice(0, 256),
        address: asset.address.slice(0, 256)
      }))
    )
  };
}
