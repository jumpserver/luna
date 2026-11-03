import type { AssetItem } from "~/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toRaw } from "vue";
import {
  registerKokoBroadcastEndpoint,
  startKokoTerminalBroadcast,
  stopKokoTerminalBroadcast,
  unregisterKokoBroadcastEndpoint
} from "#koko/composables/terminal/useTerminalBroadcast";
import { measureWorkspaceLayout } from "~/utils/workspaceLayout";
import { useWorkspaceTabs } from "./useWorkspaceTabs";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/composables/useAclDialog", () => ({ closeAclScope: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({ loggedIn: false }) }));
vi.mock("~/composables/useSettingManager", () => ({ useSettingManager: () => ({ collapse: { value: false } }) }));
const workspace = useWorkspaceTabs();
beforeEach(async () => {
  await workspace.closeAllSessions({ force: true });
});
afterEach(async () => {
  stopKokoTerminalBroadcast();
  await Promise.resolve();
  workspace.registerSessionDisposer(null);
});
function open(name: string) {
  workspace.openSession({ id: name, name } as AssetItem, { protocol: "ssh", account: "root", newTab: true });
  return workspace.activeTab.value!;
}

it("splits a selected pane beyond four and keeps its siblings and live instances", async () => {
  const tab = open("source");
  const main = tab.panes[0]!;
  const right = workspace.splitWorkspace(tab.id, "vertical", main.id)[0]!;
  const dispose = vi.fn();
  workspace.registerSessionDisposer(dispose);
  for (let index = 0; index < 8; index++) workspace.splitWorkspace(tab.id, "horizontal", right.id);
  expect(tab.panes).toHaveLength(10);
  const before = measureWorkspaceLayout(tab.paneLayout!);
  expect(before.panes.get(main.id)).toEqual({ left: 0, top: 0, width: 50, height: 100 });
  expect(before.panes.size).toBe(10);
  const last = tab.panes.at(-1)!;
  workspace.placePane(tab.id, last.id, right.id, "bottom");
  expect(measureWorkspaceLayout(tab.paneLayout!).panes.get(main.id)).toEqual(before.panes.get(main.id));
  workspace.swapPanes(tab.id, right.id, last.id);
  expect(tab.panes.find((pane) => pane.id === main.id)).toBe(main);
  expect(toRaw(tab.panes.find((pane) => pane.id === right.id))).toBe(toRaw(right));
  expect(dispose).not.toHaveBeenCalled();
  await workspace.closePane(last.id);
  expect(measureWorkspaceLayout(tab.paneLayout!).panes.size).toBe(9);
  expect(dispose).toHaveBeenCalledExactlyOnceWith(last.id);
});

it("merges live tabs into an arbitrary branch after the workspace has ten panes", () => {
  const tab = open("source");
  for (let index = 0; index < 9; index++) workspace.splitWorkspace(tab.id, "horizontal");
  const external = open("external");
  const pane = external.panes[0]!;
  const dispose = vi.fn();
  workspace.registerSessionDisposer(dispose);
  expect(workspace.canMergeTabs(external.id, tab.id)).toBe(true);
  expect(workspace.mergeTabIntoWorkspace(external.id, tab.id, tab.panes[5]!.id, "left")).toBe(true);
  expect(tab.panes.at(-1)).toBe(pane);
  expect(measureWorkspaceLayout(tab.paneLayout!).panes.size).toBe(11);
  expect(workspace.tabs.value).toHaveLength(1);
  expect(dispose).not.toHaveBeenCalled();
});

