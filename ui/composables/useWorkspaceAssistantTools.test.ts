import type { useWorkspaceAssistantTools } from "./useWorkspaceAssistantTools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, toRaw } from "vue";
import type { AssetItem } from "~/types";
import { registerWorkspaceSessionCloseGuard, useWorkspaceTabs } from "./useWorkspaceTabs";
import { getAuthorizedAssets } from "./useApiRequest";
import { useConnectionLauncher } from "./useConnectionLauncher";
import {
  registerLocalShellTerminalSession,
  unregisterLocalShellTerminalSession
} from "#koko/composables/useTerminalSessionRegistry";
import {
  executeWorkspaceOperation,
  localShellOperationTools,
  validateWorkspaceToolArguments,
  waitWorkspacePane,
  workspaceOperationTools,
  workspacePaneSummary,
  requireWorkspaceEmptyPane
} from "./useWorkspaceAssistantTools";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({}) }));
vi.mock("~/composables/useApiRequest", () => ({
  favoriteAsset: vi.fn(),
  unfavoriteAsset: vi.fn(),
  getAssetDetailRequest: vi.fn(async () => ({})),
  getAuthorizedAssets: vi.fn()
}));

const asset: AssetItem = {
  id: "asset-1",
  name: "Production",
  address: "10.0.0.1",
  org_id: "org-1",
  platform: "Linux",
  zone: "",
  type: "linux",
  category: "host",
  isActive: true
};
const disposers: (() => void)[] = [];
const tabs = useWorkspaceTabs();
function open(name = "Production", orgId = "org-1") {
  return tabs.openSession(
    { ...asset, name, org_id: orgId },
    {
      protocol: "ssh",
      account: "root",
      newTab: true,
      payload: {
        token: { value: "private-token" },
        password: "private-password",
        connectMethod: { value: "web_cli_native" }
      }
    }
  );
}
function runtime() {
  return {
    tabs,
    menu: {
      cloneSession: vi.fn(async () => ({ status: "session_started", pane_id: "clone" })),
      reconnectSession: vi.fn()
    },
    settings: {
      open: ref(false),
      activeSection: ref("general"),
      closeSettings: vi.fn(async () => {}),
      openSettings: vi.fn(async () => {})
    },
    preferences: {
      collapse: ref(false),
      sidebarSections: ref({ assets: true, favorites: true }),
      setSidebarSections: vi.fn(),
      setCollapse: vi.fn()
    },
    rightPanel: { open: ref(false), activeTab: ref("session") },
    surfaces: { focusPaneSurface: vi.fn() },
    router: { currentRoute: ref({ path: "/" }), push: vi.fn(async () => {}) },
    localePath: (route: { path: string }) => route.path,
    favorites: {
      loading: ref(false),
      folders: ref([]),
      rootAssets: ref([]),
      load: vi.fn(async () => {}),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      removeFolder: vi.fn()
    },
    recent: { recentConnections: ref([]) }
  } as unknown as ReturnType<typeof useWorkspaceAssistantTools>;
}
function call(
  rt: ReturnType<typeof useWorkspaceAssistantTools>,
  name: string,
  args: Record<string, unknown>,
  assertCurrent = () => {},
  tabId: string | null = null
) {
  validateWorkspaceToolArguments(
    [...workspaceOperationTools, ...localShellOperationTools].find((tool) => tool.name === name)!,
    args
  );
  return executeWorkspaceOperation(rt, name, args, new AbortController().signal, "org-1", assertCurrent, tabId);
}

