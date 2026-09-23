import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";

const markSessionConnected = vi.fn();
const markSessionFailed = vi.fn();
const createLionConnectTicket = vi.fn();

vi.mock("@/lion/hooks/useLionConnectTicket", () => ({ createLionConnectTicket }));
vi.stubGlobal("useColorMode", () => ({ value: "light" }));
vi.stubGlobal("useWorkspaceTabs", () => ({ markSessionConnected, markSessionFailed }));

const { useBaseWorkspaceSession } = await import("@/lion/workspaces/useBaseWorkspaceSession");

describe("lion workspace session preparation", () => {
  beforeEach(() => {
    markSessionConnected.mockReset();
    markSessionFailed.mockReset();
    createLionConnectTicket.mockReset();
    createLionConnectTicket.mockResolvedValue("ticket-1");
  });

  it("fails the workspace when its connection token is missing", async () => {
    const tab = ref({
      id: "tab-1",
      assetId: "asset-1",
      protocol: "rdp",
      account: "root",
      payload: {}
    } as WorkspaceSessionTab);
    const scope = effectScope();
    const session = scope.run(() => useBaseWorkspaceSession(tab))!;

    await session.prepareSession();

    expect(markSessionFailed).toHaveBeenCalledWith(
      { tabId: "tab-1", assetId: "asset-1", protocol: "rdp", account: "root" },
      "Missing connection token"
    );
    scope.stop();
  });

  it("waits for Guacamole readiness before marking the session connected", async () => {
    const tab = ref({
      id: "tab-1",
      assetId: "asset-1",
      protocol: "rdp",
      account: "root",
      payload: { id: "token-1", endpointUrl: "https://lion.example.test" }
    } as WorkspaceSessionTab);
    const scope = effectScope();
    const session = scope.run(() => useBaseWorkspaceSession(tab))!;

    const context = await session.prepareSession();

    expect(context).toMatchObject({ tokenId: "token-1", ticket: "ticket-1" });
    expect(markSessionConnected).not.toHaveBeenCalled();
    scope.stop();
  });
});
