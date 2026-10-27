import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { WorkspaceSessionTab } from "./useWorkspaceTabs";
import { useWorkspaceTabMenu } from "./useWorkspaceTabMenu";

vi.mock("~/composables/useConnectMethods", () => ({ SFTP_FILE_EDITOR_VALUE: "sftp_file_editor" }));

const mocks = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("~/composables/useConnectTokenExchange", async (original) => ({
  ...(await original<typeof import("./useConnectTokenExchange")>()),
  exchangeConnectToken: mocks.exchange
}));
const getAssetDetailRequest = vi.fn();
vi.mock("~/composables/useApiRequest", () => ({
  getAssetDetailRequest: (...args: unknown[]) => getAssetDetailRequest(...args)
}));

const createKokoTicket = vi.fn();
const updateSessionPayload = vi.fn();
const openSession = vi.fn((_asset: unknown, _options: { payload?: unknown }) => ({ id: "new-pane" }));
const openSetupSession = vi.fn();
const handleAssetConnection = vi.fn();
const addErrorToast = vi.fn();
const markSessionConnecting = vi.fn();
const markSessionConnected = vi.fn();
const markSessionDisconnected = vi.fn();
const getSessionConnectionAttempt = vi.fn();
const tabs = ref<WorkspaceSessionTab[]>([]);

function session(webProxy = true) {
  return {
    id: "pane",
    assetId: "asset",
    protocol: "https",
    account: "user",
    payload: {
      id: "old-token",
      value: "old-value",
      token: { id: "old-token", value: "old-value" },
      connectMethod: { value: "web_proxy" },
      ...(webProxy
        ? {
            webProxy: {
              targetUrl: "https://asset.example",
              proxyUrl: "http://proxy.example:5001",
              ticketEndpoint: "https://koko.example",
              ticket: "old-ticket"
            }
          }
        : {})
    }
  } as WorkspaceSessionTab;
}

beforeEach(() => {
  vi.resetAllMocks();
  tabs.value = [];
  getSessionConnectionAttempt.mockReturnValue(1);
  openSession.mockReturnValue({ id: "new-pane" });
  mocks.exchange.mockResolvedValue({ id: "new-token", value: "new-value", org_id: "asset-org" });
  getAssetDetailRequest.mockResolvedValue({ permed_accounts: [], permed_protocols: [] });
  createKokoTicket.mockResolvedValue({ ticket: "new-ticket" });
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useErrorToast", () => ({ addErrorToast }));
  vi.stubGlobal("useAssetAction", () => ({ handleAssetConnection }));
  vi.stubGlobal("useWorkspaceConnectors", () => ({ createKokoTicket }));
  vi.stubGlobal("useWorkspaceTabs", () => ({
    tabs,
    updateSessionPayload,
    openSession,
    openSetupSession,
    markSessionConnecting,
    markSessionConnected,
    markSessionDisconnected,
    getSessionConnectionAttempt,
    setActiveSession: vi.fn()
  }));
});

it("opens connection setup when a reconnect cannot exchange its token and the account needs a secret", async () => {
  mocks.exchange.mockRejectedValue(new Error("token expired"));
  getAssetDetailRequest.mockResolvedValue({
    permed_accounts: [{ id: "account-1", name: "user", username: "user", alias: "user", has_secret: false }],
    permed_protocols: []
  });
  const tab = {
    ...session(false),
    permedAccounts: [{ id: "account-1", name: "user", username: "user", alias: "user", has_secret: false }]
  } as WorkspaceSessionTab;

  await useWorkspaceTabMenu().reconnectSession(tab);
  await vi.waitFor(() =>
    expect(openSetupSession).toHaveBeenCalledWith(expect.anything(), { protocol: "https", paneId: "pane" })
  );
  expect(handleAssetConnection).not.toHaveBeenCalled();
});
afterEach(() => vi.unstubAllGlobals());

it.each(["reconnect", "clone", "pane"])("renews the token and bound ticket for %s", async (action) => {
  const tab = session();
  const menu = useWorkspaceTabMenu();
  if (action === "reconnect") await menu.reconnectSession(tab);
  else if (action === "clone") await menu.cloneSession(tab);
  else await menu.connectCurrentPane(tab, { id: "other-pane" } as never);

  expect(mocks.exchange).toHaveBeenCalledWith("old-token");
  expect(createKokoTicket).toHaveBeenCalledWith({
    baseUrl: "https://koko.example",
    tokenId: "new-token",
    orgId: "asset-org"
  });
  const payload = action === "clone" ? openSession.mock.calls[0]![1].payload : updateSessionPayload.mock.calls[0]![1];
  expect(payload).toMatchObject({
    id: "new-token",
    value: "new-value",
    token: { id: "new-token", value: "new-value" },
    webProxy: { ...tab.payload!.webProxy, ticket: "new-ticket" }
  });
  expect(tab.payload!.webProxy!.ticket).toBe("old-ticket");
});