beforeEach(() => {
  tabs.tabs.value = [];
  tabs.activeTabId.value = "";
  tabs.activePaneId.value = "";
  vi.stubGlobal("isDesktopRuntime", () => false);
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("workspace semantic operations", () => {
  it("rejects arbitrary routes, unexpected arguments and excessive bulk targets", async () => {
    const rt = runtime();
    for (const [name, args] of [
      ["navigate_workspace", { target: "https://example.com" }],
      ["get_workspace_state", { include_tokens: true }],
      ["close_sessions", { target: "tab", ids: Array.from({ length: 51 }, (_, i) => String(i)) }],
      ["close_sessions", { target: "tab", ids: ["same", "same"] }],
      ["get_workspace_state", { pane_id: "one", wait_ms: Infinity }],
      ["get_workspace_state", { wait_ms: 1000 }],
      ["get_workspace_state", { pane_id: "one", limit: 1 }],
      ["navigate_workspace", { target: "pane" }],
      ["navigate_workspace", { target: "files", id: "one" }],
      ["navigate_workspace", { target: "files", section: "user" }],
      ["navigate_workspace", { target: "pane", id: "one", visible: true }],
      ["arrange_workspace", { action: "split", tab_id: "one" }],
      [
        "arrange_workspace",
        { action: "merge", tab_id: "one", target_pane_id: "two", placement: "right", direction: "vertical" }
      ]
    ] as const)
      expect(() => call(rt, name, args)).toThrow("invalid_arguments");
  });

  it("returns bounded summaries without session payloads or another organization's panes", async () => {
    open();
    open("Other organization", "org-2");
    const result = await call(runtime(), "get_workspace_state", { limit: 1 });
    expect(result).toMatchObject({
      total: 1,
      active_tab_id: "",
      active_pane_id: "",
      items: [{ panes: [{ asset_name: "Production", status: "ready" }] }]
    });
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-password|Other organization/);
  });

  it("limits a tab-scoped assistant to its own tab and panes", async () => {
    const first = open();
    const firstTab = tabs.tabs.value[0]!;
    const second = open("Second");
    const secondTab = tabs.tabs.value[1]!;
    const rt = runtime();

    const result = await call(rt, "get_workspace_state", {}, () => {}, firstTab.id);
    expect(result).toMatchObject({
      total: 1,
      items: [{ tab_id: firstTab.id, panes: [{ pane_id: first.id }] }]
    });
    expect(JSON.stringify(result)).not.toContain(second.id);
    await expect(
      call(rt, "navigate_workspace", { target: "tab", id: secondTab.id }, () => {}, firstTab.id)
    ).rejects.toThrow("unavailable");
    await expect(
      call(rt, "navigate_workspace", { target: "pane", id: second.id }, () => {}, firstTab.id)
    ).rejects.toThrow("no longer exists");
  });

  it("splits, activates a non-primary pane and merges a live session without replacing it", async () => {
    const first = open();
    const firstTab = tabs.tabs.value[0]!;
    const second = open("Second");
    const secondTab = tabs.tabs.value[1]!;
    const rt = runtime();
    await call(rt, "arrange_workspace", {
      action: "merge",
      tab_id: secondTab.id,
      target_pane_id: first.id,
      placement: "right"
    });
    expect(toRaw(firstTab.panes[1])).toBe(toRaw(second));
    expect(firstTab.layoutMode).toBe("columns-2");
    await call(rt, "navigate_workspace", { target: "pane", id: second.id });
    expect(tabs.activePaneId.value).toBe(second.id);
    expect(tabs.activeTabId.value).toBe(firstTab.id);
    expect(rt.surfaces.focusPaneSurface).toHaveBeenCalledWith(second.id);
    await call(rt, "arrange_workspace", { action: "split", tab_id: firstTab.id, direction: "horizontal" });
    expect(firstTab.panes).toHaveLength(3);
    expect(
      await call(rt, "arrange_workspace", { action: "split", tab_id: firstTab.id, direction: "horizontal" })
    ).toMatchObject({
      status: "split"
    });
    expect(
      await call(rt, "arrange_workspace", { action: "split", tab_id: firstTab.id, direction: "horizontal" })
    ).toEqual({
      status: "layout_limit"
    });
  });

  it("rejects occupied, replaced and cross-organization connection targets", () => {
    const pane = open();
    expect(() => requireWorkspaceEmptyPane(tabs.tabs.value, pane.id, "org-1")).toThrow("empty pane");
    const empty = tabs.splitWorkspace(pane.id, "vertical")[0]!;
    const expected = requireWorkspaceEmptyPane(tabs.tabs.value, empty.id, "org-1");
    expect(() => requireWorkspaceEmptyPane(tabs.tabs.value, empty.id, "org-2")).toThrow("organization");
    tabs.openSession(asset, { protocol: "ssh", account: "root", paneId: empty.id });
    expect(() => requireWorkspaceEmptyPane(tabs.tabs.value, empty.id, "org-1", expected)).toThrow("pane_changed");
  });

  it("closes only approved targets and preserves unsaved-content guards", async () => {
    const guarded = open();
    const closable = open("Closable");
    const untouched = open("Untouched");
    disposers.push(registerWorkspaceSessionCloseGuard(guarded.id, () => false));
    const result = await call(runtime(), "close_sessions", { target: "tab", ids: [guarded.id, closable.id] });
    expect(result).toMatchObject({
      status: "partial",
      outcomes: [
        { id: guarded.id, status: "blocked_or_closed" },
        { id: closable.id, status: "closed" }
      ]
    });
    expect(tabs.tabs.value.map((tab) => tab.id)).toEqual([guarded.id, untouched.id]);
  });

  it("does not close a replaced pane while its guard is pending", async () => {
    const pane = open();
    disposers.push(
      registerWorkspaceSessionCloseGuard(pane.id, async () => {
        tabs.openSession(asset, { protocol: "ssh", account: "another", paneId: pane.id });
        return true;
      })
    );
    expect(await call(runtime(), "close_sessions", { target: "tab", ids: [pane.id] })).toMatchObject({
      status: "partial"
    });
    expect(tabs.tabs.value[0]?.panes[0]?.account).toBe("another");
  });

  it("rechecks context after awaiting a close guard", async () => {
    const pane = open();
    let changed = false;
    disposers.push(
      registerWorkspaceSessionCloseGuard(pane.id, async () => {
        changed = true;
        return true;
      })
    );
    await expect(
      call(runtime(), "close_sessions", { target: "pane", ids: [pane.id] }, () => {
        if (changed) throw new Error("context_changed");
      })
    ).rejects.toThrow("context_changed");
    expect(tabs.tabs.value).toHaveLength(1);
  });

  it("navigates pages, settings and panels through the shared entry point", async () => {
    const rt = runtime();
    await call(rt, "navigate_workspace", { target: "files" });
    expect(rt.router.push).toHaveBeenCalledWith("/files");
    await call(rt, "navigate_workspace", { target: "settings", section: "appearance" });
    expect(rt.settings.openSettings).toHaveBeenCalledWith("/setting/appearance");
    await call(rt, "navigate_workspace", { target: "assets" });
    expect(rt.preferences.setSidebarSections).toHaveBeenCalledWith({ assets: true });
    expect(rt.preferences.setCollapse).toHaveBeenCalledWith(false);
    await call(rt, "navigate_workspace", { target: "favorites", visible: false });
    expect(rt.preferences.setSidebarSections).toHaveBeenCalledWith({ favorites: false });
  });

  it("reads and waits for one exact pane through workspace state", async () => {
    const pane = open();
    const rt = runtime();
    expect(await call(rt, "get_workspace_state", { pane_id: pane.id })).toMatchObject({ session: { status: "ready" } });
    const waiting = call(rt, "get_workspace_state", { pane_id: pane.id, wait_ms: 1000 });
    tabs.markSessionConnected(pane.id);
    expect(await waiting).toMatchObject({ status: "connected", session: { pane_id: pane.id } });
  });

  it("reads and submits approved commands only to the scoped Local Shell", async () => {
    const pane = tabs.openLocalShell();
    tabs.markSessionConnected(pane.id);
    const send = vi.fn();
    const lines = ["$", "$ pwd", "/Users/operator"];
    registerLocalShellTerminalSession(pane.id, send, {
      buffer: {
        active: {
          type: "normal",
          length: lines.length,
          baseY: 1,
          cursorX: 1,
          cursorY: 1,
          getLine: (index: number) => ({ translateToString: () => lines[index] })
        }
      }
    } as never);
    disposers.push(() => unregisterLocalShellTerminalSession(pane.id));

    const tabId = tabs.activeTabId.value;
    expect(await call(runtime(), "read_local_shell", { pane_id: pane.id, lines: 2 }, () => {}, tabId)).toMatchObject({
      status: "ok",
      pane_id: pane.id,
      snapshot: { text: "$ pwd\n/Users/operator", lines: 2 }
    });
    expect(
      await call(
        runtime(),
        "run_local_shell_command",
        { pane_id: pane.id, command: "pwd", wait_ms: 0 },
        () => {},
        tabId
      )
    ).toMatchObject({ status: "submitted" });
    expect(send).toHaveBeenCalledWith("pwd\r");
    await expect(
      call(
        runtime(),
        "run_local_shell_command",
        { pane_id: pane.id, command: "pwd\nwhoami", wait_ms: 0 },
        () => {},
        tabId
      )
    ).rejects.toThrow("visible terminal line");
  });

  it("targets the selected secondary pane when cloning and blocks another organization", async () => {
    const first = open();
    const second = open("Second");
    tabs.mergeTabIntoWorkspace(second.id, first.id, first.id, "right");
    const rt = runtime();
    await call(rt, "open_session", { mode: "clone", pane_id: second.id });
    expect(rt.menu.cloneSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: second.id, assetName: "Second" }),
      expect.any(Function)
    );
    const foreign = open("Foreign", "org-2");
    await expect(call(rt, "navigate_workspace", { target: "pane", id: foreign.id })).rejects.toThrow("organization");
  });

  it("defaults to authorized assets without merging stale history or favorites", async () => {
    const rt = runtime();
    rt.recent.recentConnections.value.push({ ...asset, id: "expired-history" });
    rt.favorites.rootAssets.value = [{ ...asset, id: "expired-favorite" }];
    vi.mocked(getAuthorizedAssets).mockResolvedValueOnce({
      count: 2,
      next: null,
      results: [
        { ...asset, password: "private" },
        { ...asset, id: "asset-2", name: "Second" }
      ]
    });
    const result = await call(rt, "list_assets", {});
    expect(getAuthorizedAssets).toHaveBeenLastCalledWith({ search: "", offset: 0, limit: 20 }, "org-1");
    expect(result).toMatchObject({
      source: "authorized",
      permission_status: "authorized",
      total: 2,
      returned_count: 2,
      next_offset: null,
      items: [{ asset_id: "asset-1" }, { asset_id: "asset-2" }]
    });
    expect(JSON.stringify(result)).not.toMatch(/expired|password|private/);
    expect(rt.favorites.load).not.toHaveBeenCalled();
  });

  it("distinguishes a page from the authorized total and does not fall back to history", async () => {
    const rt = runtime();
    rt.recent.recentConnections.value.push(asset);
    vi.mocked(getAuthorizedAssets).mockResolvedValueOnce({ count: 2, next: "/next?offset=1", results: [{ ...asset }] });
    expect(await call(rt, "list_assets", { source: "authorized", query: "  Production  ", limit: 1 })).toMatchObject({
      total: 2,
      returned_count: 1,
      next_offset: 1
    });
    expect(getAuthorizedAssets).toHaveBeenLastCalledWith({ search: "Production", offset: 0, limit: 1 }, "org-1");
    vi.mocked(getAuthorizedAssets).mockResolvedValueOnce({ count: 0, next: null, results: [] });
    expect(await call(rt, "list_assets", {})).toMatchObject({ total: 0, items: [] });
    vi.mocked(getAuthorizedAssets).mockRejectedValueOnce(new Error("permission_denied"));
    await expect(call(rt, "list_assets", {})).rejects.toThrow("permission_denied");
    vi.mocked(getAuthorizedAssets).mockResolvedValueOnce({
      count: 1,
      next: null,
      results: [{ ...asset, org_id: "org-2" }]
    });
    await expect(call(rt, "list_assets", {})).rejects.toThrow("asset_scope_mismatch");
  });

  it("filters recent connections and strips saved credentials", async () => {
    const rt = runtime();
    rt.recent.recentConnections.value.push(
      { ...asset, savedConnection: { protocol: "ssh", username: "root", manualPassword: "private" } },
      { ...asset, id: "foreign", org_id: "org-2" }
    );
    const result = await call(rt, "list_assets", { source: "recent" });
    expect(result).toMatchObject({
      source: "recent",
      permission_status: "unverified",
      total: 1,
      returned_count: 1,
      items: [{ asset_id: asset.id }]
    });
    expect(JSON.stringify(result)).not.toMatch(/private|foreign/);
  });

  it("lists favorite assets across folders with deduplication and pagination", async () => {
    const rt = runtime();
    rt.favorites.rootAssets.value = [asset];
    rt.favorites.folders.value = [
      {
        id: "folder",
        name: "Servers",
        parent: null,
        children: [],
        assets: [asset, { ...asset, id: "second" }, { ...asset, id: "foreign", org_id: "org-2" }],
        open: false
      }
    ];
    expect(await call(rt, "list_assets", { source: "favorites", offset: 1, limit: 1 })).toMatchObject({
      total: 2,
      next_offset: null,
      items: [{ asset_id: "second" }]
    });
    expect(rt.favorites.load).toHaveBeenCalledOnce();
  });
});

