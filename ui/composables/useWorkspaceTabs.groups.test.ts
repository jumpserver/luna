import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceSessionCloseGuard, useWorkspaceTabs } from "./useWorkspaceTabs";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/composables/useAclDialog", () => ({ closeAclScope: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({ loggedIn: false }) }));

const workspace = useWorkspaceTabs();
const order = () => workspace.tabs.value.map((tab) => tab.assetName);
function open(name: string) {
  workspace.openSession({ id: name, name } as AssetItem, { protocol: "ssh", account: "root", newTab: true });
  return workspace.activeTab.value!;
}

beforeEach(async () => {
  await workspace.closeAllSessions({ force: true });
});
afterEach(() => workspace.registerSessionDisposer(null));

describe("workspace tab groups", () => {
  it("groups two tabs temporarily, joins existing groups, and saves only after naming", () => {
    const a = open("a");
    const b = open("b");
    const c = open("c");
    expect(workspace.groupTabs(a.id, b.id)).toBe(true);
    expect(a.group).toBe(b.group);
    expect(b.group).toMatchObject({ title: "", saved: false });
    expect(workspace.groupTabs(c.id, b.id)).toBe(true);
    expect(workspace.tabGroups.value).toHaveLength(1);
    workspace.renameTabGroup(b.group!.id, "Servers");
    expect(b.group).toMatchObject({ title: "Servers", saved: true });
    expect(workspace.groupTabs(a.id, a.id)).toBe(false);
    expect(workspace.groupTabs("missing", b.id)).toBe(false);
  });
  it("gathers members in order and keeps the same session and panes", () => {
    const a = open("a");
    open("b");
    const c = open("c");
    const pane = c.panes[0];
    const group = workspace.createTabGroup(a.id, " Production ")!;
    expect(workspace.moveTabToGroup(c.id, group.id)).toBe(true);
    expect(order()).toEqual(["a", "c", "b"]);
    expect(c.panes[0]).toBe(pane);
    expect(c.group).toBe(a.group);
    expect(workspace.tabGroups.value).toEqual([group]);
    workspace.renameTabGroup(group.id, "Servers");
    expect(c.group?.title).toBe("Servers");
  });

  it("removes middle members without splitting the remaining group", () => {
    const a = open("a");
    const b = open("b");
    const c = open("c");
    const group = workspace.createTabGroup(a.id, "Servers")!;
    workspace.moveTabToGroup(b.id, group.id);
    workspace.moveTabToGroup(c.id, group.id);
    workspace.moveTabToGroup(b.id);
    expect(order()).toEqual(["a", "c", "b"]);
    expect(b.group).toBeUndefined();
    const second = workspace.createTabGroup(a.id, "Other")!;
    expect(order()).toEqual(["c", "a", "b"]);
    workspace.moveTabToGroup(c.id, second.id);
    expect(workspace.tabGroups.value).toEqual([second]);
  });

  it("leaves a lone member in place when ungrouping or creating a new group", () => {
    const a = open("a");
    open("b");
    workspace.createTabGroup(a.id, "First");
    workspace.createTabGroup(a.id, "Second");
    workspace.moveTabToGroup(a.id);
    expect(order()).toEqual(["a", "b"]);
    expect(workspace.tabGroups.value).toEqual([]);
  });

  it("keeps collapse independent of the active connection and reveals explicitly selected members", () => {
    const a = open("a");
    const b = open("b");
    const group = workspace.createTabGroup(a.id, "Servers")!;
    workspace.moveTabToGroup(b.id, group.id);
    workspace.markSessionConnected(b.panes[0]!.id);
    const dispose = vi.fn();
    workspace.registerSessionDisposer(dispose);
    const activePane = workspace.activePaneId.value;
    workspace.toggleTabGroup(group.id);
    expect(group.collapsed).toBe(true);
    expect(workspace.activeTab.value).toBe(b);
    expect(workspace.activePaneId.value).toBe(activePane);
    expect(b.status).toBe("connected");
    expect(dispose).not.toHaveBeenCalled();
    workspace.setActivePane(activePane);
    expect(group.collapsed).toBe(true);
    workspace.setActiveSession(b.id);
    expect(group.collapsed).toBe(false);
    workspace.toggleTabGroup(group.id);
    workspace.activateAdjacentSession("previous");
    expect(workspace.activeTab.value).toBe(a);
    expect(group.collapsed).toBe(false);
  });

  it("reorders within and across groups without leaving separated members", () => {
    const a = open("a");
    const b = open("b");
    const c = open("c");
    const d = open("d");
    const first = workspace.createTabGroup(a.id, "First")!;
    workspace.moveTabToGroup(b.id, first.id);
    const second = workspace.createTabGroup(c.id, "Second")!;
    workspace.reorderTabs(b.id, a.id, "before");
    expect(order()).toEqual(["b", "a", "c", "d"]);
    workspace.reorderTabs(a.id, c.id, "after");
    expect(a.group).toBe(second);
    workspace.reorderTabs(b.id, d.id, "after");
    expect(order()).toEqual(["c", "a", "d", "b"]);
    expect(b.group).toBeUndefined();
    expect(workspace.tabGroups.value).toEqual([second]);
  });

  it("ungroups without closing any sessions", () => {
    const a = open("a");
    const b = open("b");
    const group = workspace.createTabGroup(a.id, "Servers")!;
    workspace.moveTabToGroup(b.id, group.id);
    workspace.toggleTabGroup(group.id);
    workspace.ungroupTabs(group.id);
    expect(order()).toEqual(["a", "b"]);
    expect(workspace.tabGroups.value).toEqual([]);
    expect(workspace.tabs.value.every((tab) => !tab.group)).toBe(true);
  });

  it("respects close guards and removes the group only after its last member closes", async () => {
    const a = open("a");
    const b = open("b");
    const group = workspace.createTabGroup(a.id, "Servers")!;
    workspace.moveTabToGroup(b.id, group.id);
    await workspace.closeSession(a.id);
    expect(workspace.tabGroups.value).toEqual([group]);
    registerWorkspaceSessionCloseGuard(b.panes[0]!.id, () => false);
    expect(await workspace.closeSession(b.id)).toBe(false);
    expect(workspace.tabGroups.value).toEqual([group]);
    await workspace.closeAllSessions({ force: true });
    expect(workspace.tabGroups.value).toEqual([]);
  });

  it("removes empty groups after a split-pane merge and preserves the destination group", () => {
    const a = open("a");
    const b = open("b");
    workspace.createTabGroup(a.id, "First");
    const second = workspace.createTabGroup(b.id, "Second")!;
    workspace.toggleTabGroup(second.id);
    workspace.setActiveSession(a.id);
    expect(workspace.mergeTabIntoWorkspace(a.id, b.id)).toBe(true);
    expect(workspace.tabGroups.value).toEqual([second]);
    expect(second.collapsed).toBe(false);
    expect(b.panes).toHaveLength(2);
  });

  it("ignores missing tabs, deleted groups, and empty names", () => {
    const a = open("a");
    expect(workspace.createTabGroup("missing", "Group")).toBeNull();
    expect(workspace.createTabGroup(a.id, " ")).toBeNull();
    expect(workspace.moveTabToGroup(a.id, "deleted")).toBe(false);
    const group = workspace.createTabGroup(a.id, "Group")!;
    expect(workspace.renameTabGroup(group.id, " ")).toBe(false);
    expect(group.title).toBe("Group");
    expect(order()).toEqual(["a"]);
  });
});
