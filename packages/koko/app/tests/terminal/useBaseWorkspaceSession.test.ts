import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const host = {
  createTicket: vi.fn(),
  getSmartEndpoint: vi.fn(),
  getWindowOrigin: vi.fn(() => "http://127.0.0.1:3300"),
  isTauriRuntime: vi.fn(() => false),
  markSessionConnected: vi.fn(),
  markSessionFailed: vi.fn()
};

vi.mock("@jumpserver/koko/host", () => ({
  useKokoHostAdapter: () => host
}));

vi.mock("vue", async () => {
  const actual = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    provide: vi.fn()
  };
});

vi.stubGlobal("useColorMode", () => ({ value: "light" }));
vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));

const { useBaseWorkspaceSession } = await import("#koko/workspaces/useBaseWorkspaceSession");

function createTab() {
  return ref({
    id: "tab-1",
    assetId: "asset-1",
    protocol: "ssh",
    account: "root",
    payload: { id: "token-1", actions: ["copy"] }
  });
}

describe("useBaseWorkspaceSession", () => {
  beforeEach(() => {
    host.createTicket.mockReset();
    host.getSmartEndpoint.mockReset();
    host.getWindowOrigin.mockReset();
    host.getWindowOrigin.mockReturnValue("http://127.0.0.1:3300");
    host.isTauriRuntime.mockReset();
    host.isTauriRuntime.mockReturnValue(false);
    host.markSessionConnected.mockReset();
    host.markSessionFailed.mockReset();
    host.createTicket.mockResolvedValue({ ticket: "ticket-1" });
    host.getSmartEndpoint.mockResolvedValue({
      host: "koko.example.test",
      https_port: "443"
    });
  });

  it("reports a missing connection token without contacting the host", async () => {
    const session = useBaseWorkspaceSession(
      ref({
        id: "tab-1",
        assetId: "asset-1",
        payload: {}
      })
    );

    await session.prepareSession();

    expect(session.error.value).toBe("koko.fileManagement.missingConnectionToken");
    expect(session.loading.value).toBe(false);
    expect(host.createTicket).not.toHaveBeenCalled();
    expect(host.markSessionConnected).not.toHaveBeenCalled();
  });

  it("prepares connector context and marks the tab connected", async () => {
    const session = useBaseWorkspaceSession(createTab());

    const context = await session.prepareSession();

    expect(context).toMatchObject({
      component: "koko",
      tokenId: "token-1",
      ticket: "ticket-1",
      tabId: "tab-1",
      disableAutoHash: undefined,
      actions: ["copy"]
    });
    expect(host.createTicket).toHaveBeenCalledWith({ baseUrl: expect.any(String), tokenId: "token-1" });
    expect(host.markSessionConnected).toHaveBeenCalledWith("tab-1");
    expect(session.loading.value).toBe(false);
    expect(session.error.value).toBe("");
  });

  it.skipIf(import.meta.dev)("falls back to the window origin for loopback endpoints on web", async () => {
    host.getSmartEndpoint.mockResolvedValue({ value: "http://127.0.0.1:5050" });
    const session = useBaseWorkspaceSession(createTab());

    const context = await session.prepareSession();

    expect(context?.endpointUrl).toBe("http://127.0.0.1:3300");
  });

  it.skipIf(import.meta.dev)("keeps the resolved endpoint in the Tauri runtime", async () => {
    host.isTauriRuntime.mockReturnValue(true);
    host.getSmartEndpoint.mockResolvedValue({ value: "https://koko.internal:443" });
    const session = useBaseWorkspaceSession(createTab());

    const context = await session.prepareSession();

    expect(context?.endpointUrl).toBe("https://koko.internal:443");
  });

  it("falls back to cookie auth when ticket creation fails on web", async () => {
    host.createTicket.mockRejectedValue(new Error("ticket down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const session = useBaseWorkspaceSession(createTab());

    const context = await session.prepareSession();

    expect(context?.ticket).toBe("");
    expect(host.markSessionConnected).toHaveBeenCalledWith("tab-1");
    expect(host.markSessionFailed).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("marks the session failed when ticket creation fails in Tauri", async () => {
    host.isTauriRuntime.mockReturnValue(true);
    host.createTicket.mockRejectedValue(new Error("ticket down"));
    const session = useBaseWorkspaceSession(createTab());

    const context = await session.prepareSession();

    expect(context).toBeNull();
    expect(session.error.value).toContain("ticket down");
    expect(host.markSessionFailed).toHaveBeenCalledWith({
      id: "tab-1",
      assetId: "asset-1",
      protocol: "ssh",
      account: "root"
    });
  });
});
