import type { AssetItem } from "~/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTabs } from "./useWorkspaceTabs";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));

const asset: AssetItem = {
  id: "asset-1",
  name: "host",
  address: "10.0.0.1",
  org_id: "org-1",
  platform: "Linux",
  zone: "",
  type: "linux",
  category: "host",
  isActive: true
};

const tabs = useWorkspaceTabs();

describe("workspace session disconnect status", () => {
  beforeEach(async () => {
    await tabs.closeAllSessions({ force: true });
  });

  it("clears connected status so duration stops after the socket closes", () => {
    const pane = tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    tabs.markSessionConnected(pane.id);

    expect(pane.status).toBe("connected");
    expect(pane.connectedAt).toEqual(expect.any(Number));
    expect(tabs.tabs.value[0]?.status).toBe("connected");

    tabs.markSessionDisconnected(pane.id);

    expect(pane.status).toBe("disconnected");
    expect(tabs.tabs.value[0]?.status).toBe("disconnected");
  });

  it("exits windowed focus mode", async () => {
    tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    expect(tabs.enterFocusMode(tabs.activeTabId.value)).toBe(true);
    expect(tabs.focusMode.value).toBe(true);

    await tabs.exitFocusMode();

    expect(tabs.focusMode.value).toBe(false);
  });
});
