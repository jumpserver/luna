import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceSessionTab } from "./useWorkspaceTabs";
import { useWorkspaceTabMenu } from "./useWorkspaceTabMenu";

vi.mock("~/composables/useConnectMethods", () => ({ SFTP_FILE_EDITOR_VALUE: "sftp_file_editor" }));

const mocks = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("~/composables/useConnectTokenExchange", () => ({ exchangeConnectToken: mocks.exchange }));
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
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({ id: "new-token", value: "new-value", org_id: "asset-org" });
  getAssetDetailRequest.mockResolvedValue({ permed_accounts: [], permed_protocols: [] });
  createKokoTicket.mockResolvedValue({ ticket: "new-ticket" });
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useErrorToast", () => ({ addErrorToast }));
  vi.stubGlobal("useAssetAction", () => ({ handleAssetConnection }));
  vi.stubGlobal("useWorkspaceConnectors", () => ({ createKokoTicket }));
  vi.stubGlobal("useWorkspaceTabs", () => ({
    updateSessionPayload,
    openSession,
    openSetupSession,
    markSessionConnecting: vi.fn(),
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