it.each(["missing", "rejected", "legacy"])(
  "never publishes a stale ticket when ticket renewal is %s",
  async (failure) => {
    const tab = session();
    if (failure === "missing") createKokoTicket.mockResolvedValue({});
    if (failure === "rejected") createKokoTicket.mockRejectedValue(new Error("ticket failed"));
    if (failure === "legacy") delete tab.payload!.webProxy!.ticketEndpoint;
    await useWorkspaceTabMenu().reconnectSession(tab);
    expect(updateSessionPayload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(handleAssetConnection).toHaveBeenCalled());
  }
);

it("keeps ordinary workspace token exchange independent of Web Proxy tickets", async () => {
  await useWorkspaceTabMenu().reconnectSession(session(false));
  expect(createKokoTicket).not.toHaveBeenCalled();
  expect(updateSessionPayload.mock.calls[0]![1]).toMatchObject({ id: "new-token", value: "new-value" });
});

async function cancelExchange() {
  const { exchangeConnectToken } =
    await vi.importActual<typeof import("./useConnectTokenExchange")>("./useConnectTokenExchange");
  vi.stubGlobal("exchangeConnectionToken", vi.fn().mockResolvedValue({ id: "pending-token", is_active: false }));
  vi.stubGlobal("useAclDialog", () => ({ request: () => Promise.resolve(null) }));
  mocks.exchange.mockImplementation(exchangeConnectToken);
}

it.each(["reconnect", "clone", "pane", "automation"])(
  "does not start another connection after the user cancels %s ACL",
  async (action) => {
    await cancelExchange();
    const tab = session(false);
    const menu = useWorkspaceTabMenu();
    if (action === "reconnect") await menu.reconnectSession(tab);
    else if (action === "automation") await menu.reconnectSession(tab, vi.fn());
    else if (action === "clone") await menu.cloneSession(tab);
    else await menu.connectCurrentPane(tab, { id: "other-pane" } as never);
    await Promise.resolve();

    expect(handleAssetConnection).not.toHaveBeenCalled();
    expect(openSetupSession).not.toHaveBeenCalled();
    expect(updateSessionPayload).not.toHaveBeenCalled();
    expect(addErrorToast).not.toHaveBeenCalled();
    if (action === "pane") expect(markSessionDisconnected).toHaveBeenCalledWith("other-pane");
  }
);

function surfaceSnapshot(status: "connected" | "disconnected") {
  const pane = { ...session(false), protocol: "postgresql", status, mode: "session" as const };
  tabs.value = [{ ...pane, panes: [pane] }] as WorkspaceSessionTab[];
  const currentPane = tabs.value[0]!.panes[0]!;
  // Pane surfaces receive toSurfaceTab(pane), a shallow snapshot of status.
  const snapshot: WorkspaceSessionTab = { ...currentPane, layoutMode: "single", panes: [currentPane] };
  markSessionConnecting.mockImplementation(() => {
    currentPane.status = "connecting";
  });
  return { currentPane, snapshot };
}

it.each(["connected", "disconnected"] as const)(
  "restores the original %s Chen pane when exchange ACL is cancelled",
  async (status) => {
    await cancelExchange();
    const { snapshot } = surfaceSnapshot(status);
    await useWorkspaceTabMenu().reconnectSession(snapshot);
    expect(status === "connected" ? markSessionConnected : markSessionDisconnected).toHaveBeenCalledWith("pane");
    expect(status === "connected" ? markSessionDisconnected : markSessionConnected).not.toHaveBeenCalled();
    expect(snapshot.status).toBe(status);
    expect(snapshot.payload!.id).toBe("old-token");
  }
);

it.each(["new-attempt", "closed", "removed"])("does not restore a stale connection after %s", async (change) => {
  await cancelExchange();
  const { currentPane, snapshot } = surfaceSnapshot("connected");
  const reconnecting = useWorkspaceTabMenu().reconnectSession(snapshot);
  if (change === "new-attempt") getSessionConnectionAttempt.mockReturnValue(2);
  else if (change === "removed") tabs.value = [];
  else currentPane.status = "disconnected";
  await reconnecting;
  expect(markSessionConnected).not.toHaveBeenCalled();
  expect(markSessionDisconnected).not.toHaveBeenCalled();
});
