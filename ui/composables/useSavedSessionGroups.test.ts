import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
import {
  getSessionGroupStorageKey,
  normalizeSavedSessionGroups,
  persistSessionGroup,
  sessionGroupSaveError,
  snapshotSessionPane,
  useSavedSessionGroups
} from "./useSavedSessionGroups";

const mocks = vi.hoisted(() => ({ user: null as any, detail: vi.fn(), script: vi.fn(), launch: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.user }));
vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/composables/useAclDialog", () => ({ closeAclScope: vi.fn() }));
vi.mock("~/composables/useSettingManager", () => ({ useSettingManager: () => ({ collapse: { value: false } }) }));
vi.mock("~/composables/useApiRequest", () => ({ getAssetDetailRequest: mocks.detail, apiRequest: mocks.script }));

const workspace = useWorkspaceTabs();
const stored = new Map<string, string>();
const account = { id: "account-root", name: "root", username: "root", alias: "root" };
function open(name: string, protocol = "ssh") {
  workspace.openSession(
    { id: name, name, address: "10.0.0.1", org_id: "org-a", permedAccounts: [account] } as AssetItem,
    { protocol, account: "root", connectMethod: "web_cli_native", newTab: true }
  );
  return workspace.activeTab.value!;
}
function makeGroup() {
  const a = open("a");
  const b = open("b");
  const group = workspace.createTabGroup(a.id, "Production")!;
  workspace.moveTabToGroup(b.id, group.id);
  return { a, b, group };
}

