import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, shallowRef } from "vue";
import type { WorkspaceMode } from "./useWorkspaceMode";
import { useWorkspaceAssistantPanelSession } from "./useWorkspaceAssistantPanelSession";

const mocks = vi.hoisted(() => ({
  nextId: 0,
  sessions: new Map<string, any>(),
  dispose: vi.fn(),
  interrupt: vi.fn()
}));
vi.mock("./useWorkspaceAssistantSession", () => ({
  workspaceAssistantScopeId: () => `scope-${mocks.nextId++}`,
  ensureWorkspaceAssistantSession: (scopeId: string) => {
    if (!mocks.sessions.has(scopeId)) {
      mocks.sessions.set(scopeId, { scopeId, draft: "", messages: [] });
    }
    return mocks.sessions.get(scopeId);
  },
  disposeWorkspaceAssistantSession: mocks.dispose,
  interruptWorkspaceAssistant: mocks.interrupt
}));

function setup() {
  const scope = effectScope();
  const mode = shallowRef<WorkspaceMode>("assets");
  const runtime = {
    tabs: {
      tabs: shallowRef([{ id: "a" }, { id: "b" }]),
      activeTab: shallowRef({ id: "a" }),
      activePaneId: shallowRef("pane-a")
    },
    userInfoStore: reactive({ loggedIn: true, currentSite: "site", currentAccountId: "user", orgId: "org" }),
    automation: { clearAssetSelectionRequest: vi.fn() }
  };
  const panel = scope.run(() =>
    useWorkspaceAssistantPanelSession(runtime as unknown as Parameters<typeof useWorkspaceAssistantPanelSession>[0])
  )!;
  return { scope, mode, runtime, panel };
}

beforeEach(() => {
  mocks.sessions.clear();
  mocks.nextId = 0;
  vi.clearAllMocks();
  mocks.dispose.mockImplementation((scopeId: string) => mocks.sessions.delete(scopeId));
});

describe("unified workspace assistant conversation", () => {
  it("keeps history, drafts and active work when switching tabs or connecting another asset", async () => {
    const { scope, runtime, panel } = setup();
    const first = panel.session.value!;
    first.draft = "continue checking this terminal";
    (first as any).messages.push("connect and inspect");
    runtime.tabs.activeTab.value = { id: "b" };
    runtime.tabs.activePaneId.value = "pane-b";
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(panel.session.value?.draft).toBe("continue checking this terminal");
    expect(mocks.interrupt).not.toHaveBeenCalled();
    runtime.tabs.tabs.value = [{ id: "b" }];
    await nextTick();
    expect(mocks.dispose).not.toHaveBeenCalled();
    expect((panel.session.value as any).messages).toEqual(["connect and inspect"]);
    scope.stop();
    expect(mocks.dispose).toHaveBeenCalledWith(first.scopeId);
  });

  it("isolates site, account and organization changes and disposes on logout", async () => {
    const { scope, runtime, panel } = setup();
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

  it("explicitly starts a clean conversation and cancels its previous work", () => {
    const { scope, panel } = setup();
    const previous = panel.session.value!;
    previous.draft = "old draft";
    panel.newSession();
    expect(mocks.interrupt).toHaveBeenCalledWith(previous.scopeId);
    expect(mocks.dispose).toHaveBeenCalledWith(previous.scopeId);
    expect(panel.scopeId.value).not.toBe(previous.scopeId);
    expect(panel.session.value?.draft).toBe("");
    scope.stop();
  });

  it("preserves the conversation across workspace modes", async () => {
    const { scope, mode, panel } = setup();
    const first = panel.session.value;
    mode.value = "files";
    await nextTick();
    expect(panel.session.value).toBe(first);
    expect(mocks.interrupt).not.toHaveBeenCalled();
    scope.stop();
  });
});
