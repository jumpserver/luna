import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, shallowRef } from "vue";
import { useWorkspaceAssistantPanelSession } from "./useWorkspaceAssistantPanelSession";

const mocks = vi.hoisted(() => ({
  nextId: 0,
  sessions: new Map<string, any>(),
  dispose: vi.fn(),
  interrupt: vi.fn()
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
  interruptWorkspaceAssistant: mocks.interrupt
}));

function setup() {
  const scope = effectScope();
  const runtime = {
    tabs: {
      tabs: shallowRef([{ id: "a" }, { id: "b" }]),
      activeTab: shallowRef({ id: "a" }),
      activeTabId: shallowRef("a"),
      activePaneId: shallowRef("pane-a")
    },
    userInfoStore: reactive({ loggedIn: true, currentSite: "site", currentAccountId: "user", orgId: "org" }),
    automation: { clearAssetSelectionRequest: vi.fn() }
  };
  const panel = scope.run(() =>
    useWorkspaceAssistantPanelSession(runtime as unknown as Parameters<typeof useWorkspaceAssistantPanelSession>[0])
  )!;
  return { scope, runtime, panel };
}

beforeEach(() => {
  mocks.sessions.clear();
  mocks.nextId = 0;
  vi.clearAllMocks();
  mocks.dispose.mockImplementation((scopeId: string) => mocks.sessions.delete(scopeId));
});

describe("tab-scoped workspace assistant conversations", () => {
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

  it("keeps the same conversation when switching panes inside a tab", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value;
    runtime.tabs.activePaneId.value = "pane-a-2";
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(mocks.dispose).not.toHaveBeenCalled();
    scope.stop();
  });

  it("disposes a conversation when its tab closes", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;
    runtime.tabs.activeTabId.value = "b";
    await nextTick();
    const second = panel.session.value!;

    runtime.tabs.tabs.value = [{ id: "b" }];
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

    runtime.tabs.tabs.value = [...runtime.tabs.tabs.value, { id: "pending" }];
    await nextTick();
    expect(panel.session.value).not.toBeNull();
    scope.stop();
  });

  it("isolates all tab conversations across site, account and organization changes", async () => {
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

    for (const key of ["currentAccountId", "currentSite", "orgId"] as const) {
      const previous = panel.scopeId.value;
      runtime.userInfoStore[key] = `new-${key}`;
      await nextTick();
      expect(mocks.dispose).toHaveBeenCalledWith(previous);
      expect(panel.scopeId.value).not.toBe(previous);
    }
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

    runtime.tabs.tabs.value = [{ id: "new" }];
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
