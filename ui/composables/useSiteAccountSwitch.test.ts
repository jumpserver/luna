import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchCommandPanel } from "./useBatchCommandPanel";
import { useClientCompatibility } from "./useClientCompatibility";
import {
  closeCurrentSiteWorkspace,
  confirmLeaveCurrentSiteSessions,
  hasActiveWorkspaceSessions,
  registerFileWorkspaceLeaveHandler,
  useSiteAccountSwitch
} from "./useSiteAccountSwitch";
import { registerWorkspaceSessionCloseGuard, useWorkspaceTabs } from "./useWorkspaceTabs";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
const accountMocks = vi.hoisted(() => ({ user: {} as any, emit: vi.fn(), toast: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => accountMocks.user }));

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

const tabs = useWorkspaceTabs();
const { confirmOpen, confirmLeave } = useSiteAccountSwitch();
const batchPanel = useBatchCommandPanel();
const disposers: (() => void)[] = [];

function openSession() {
  return tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
}

beforeEach(async () => {
  confirmOpen.value = false;
  batchPanel.setOpen(false);
  await tabs.closeAllSessions({ force: true });
});

afterEach(() => {
  confirmOpen.value = false;
  registerFileWorkspaceLeaveHandler(null);
  disposers.splice(0).forEach((dispose) => dispose());
});

describe("site account switch isolation", () => {
  it("continues without a prompt when the workspace is empty", async () => {
    await expect(confirmLeaveCurrentSiteSessions("switch")).resolves.toBe(true);
    expect(confirmOpen.value).toBe(false);
  });

  it("closes leftover empty panes without prompting", async () => {
    const pane = openSession();
    const tab = tabs.tabs.value[0]!;
    tabs.splitWorkspace(tab.id, "vertical");
    expect(await tabs.closePane(pane.id)).toBe(true);
    expect(hasActiveWorkspaceSessions()).toBe(false);
    expect(tabs.tabs.value).toHaveLength(1);

    await expect(confirmLeaveCurrentSiteSessions("switch")).resolves.toBe(true);
    expect(confirmOpen.value).toBe(false);
    expect(tabs.tabs.value).toHaveLength(0);
  });

  it("keeps sessions when the leave prompt is cancelled", async () => {
    openSession();
    const pending = confirmLeaveCurrentSiteSessions("switch");
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    confirmOpen.value = false;
    await expect(pending).resolves.toBe(false);
    expect(tabs.tabs.value).toHaveLength(1);
  });

  it("force-closes guarded sessions after confirm", async () => {
    const pane = openSession();
    disposers.push(registerWorkspaceSessionCloseGuard(pane.id, () => false));
    expect(await tabs.closeAllSessions()).toBe(false);
    expect(tabs.tabs.value).toHaveLength(1);

    const pending = confirmLeaveCurrentSiteSessions("switch");
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    confirmLeave();
    await expect(pending).resolves.toBe(true);
    expect(tabs.tabs.value).toHaveLength(0);
  });

  it("confirms a new-site login without closing until success", async () => {
    openSession();
    batchPanel.setOpen(true);
    const pending = confirmLeaveCurrentSiteSessions("login", { close: false });
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    confirmLeave();
    await expect(pending).resolves.toBe(true);
    expect(tabs.tabs.value).toHaveLength(1);
    expect(batchPanel.batchPanelOpen.value).toBe(true);

    await closeCurrentSiteWorkspace();
    expect(tabs.tabs.value).toHaveLength(0);
    expect(batchPanel.batchPanelOpen.value).toBe(false);
  });

  it("ignores a second leave request while a prompt is open", async () => {
    openSession();
    const first = confirmLeaveCurrentSiteSessions("logout");
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    await expect(confirmLeaveCurrentSiteSessions("logout")).resolves.toBe(false);
    confirmOpen.value = false;
    await expect(first).resolves.toBe(false);
    expect(tabs.tabs.value).toHaveLength(1);
  });

  it("prompts and closes file workspace remotes without asset tabs", async () => {
    const close = vi.fn();
    registerFileWorkspaceLeaveHandler({
      hasActive: () => true,
      close
    });
    expect(hasActiveWorkspaceSessions()).toBe(true);

    const pending = confirmLeaveCurrentSiteSessions("logout");
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    confirmLeave();
    await expect(pending).resolves.toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes file workspace remotes when switching sites", async () => {
    const close = vi.fn();
    registerFileWorkspaceLeaveHandler({
      hasActive: () => true,
      close
    });

    const pending = confirmLeaveCurrentSiteSessions("switch");
    await vi.waitFor(() => expect(confirmOpen.value).toBe(true));
    confirmLeave();
    await expect(pending).resolves.toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("saved site switch feedback", () => {
  beforeEach(() => {
    accountMocks.user = { currentAccountId: "a", loggedIn: true, userMap: { b: {} }, setCurrentAccount: vi.fn() };
    accountMocks.emit.mockReset();
    accountMocks.toast.mockReset();
    useClientCompatibility().dismiss();
    vi.stubGlobal("useEventBus", () => ({ emit: accountMocks.emit }));
    vi.stubGlobal("useToast", () => ({ add: accountMocks.toast }));
    vi.stubGlobal("useNuxtApp", () => ({ $i18n: { t: (key: string) => key } }));
  });

  afterEach(() => {
    accountMocks.user = {};
    vi.unstubAllGlobals();
  });

  it("opens a known expired site's login without closing the current workspace", async () => {
    openSession();
    accountMocks.user.userMap.b.sessionExpired = true;
    await expect(useSiteAccountSwitch().switchAccount("b")).resolves.toBe(false);
    expect(accountMocks.emit).toHaveBeenCalledWith("login", { accountId: "b" });
    expect(accountMocks.user.setCurrentAccount).not.toHaveBeenCalled();
    expect(tabs.tabs.value).toHaveLength(1);
    expect(confirmOpen.value).toBe(false);
  });

  it("prefills login for an expiry discovered while switching", async () => {
    accountMocks.user.setCurrentAccount.mockImplementation(async (_id: string, options: any) => {
      accountMocks.user.userMap.b.sessionExpired = true;
      options.onAuthRequired();
      return false;
    });
    await expect(useSiteAccountSwitch().switchAccount("b")).resolves.toBe(false);
    expect(accountMocks.emit).toHaveBeenCalledWith("login", { accountId: "b" });
    expect(accountMocks.toast).not.toHaveBeenCalled();
  });

  it("shows feedback when switching fails and releases the busy state", async () => {
    accountMocks.user.setCurrentAccount.mockRejectedValue(new Error("network"));
    const { switchAccount, switchingAccountId } = useSiteAccountSwitch();
    await expect(switchAccount("b")).resolves.toBe(false);
    expect(accountMocks.toast).toHaveBeenCalledWith({ title: "Login.SwitchFailed", color: "error" });
    expect(switchingAccountId.value).toBe("");
  });

  it("ignores repeated clicks while switching and resumes after completion", async () => {
    const pending = Promise.withResolvers<boolean>();
    accountMocks.user.setCurrentAccount.mockReturnValue(pending.promise);
    const { switchAccount, switchingAccountId } = useSiteAccountSwitch();
    const first = switchAccount("b");
    await vi.waitFor(() => expect(accountMocks.user.setCurrentAccount).toHaveBeenCalledOnce());
    expect(switchingAccountId.value).toBe("b");
    await expect(switchAccount("b")).resolves.toBe(false);
    expect(accountMocks.user.setCurrentAccount).toHaveBeenCalledOnce();
    pending.resolve(true);
    await expect(first).resolves.toBe(true);
    expect(switchingAccountId.value).toBe("");
  });
});
