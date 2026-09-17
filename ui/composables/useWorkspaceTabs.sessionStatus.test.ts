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

  it("shows the completed connection stage briefly", () => {
    vi.useFakeTimers();
    try {
      const pane = tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
      tabs.markSessionConnected(pane.id);

      expect(pane.connectionProgress).toBe("connected");
      vi.advanceTimersByTime(1000);
      expect(pane.connectionProgress).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds token and connected stages for at least a second", () => {
    vi.useFakeTimers();
    try {
      const pane = tabs.openSetupSession(asset);
      tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" });
      expect(pane.connectionProgress).toBe("token");

      tabs.markSessionTokenCreated({ tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" });
      expect(pane.connectionProgress).toBe("token");
      vi.advanceTimersByTime(999);
      expect(pane.connectionProgress).toBe("token");
      vi.advanceTimersByTime(1);
      expect(pane.connectionProgress).toBe("session");

      tabs.markSessionConnected(pane.id);
      expect(pane.connectionProgress).toBe("connected");
      vi.advanceTimersByTime(999);
      expect(pane.connectionProgress).toBe("connected");
      vi.advanceTimersByTime(1);
      expect(pane.connectionProgress).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the setup pane after an initial connection failure", () => {
    const pane = tabs.openSetupSession(asset);
    const draft = {
      protocol: "ssh",
      account: "root",
      manualUsername: "",
      manualPassword: "",
      personalCredentialId: "",
      personalCredentialSecretType: "password",
      savePersonalCredential: false,
      dynamicPassword: "",
      rememberSecret: false,
      rememberSelection: false,
      connectMethod: "web_cli",
      connectOptions: { disableautohash: true }
    };

    tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" }, draft);
    expect(pane.connectionProgress).toBe("token");

    tabs.updateSessionPayload({ tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" }, { id: "token" });
    tabs.markSessionFailed({ tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" });

    expect(pane.mode).toBe("setup");
    expect(pane.status).toBe("selecting");
    expect(pane.connectionProgress).toBeUndefined();
    expect(pane.setupDraft).toEqual(draft);
  });

  it("exits windowed focus mode", async () => {
    tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    expect(tabs.enterFocusMode(tabs.activeTabId.value)).toBe(true);
    expect(tabs.focusMode.value).toBe(true);

    await tabs.exitFocusMode();

    expect(tabs.focusMode.value).toBe(false);
  });
});