beforeEach(async () => {
  await workspace.closeAllSessions({ force: true });
  stored.clear();
  vi.clearAllMocks();
  sessionGroupSaveError.value = "";
  mocks.user = reactive({ loggedIn: true, currentSite: "https://site-a.example", currentUser: { userId: "user-a" } });
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value)
  });
  vi.stubGlobal("useWorkspaceTabs", () => workspace);
  vi.stubGlobal("useConnectionLauncher", () => ({ launchWithInfo: mocks.launch }));
  vi.stubGlobal("useConnectMethods", () => ({
    getMethodsForProtocol: async () => [{ value: "web_cli_native", type: "web" }]
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useEventListener", vi.fn());
  vi.stubGlobal("isDesktopRuntime", () => false);
  mocks.detail.mockImplementation(async (id: string) => ({
    id,
    name: id,
    org_id: "org-a",
    permed_accounts: [account],
    permed_protocols: [{ name: "ssh" }]
  }));
  mocks.launch.mockImplementation(async (asset, info, options) => {
    options.assertCurrent();
    workspace.openSession(asset, {
      protocol: info.protocol,
      account: info.account,
      paneId: options.paneId,
      payload: { id: "fresh-token" }
    });
    return true;
  });
});
afterEach(async () => {
  await workspace.closeAllSessions({ force: true });
  vi.unstubAllGlobals();
});

describe("saved session groups", () => {
  it("saves named groups and edits, keeps closed members, and reopens with fresh permissions and tokens", async () => {
    const { a, b, group } = makeGroup();
    const groups = useSavedSessionGroups();
    expect(groups.savedGroups.value[0]?.tabs).toHaveLength(2);
    workspace.renameTabGroup(group.id, "Servers");
    await workspace.closeSession(a.id);
    await workspace.closeSession(b.id);
    expect(groups.savedGroups.value[0]).toMatchObject({ title: "Servers", tabs: [{}, {}] });
    const failures = await groups.openSavedGroup(group.id);
    expect(failures).toEqual([]);
    expect(workspace.tabs.value.map((tab) => tab.assetId)).toEqual(["a", "b"]);
    expect(workspace.tabs.value.every((tab) => tab.group?.id === group.id)).toBe(true);
    expect(mocks.detail).toHaveBeenCalledWith("a", "org-a");
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(workspace.tabs.value[0]?.payload?.id).toBe("fresh-token");
    await groups.openSavedGroup(group.id);
    expect(workspace.tabs.value).toHaveLength(2);
  });

  it("does not persist temporary groups until they are named", () => {
    const a = open("a");
    const b = open("b");
    workspace.groupTabs(a.id, b.id);
    const groups = useSavedSessionGroups();
    expect(groups.savedGroups.value).toEqual([]);
    expect(stored.size).toBe(0);
    workspace.renameTabGroup(a.group!.id, "Daily");
    expect(groups.savedGroups.value[0]?.tabs).toHaveLength(2);
    groups.removeSavedGroup(a.group!.id);
    workspace.renameTabTitle(a.id, "renamed");
    expect(groups.savedGroups.value).toEqual([]);
    expect(workspace.tabs.value).toHaveLength(2);
  });

  it("reopens missing members without replacing sessions that are still open", async () => {
    const { a, b, group } = makeGroup();
    const groups = useSavedSessionGroups();
    await workspace.closeSession(a.id);
    await groups.openSavedGroup(group.id);
    expect(workspace.tabs.value.map((tab) => tab.assetId)).toEqual(["a", "b"]);
    expect(workspace.tabs.value[1]).toBe(b);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
  });

  it("isolates users and sites, including late mutations from the previous account", () => {
    const { a, group } = makeGroup();
    const groups = useSavedSessionGroups();
    const key = getSessionGroupStorageKey();
    mocks.user.currentUser.userId = "user-b";
    expect(groups.savedGroups.value).toEqual([]);
    workspace.renameTabTitle(a.id, "late update");
    expect(stored.has(getSessionGroupStorageKey())).toBe(false);
    mocks.user.currentUser.userId = "user-a";
    mocks.user.currentSite = "https://site-b.example";
    expect(groups.savedGroups.value).toEqual([]);
    persistSessionGroup(group, workspace.tabs.value);
    expect(stored.size).toBe(1);
    expect(stored.has(key)).toBe(true);
    mocks.user.loggedIn = false;
    expect(groups.savedGroups.value).toEqual([]);
  });

  it("strips all secrets and rejects malformed or incomplete saved groups", () => {
    const { a, group } = makeGroup();
    a.panes[0]!.payload = { id: "secret-token", token: { id: "secret-token", value: "secret-value" } };
    a.panes[0]!.setupDraft = { manualPassword: "secret-password", dynamicPassword: "secret-otp" } as any;
    persistSessionGroup(group, workspace.tabs.value);
    expect([...stored.values()].join()).not.toContain("secret-");
    const raw = JSON.parse(stored.get(getSessionGroupStorageKey())!);
    raw[0].tabs[0].panes[0].connection.manualPassword = "injected-secret";
    raw[0].tabs[0].panes[0].asset.savedConnection = { manualPassword: "injected-secret" };
    expect(JSON.stringify(normalizeSavedSessionGroups(raw))).not.toContain("injected-secret");
    raw[0].tabs.push({ panes: [{ kind: "unknown" }] });
    expect(normalizeSavedSessionGroups(raw)).toEqual([]);
    expect(normalizeSavedSessionGroups({})).toEqual([]);
  });

  it("preserves split layouts and leaves unavailable account choices in setup", async () => {
    const a = open("a");
    workspace.splitWorkspace(a.id, "horizontal");
    const group = workspace.createTabGroup(a.id, "Split")!;
    const groups = useSavedSessionGroups();
    await workspace.closeAllSessions({ force: true });
    mocks.detail.mockResolvedValue({ name: "a", permed_accounts: [], permed_protocols: [{ name: "ssh" }] });
    expect(await groups.openSavedGroup(group.id)).toEqual([]);
    expect(workspace.tabs.value[0]).toMatchObject({
      layoutMode: "rows-2",
      panes: [{ mode: "setup" }, { mode: "empty" }]
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(groups.savedGroups.value[0]?.tabs[0]?.panes).toHaveLength(2);
  });

  it("continues opening other members when one request fails and does not overwrite the saved group", async () => {
    const { group } = makeGroup();
    const groups = useSavedSessionGroups();
    await workspace.closeAllSessions({ force: true });
    mocks.detail.mockRejectedValueOnce(new Error("permission denied"));
    const failures = await groups.openSavedGroup(group.id);
    expect(failures).toEqual(["a: permission denied"]);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(workspace.tabs.value[0]?.status).toBe("failed");
    expect(groups.savedGroups.value[0]?.tabs).toHaveLength(2);
  });

  it("asks for setup when a saved connection method is unavailable instead of silently launching an external app", async () => {
    const { group } = makeGroup();
    vi.stubGlobal("useConnectMethods", () => ({
      getMethodsForProtocol: async () => [{ value: "ssh_client", type: "client" }]
    }));
    const groups = useSavedSessionGroups();
    await workspace.closeAllSessions({ force: true });
    await groups.openSavedGroup(group.id);
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(workspace.tabs.value.every((tab) => tab.panes[0]?.mode === "setup")).toBe(true);
  });

  it("does not launch late results after switching accounts or closing the restored group", async () => {
    const { group } = makeGroup();
    const groups = useSavedSessionGroups();
    await workspace.closeAllSessions({ force: true });
    let resolve!: (value: unknown) => void;
    mocks.detail.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const opening = groups.openSavedGroup(group.id);
    await groups.openSavedGroup(group.id);
    expect(workspace.tabs.value).toHaveLength(2);
    mocks.user.currentUser.userId = "user-b";
    await workspace.closeAllSessions({ force: true });
    resolve({ name: "a", permed_accounts: [account], permed_protocols: [{ name: "ssh" }] });
    await opening;
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(workspace.tabs.value).toEqual([]);
    expect(groups.openingIds.value).toEqual([]);
  });

  it("updates saved connection choices without persisting status changes", async () => {
    const { a } = makeGroup();
    a.panes[0]!.account = "@INPUT";
    a.panes[0]!.setupDraft = {
      manualUsername: "alice",
      manualPassword: "private",
      personalCredentialId: "credential-ref"
    } as any;
    await nextTick();
    const groups = useSavedSessionGroups();
    expect(groups.savedGroups.value[0]?.tabs[0]?.panes[0]).toMatchObject({
      connection: { accountMode: "manual", manualUsername: "alice", personalCredentialId: "credential-ref" }
    });
    expect([...stored.values()].join()).not.toContain("private");
  });

  it("saves only matching credential references from remembered connections", () => {
    const tab = open("manual");
    tab.panes[0]!.account = "@INPUT";
    const remembered = {
      protocol: "ssh",
      username: "@INPUT",
      accountMode: "manual" as const,
      manualUsername: "alice",
      personalCredentialId: "credential-alice",
      manualPassword: "secret-password",
      dynamicPassword: "secret-otp"
    };
    const snapshot = snapshotSessionPane(tab.panes[0]!, remembered);
    expect(snapshot).toMatchObject({
      connection: { accountMode: "manual", personalCredentialId: "credential-alice", manualUsername: "alice" }
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret-");
    tab.panes[0]!.setupDraft = { manualUsername: "bob", personalCredentialId: "" } as any;
    expect(snapshotSessionPane(tab.panes[0]!, remembered)).toMatchObject({
      connection: { personalCredentialId: undefined, manualUsername: "bob" }
    });
  });

  it("keeps explicit edits made while a group is reopening", async () => {
    const { group } = makeGroup();
    const groups = useSavedSessionGroups();
    await workspace.closeAllSessions({ force: true });
    let resolve!: (value: unknown) => void;
    mocks.detail.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const opening = groups.openSavedGroup(group.id);
    workspace.renameTabGroup(group.id, "Renamed while opening");
    resolve({ permed_accounts: [account], permed_protocols: [{ name: "ssh" }] });
    await opening;
    expect(groups.savedGroups.value[0]).toMatchObject({ title: "Renamed while opening", tabs: [{}, {}] });
  });

  it("reports storage failures and unsaved scripts without throwing away live sessions", () => {
    const script = workspace.openScriptEditor({ name: "Draft", module: "shell", args: "secret script body" })!;
    workspace.createTabGroup(script.id, "Scripts");
    expect(sessionGroupSaveError.value).toBe("SavedGroups.UnsavedScript");
    expect(stored.size).toBe(0);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      }
    });
    makeGroup();
    expect(sessionGroupSaveError.value).toBe("SavedGroups.SaveFailed");
    expect(workspace.tabs.value).toHaveLength(3);
  });
});
