import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { effectScope, nextTick, reactive, shallowReactive, shallowRef } from "vue";
import { compileTemplate } from "vue/compiler-sfc";
import defaultLayout from "../layouts/default.vue?raw";
import sessionPage from "../pages/session/[assetId].vue?raw";
import { hasActiveAiTask, useWorkspaceAssistantPanelSession } from "./useWorkspaceAssistantPanelSession";
import { setWorkspaceAiEnabled } from "~/shared/aiAvailability";

const mocks = vi.hoisted(() => ({
  nextId: 0,
  sessions: new Map<string, any>(),
  activeTargets: new Map<string, string>(),
  terminalSessions: new Map<string, { paneId: string; ownerId: string }>(),
  busyScopes: new Set<string>(),
  dispose: vi.fn(),
  interrupt: vi.fn()
}));
vi.mock("#koko/composables/terminal/useTerminalAiSessions", () => ({
  getActiveKokoTerminalAiTargetId: (ownerId: string) => mocks.activeTargets.get(ownerId) || null,
  getKokoTerminalAiSessions: (ownerId: string) =>
    [...mocks.terminalSessions.values()].filter((session) => session.ownerId === ownerId)
}));
vi.mock("./useWorkspaceAssistantSession", () => ({
  workspaceAssistantScopeId: () => `scope-${mocks.nextId++}`,
  ensureWorkspaceAssistantSession: (scopeId: string, _runtime: unknown, tabId: string) => {
    if (!mocks.sessions.has(scopeId)) {
      mocks.sessions.set(scopeId, { scopeId, tabId, draft: "", messages: [] });
    }
    return mocks.sessions.get(scopeId);
  },
  disposeWorkspaceAssistantSession: mocks.dispose,
  interruptWorkspaceAssistant: mocks.interrupt,
  isWorkspaceAssistantBusy: (scopeId: string) => mocks.busyScopes.has(scopeId)
}));

function createRuntime() {
  return {
    tabs: {
      tabs: shallowRef([
        { id: "a", panes: [{ id: "pane-a" }, { id: "pane-a-2" }] },
        { id: "b", panes: [{ id: "pane-b" }] }
      ]),
      activeTab: shallowRef({ id: "a" }),
      activeTabId: shallowRef("a"),
      activePaneId: shallowRef("pane-a")
    },
    userInfoStore: reactive({ loggedIn: true, currentSite: "site", currentAccountId: "user", orgId: "org" }),
    automation: { clearAssetSelectionRequest: vi.fn() }
  };
}

function setup() {
  const scope = effectScope();
  const runtime = createRuntime();
  const panel = scope.run(() =>
    useWorkspaceAssistantPanelSession(runtime as unknown as Parameters<typeof useWorkspaceAssistantPanelSession>[0])
  )!;
  return { scope, runtime, panel };
}

beforeEach(() => {
  setWorkspaceAiEnabled(true);
  mocks.sessions.clear();
  mocks.activeTargets = shallowReactive(new Map());
  mocks.terminalSessions = shallowReactive(new Map());
  mocks.busyScopes.clear();
  mocks.nextId = 0;
  vi.clearAllMocks();
  mocks.dispose.mockImplementation((scopeId: string) => mocks.sessions.delete(scopeId));
});