describe("connection readiness and exact launch target", () => {
  it("waits through ready, reports connected and cleans up bounded waits", async () => {
    const pane = open();
    const signal = new AbortController().signal;
    const waiting = waitWorkspacePane(
      () => tabs.tabs.value[0]?.panes[0],
      signal,
      1000,
      () => {}
    );
    tabs.markSessionConnected(pane.id);
    expect(await waiting).toMatchObject({ status: "connected", session: { pane_id: pane.id } });
    expect(workspacePaneSummary(pane)).not.toHaveProperty("payload");
  });

  it("reports timeout, cancellation and replacement without claiming success", async () => {
    vi.useFakeTimers();
    open();
    const getPane = () => tabs.tabs.value[0]?.panes[0];
    const waiting = waitWorkspacePane(getPane, new AbortController().signal, 20, () => {});
    await vi.advanceTimersByTimeAsync(20);
    expect(await waiting).toMatchObject({ status: "waiting" });
    const controller = new AbortController();
    const cancelled = waitWorkspacePane(getPane, controller.signal, 1000, () => {});
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    const replacement = waitWorkspacePane(getPane, new AbortController().signal, 1000, () => {});
    tabs.openSession(asset, { protocol: "ssh", account: "other", paneId: getPane()!.id });
    expect(await replacement).toEqual({ status: "session_changed" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the actually opened pane and suppresses a cancelled launch", async () => {
    let callback: (payload: Record<string, unknown>) => void = () => {};
    const openSession = vi.fn(() => ({ id: "opened-pane" }));
    vi.stubGlobal("useAssetConnection", () => ({
      confirmConnection: vi.fn(async (_asset, info) => {
        callback = info.onSessionReady;
      })
    }));
    vi.stubGlobal("useWorkspaceTabs", () => ({ openSession }));
    vi.stubGlobal("useConnectionFormModal", () => ({ open: vi.fn() }));
    const launcher = useConnectionLauncher();
    const onPaneOpened = vi.fn();
    const connection = { protocol: "ssh", account: "root" } as any;
    const pending = launcher.launchWithInfo(asset, connection, { assertCurrent: () => {}, onPaneOpened });
    callback({ id: "token", connectMethod: { type: "web" } });
    expect(await pending).toBe(true);
    expect(onPaneOpened).toHaveBeenCalledWith("opened-pane");
    expect(openSession).toHaveBeenCalledWith(asset, expect.objectContaining({ newTab: true }));
    const cancelled = launcher.launchWithInfo(asset, connection, {
      assertCurrent: () => {
        throw new Error("cancelled");
      }
    });
    callback({ id: "token", connectMethod: { type: "web" } });
    expect(await cancelled).toBe(false);
    expect(openSession).toHaveBeenCalledTimes(1);
  });
});