it("restores imported tabs, groups and the original split proportions while retaining new tabs", async () => {
  const main = open("main");
  const first = main.panes[0]!;
  workspace.splitWorkspace(main.id, "horizontal", first.id);
  if (main.paneLayout?.type === "split") main.paneLayout.ratio = 72;
  const originalLayout = JSON.stringify(main.paneLayout);
  const group = workspace.createTabGroup(main.id, "Main")!;
  const other = open("other");
  const borrowed = open("borrowed");
  const borrowedPane = borrowed.panes[0]!;
  const otherGroup = workspace.createTabGroup(borrowed.id, "Other")!;
  otherGroup.collapsed = true;
  const last = open("last");
  const order = workspace.tabs.value.map((tab) => tab.id);
  workspace.setActivePane(first.id);
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [borrowed.id])!;
  const dispose = vi.fn();
  workspace.registerSessionDisposer(dispose);
  workspace.mergeTabIntoWorkspace(borrowed.id, main.id, first.id, "right");
  workspace.setPaneLayout(main.id, {
    type: "split",
    direction: "vertical",
    ratio: 50,
    first: { type: "pane", paneId: first.id },
    second: {
      type: "split",
      direction: "horizontal",
      ratio: 50,
      first: { type: "pane", paneId: main.panes[1]!.id },
      second: { type: "pane", paneId: borrowedPane.id }
    }
  });
  const added = open("added");
  restore();
  await Promise.resolve();
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([...order, added.id]);
  expect(JSON.stringify(main.paneLayout)).toBe(originalLayout);
  expect(main.group).toBe(group);
  expect(borrowed.group).toBe(otherGroup);
  expect(otherGroup.collapsed).toBe(true);
  expect(borrowed.panes[0]).toBe(borrowedPane);
  expect(workspace.activeTabId.value).toBe(added.id);
  expect(dispose).not.toHaveBeenCalled();
  expect(workspace.tabs.value).toContain(other);
  expect(workspace.tabs.value).toContain(last);
});

it("keeps new panes and never resurrects closed original or imported sessions", async () => {
  const main = open("main");
  const closedOriginal = main.panes[0]!;
  const survivor = workspace.splitWorkspace(main.id, "horizontal", closedOriginal.id)[0]!;
  const closedImport = open("closed");
  const imported = open("imported");
  workspace.setActivePane(closedOriginal.id);
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [closedImport.id, imported.id])!;
  workspace.mergeTabIntoWorkspace(closedImport.id, main.id);
  workspace.mergeTabIntoWorkspace(imported.id, main.id);
  const added = workspace.splitWorkspace(main.id, "vertical", survivor.id)[0]!;
  await workspace.closePane(closedImport.panes[0]!.id);
  await workspace.closePane(closedOriginal.id);
  restore();
  await Promise.resolve();
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([main.id, imported.id]);
  expect(main.panes.map((pane) => pane.id)).toEqual([survivor.id, added.id]);
  expect(measureWorkspaceLayout(main.paneLayout!).panes.size).toBe(2);
  expect(imported.panes[0]!.assetName).toBe("imported");
  const ids = workspace.tabs.value.flatMap((tab) => tab.panes.map((pane) => pane.id));
  expect(ids).not.toContain(closedOriginal.id);
  expect(ids).not.toContain(closedImport.panes[0]!.id);
});

it("does not reopen any session after the entire temporary workspace was closed", async () => {
  const main = open("main");
  const borrowed = open("borrowed");
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [borrowed.id])!;
  workspace.mergeTabIntoWorkspace(borrowed.id, main.id);
  const added = open("added");
  await workspace.closeSession(main.id);
  restore();
  await Promise.resolve();
  expect(workspace.tabs.value).toEqual([added]);
});

it("leaves an existing split workspace intact when broadcasting did not import tabs", async () => {
  const main = open("main");
  workspace.splitWorkspace(main.id, "vertical");
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [])!;
  if (main.paneLayout?.type === "split") main.paneLayout.ratio = 61;
  restore();
  await Promise.resolve();
  expect(main.paneLayout).toMatchObject({ ratio: 61 });
});

it.each(["pane", "tab"])(
  "waits for the %s close mutation before restoring from a synchronous disconnect",
  async (kind) => {
    const main = open("main");
    const b = open("b");
    const c = open("c");
    const participants = [main.panes[0]!.id, b.panes[0]!.id, c.panes[0]!.id];
    const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [b.id, c.id])!;
    workspace.mergeTabIntoWorkspace(b.id, main.id);
    workspace.mergeTabIntoWorkspace(c.id, main.id);
    participants.forEach((id) => registerKokoBroadcastEndpoint(id, { canSend: () => true, send: vi.fn() }));
    startKokoTerminalBroadcast(main.id, participants[0]!, participants.slice(1), () => true, restore);
    workspace.registerSessionDisposer(() => stopKokoTerminalBroadcast());
    if (kind === "pane") await workspace.closePane(b.panes[0]!.id);
    else await workspace.closeSession(main.id);
    await Promise.resolve();
    expect(workspace.tabs.value.map((tab) => tab.id)).toEqual(kind === "pane" ? [main.id, c.id] : []);
    expect(workspace.tabs.value.flatMap((tab) => tab.panes).some((pane) => pane.id === participants[1])).toBe(false);
    participants.forEach(unregisterKokoBroadcastEndpoint);
  }
);