describe("tab-scoped workspace assistant conversations", () => {
  it.each([
    ["default layout", defaultLayout],
    ["session page", sessionPage]
  ])("preserves conversations across panel toggles in the %s and still cleans up on exit", async (_name, source) => {
    // Compile the actual overlay boundary so removing its cache exercises the regression.
    const template = source.match(/(?:<KeepAlive>\s*)?<AiOverlayPanel\b[^>]*\/>(?:\s*<\/KeepAlive>)?/)![0];
    const { code } = compileTemplate({
      source: template,
      filename: _name,
      id: "assistant-panel-lifecycle",
      compilerOptions: { mode: "function" }
    });
    const runtime = createRuntime();
    const open = shallowRef(true);
    const isUtilityRoute = shallowRef(false);
    let panel!: ReturnType<typeof useWorkspaceAssistantPanelSession>;
    const renderer = Vue.createRenderer({
      insert() {},
      remove() {},
      patchProp() {},
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText() {},
      setElementText() {},
      parentNode: () => null,
      nextSibling: () => null
    });
    const app = renderer.createApp({
      components: {
        AiOverlayPanel: {
          setup() {
            panel = useWorkspaceAssistantPanelSession(
              runtime as unknown as Parameters<typeof useWorkspaceAssistantPanelSession>[0]
            );
            return () => null;
          }
        }
      },
      setup: () => ({
        aiPanelOpen: open,
        isUtilityRoute,
        activeTab: true,
        setAiPanelOpen: (value: boolean) => (open.value = value)
      }),
      render: new Function("Vue", code)(Vue)
    });
    app.mount({});
    let replacementScope = "";
    try {
      const first = panel.session.value!;

      open.value = false;
      await nextTick();
      expect(mocks.dispose).not.toHaveBeenCalled();

      open.value = true;
      await nextTick();
      expect(panel.session.value).toBe(first);

      if (_name === "default layout") {
        isUtilityRoute.value = true;
        await nextTick();
        expect(open.value).toBe(true);
        expect(mocks.dispose).not.toHaveBeenCalled();
        isUtilityRoute.value = false;
        await nextTick();
        expect(panel.session.value).toBe(first);
      }

      open.value = false;
      await nextTick();
      runtime.userInfoStore.orgId = "another-org";
      await nextTick();
      expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
      replacementScope = panel.scopeId.value;
      expect(replacementScope).not.toBe(first.scopeId);
    } finally {
      app.unmount();
    }
    expect(mocks.dispose).toHaveBeenCalledWith(replacementScope);
    expect(mocks.sessions.size).toBe(0);
  });

  it("reports an active AI task for a tab", () => {
    const { scope, panel } = setup();
    const current = panel.session.value!;
    expect(hasActiveAiTask("a")).toBe(false);
    mocks.busyScopes.add(current.scopeId);
    expect(hasActiveAiTask("a")).toBe(true);
    expect(hasActiveAiTask("b")).toBe(false);
    expect(hasActiveAiTask()).toBe(true);
    scope.stop();
  });

  it("creates a conversation per tab and restores it when switching back", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;
    expect(first.tabId).toBe("a");
    first.draft = "continue checking this terminal";
    (first as any).messages.push("connect and inspect");
    runtime.tabs.activeTabId.value = "b";
    runtime.tabs.activeTab.value = { id: "b" };
    runtime.tabs.activePaneId.value = "pane-b";
    await nextTick();
    const second = panel.session.value!;
    expect(second.tabId).toBe("b");
    expect(second).not.toBe(first);
    expect(second.draft).toBe("");
    expect(mocks.interrupt).not.toHaveBeenCalled();

    second.draft = "check another host";
    runtime.tabs.activeTabId.value = "a";
    runtime.tabs.activeTab.value = { id: "a" };
    runtime.tabs.activePaneId.value = "pane-a";
    await nextTick();
    expect(mocks.dispose).not.toHaveBeenCalled();
    expect(panel.session.value).toBe(first);
    expect(panel.session.value?.draft).toBe("continue checking this terminal");
    expect((panel.session.value as any).messages).toEqual(["connect and inspect"]);

    runtime.tabs.activeTabId.value = "b";
    await nextTick();
    expect(panel.session.value).toBe(second);
    expect(panel.session.value?.draft).toBe("check another host");
    scope.stop();
    expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
    expect(mocks.dispose).toHaveBeenCalledWith(second.scopeId);
  });

  it("keeps the conversation when a second subscriber mounts", async () => {
    const first = setup();
    const session = first.panel.session.value!;
    session.draft = "inspect disk";
    mocks.dispose.mockClear();
    const second = setup();
    expect(second.panel.session.value).toBe(session);
    expect(session.draft).toBe("inspect disk");
    expect(mocks.dispose).not.toHaveBeenCalled();
    first.scope.stop();
    expect(mocks.dispose).not.toHaveBeenCalled();
    expect(second.panel.session.value).toBe(session);
    second.scope.stop();
    expect(mocks.dispose).toHaveBeenCalledWith(session.scopeId);
  });

  it("keeps the same conversation when switching panes inside a tab", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value;
    runtime.tabs.activePaneId.value = "pane-a-2";
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(mocks.dispose).not.toHaveBeenCalled();
    scope.stop();
  });

  it("restores each nested target conversation and reports background tasks for its tab", async () => {
    mocks.terminalSessions.set("child-a", { paneId: "child-a", ownerId: "pane-a" });
    mocks.terminalSessions.set("child-b", { paneId: "child-b", ownerId: "pane-a" });
    mocks.activeTargets.set("pane-a", "child-a");
    const { scope, panel } = setup();
    const first = panel.session.value!;
    first.draft = "inspect the first target";
    (first as any).messages.push("first target history");
    mocks.busyScopes.add(first.scopeId);

    mocks.activeTargets.set("pane-a", "child-b");
    await nextTick();
    const second = panel.session.value!;
    expect(second).not.toBe(first);
    expect(second.draft).toBe("");
    expect(hasActiveAiTask("a")).toBe(true);
    expect(hasActiveAiTask("b")).toBe(false);

    panel.newSession();
    expect(mocks.interrupt).toHaveBeenCalledWith(second.scopeId);
    expect(mocks.interrupt).not.toHaveBeenCalledWith(first.scopeId);
    mocks.activeTargets.set("pane-a", "child-a");
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(first.draft).toBe("inspect the first target");
    expect((first as any).messages).toEqual(["first target history"]);
    expect(mocks.dispose).not.toHaveBeenCalledWith(first.scopeId);
    scope.stop();
  });

  it("keeps a pending nested target until registration and disposes only a closed target", async () => {
    mocks.activeTargets.set("pane-a", "child-a");
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;

    runtime.tabs.tabs.value = [...runtime.tabs.tabs.value];
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(mocks.dispose).not.toHaveBeenCalled();

    mocks.terminalSessions.set("child-a", { paneId: "child-a", ownerId: "pane-a" });
    mocks.terminalSessions.set("child-b", { paneId: "child-b", ownerId: "pane-a" });
    mocks.activeTargets.set("pane-a", "child-b");
    await nextTick();
    const second = panel.session.value!;
    mocks.busyScopes.add(first.scopeId);
    mocks.terminalSessions.delete("child-a");
    await nextTick();
    expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
    expect(mocks.dispose).not.toHaveBeenCalledWith(second.scopeId);
    expect(panel.session.value).toBe(second);
    expect(hasActiveAiTask("a")).toBe(false);

    runtime.tabs.tabs.value = [{ id: "b", panes: [{ id: "pane-b" }] }];
    runtime.tabs.activeTabId.value = "b";
    runtime.tabs.activePaneId.value = "pane-b";
    await nextTick();
    expect(mocks.dispose).toHaveBeenCalledWith(second.scopeId);
    scope.stop();
  });

  it("disposes a conversation when its tab closes", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;
    runtime.tabs.activeTabId.value = "b";
    await nextTick();
    const second = panel.session.value!;

    runtime.tabs.tabs.value = [{ id: "b", panes: [{ id: "pane-b" }] }];
    await nextTick();
    expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
    expect(mocks.dispose).not.toHaveBeenCalledWith(second.scopeId);
    expect(panel.session.value).toBe(second);
    scope.stop();
  });

  it("recovers when an active tab is registered after its id changes", async () => {
    const { scope, runtime, panel } = setup();
    runtime.tabs.activeTabId.value = "pending";
    await nextTick();
    expect(panel.session.value).toBeNull();

    runtime.tabs.tabs.value = [...runtime.tabs.tabs.value, { id: "pending", panes: [] }];
    await nextTick();
    expect(panel.session.value).not.toBeNull();
    scope.stop();
  });

  it("clears conversations when AI is disabled or the login context changes", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;
    runtime.tabs.activeTabId.value = "b";
    await nextTick();
    const second = panel.session.value!;

    runtime.userInfoStore.currentAccountId = "new-account";
    await nextTick();
    expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
    expect(mocks.dispose).toHaveBeenCalledWith(second.scopeId);
    expect(panel.scopeId.value).not.toBe(second.scopeId);

    for (const key of ["currentSite", "orgId"] as const) {
      const previous = panel.scopeId.value;
      runtime.userInfoStore[key] = `new-${key}`;
      await nextTick();
      expect(mocks.dispose).toHaveBeenCalledWith(previous);
      expect(panel.scopeId.value).not.toBe(previous);
    }
    setWorkspaceAiEnabled(false);
    await nextTick();
    panel.newSession();
    expect(mocks.sessions.size).toBe(0);
    setWorkspaceAiEnabled(true);
    await nextTick();
    expect(panel.session.value).not.toBeNull();
    runtime.userInfoStore.loggedIn = false;
    await nextTick();
    expect(panel.session.value).toBeNull();
    panel.newSession();
    expect(mocks.sessions.size).toBe(0);
    scope.stop();
  });

  it("explicitly replaces only the active tab conversation", async () => {
    const { scope, runtime, panel } = setup();
    const previous = panel.session.value!;
    previous.draft = "old draft";
    panel.newSession();
    expect(mocks.interrupt).toHaveBeenCalledWith(previous.scopeId);
    expect(mocks.dispose).toHaveBeenCalledWith(previous.scopeId);
    expect(panel.scopeId.value).not.toBe(previous.scopeId);
    expect(panel.session.value?.draft).toBe("");

    const replacement = panel.session.value;
    runtime.tabs.activeTabId.value = "b";
    await nextTick();
    const other = panel.session.value;
    expect(other).not.toBe(replacement);
    runtime.tabs.activeTabId.value = "a";
    await nextTick();
    expect(panel.session.value).toBe(replacement);
    scope.stop();
  });

  it("moves a pre-tab conversation to the first opened tab", async () => {
    const { scope, runtime, panel } = setup();
    runtime.tabs.tabs.value = [];
    runtime.tabs.activeTabId.value = "";
    await nextTick();
    const preTab = panel.session.value!;

    runtime.tabs.tabs.value = [{ id: "new", panes: [] }];
    runtime.tabs.activeTabId.value = "new";
    await nextTick();
    expect(panel.session.value).toBe(preTab);
    expect(preTab.tabId).toBe("new");

    runtime.tabs.activeTabId.value = "";
    runtime.tabs.tabs.value = [];
    await nextTick();
    expect(mocks.dispose).toHaveBeenCalledWith(preTab.scopeId);
    scope.stop();
  });
});