it("adds and releases temporary targets while retaining their tab identities and the original layout", async () => {
  const main = open("main");
  workspace.splitWorkspace(main.id, "horizontal", main.panes[0]!.id);
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [])!;
  if (main.paneLayout?.type === "split") main.paneLayout.ratio = 68;
  const originalLayout = JSON.stringify(main.paneLayout);
  const b = open("b");
  const bPane = b.panes[0]!;
  expect(workspace.extendTemporaryWorkspaceLayout(main.id, [b.id])).toBe(true);
  workspace.mergeTabIntoWorkspace(b.id, main.id);
  const c = open("c");
  expect(workspace.extendTemporaryWorkspaceLayout(main.id, [c.id])).toBe(true);
  workspace.mergeTabIntoWorkspace(c.id, main.id);
  const dispose = vi.fn();
  workspace.registerSessionDisposer(dispose);
  workspace.releaseTemporaryWorkspaceTabs(main.id, [bPane.id]);
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([main.id, b.id]);
  expect(b.panes[0]).toBe(bPane);
  expect(main.panes.some((pane) => pane.id === c.panes[0]!.id)).toBe(true);
  workspace.releaseTemporaryWorkspaceTabs(main.id, [c.panes[0]!.id]);
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([main.id, b.id, c.id]);
  expect(JSON.stringify(main.paneLayout)).toBe(originalLayout);
  expect(workspace.extendTemporaryWorkspaceLayout(main.id, [b.id])).toBe(true);
  workspace.mergeTabIntoWorkspace(b.id, main.id);
  await restore();
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([main.id, b.id, c.id]);
  expect(JSON.stringify(main.paneLayout)).toBe(originalLayout);
  expect(dispose).not.toHaveBeenCalled();
});

it("reserves creation of broadcast panes for target management while ordinary tabs remain editable", async () => {
  const main = open("main");
  const target = open("target");
  const extra = open("extra");
  const ids = [main.panes[0]!.id, target.panes[0]!.id, extra.panes[0]!.id];
  ids.forEach((id) => registerKokoBroadcastEndpoint(id, { canSend: () => true, send: vi.fn() }));
  const restore = workspace.beginTemporaryWorkspaceLayout(main.id, [target.id])!;
  workspace.mergeTabIntoWorkspace(target.id, main.id);
  expect(
    startKokoTerminalBroadcast(
      main.id,
      ids[0]!,
      [ids[1]!],
      () => true,
      () => {
        void restore();
      }
    )
  ).toBe(true);
  expect(workspace.canSplitWorkspace(main.id, "horizontal")).toBe(false);
  expect(workspace.canSplitWorkspace(main.id, "vertical")).toBe(false);
  expect(workspace.splitWorkspace(main.id, "horizontal")).toEqual([]);
  expect(workspace.canSplitWorkspace(extra.id, "vertical")).toBe(true);
  expect(workspace.canMergeTabs(extra.id, main.id)).toBe(false);
  expect(workspace.mergeTabIntoWorkspace(extra.id, main.id)).toBe(false);
  expect(workspace.canMergeTabs(extra.id, main.id, true)).toBe(true);
  expect(workspace.extendTemporaryWorkspaceLayout(main.id, [extra.id])).toBe(true);
  expect(workspace.mergeTabIntoWorkspace(extra.id, main.id, ids[1]!, "bottom", true)).toBe(true);
  stopKokoTerminalBroadcast();
  await Promise.resolve();
  expect(workspace.canSplitWorkspace(main.id, "horizontal")).toBe(true);
  expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([main.id, target.id, extra.id]);
  ids.forEach(unregisterKokoBroadcastEndpoint);
});
