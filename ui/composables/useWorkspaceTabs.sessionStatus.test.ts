import type { AssetItem } from "~/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({ loggedIn: false }) }));

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/composables/useAclDialog", () => ({
  closeAclScope: vi.fn(),
  useAclDialog: () => ({ closeScope: vi.fn() })
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
    expect(pane.connectionProgress).toBe("connected");
    expect(tabs.tabs.value[0]?.status).toBe("disconnected");
  });

  it("keeps a ready session and a safe disconnect reason", () => {
    const pane = tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    pane.payload = { id: "token" };
    tabs.markSessionConnected(pane.id);

    tabs.markSessionDisconnected(pane.id, "\x1B[31mconnection closed\x1B[0m");

    expect(pane.status).toBe("disconnected");
    expect(pane.payload).toEqual({ id: "token" });
    expect(pane.connectionFailure).toBe("connection closed");
    expect(pane.connectionProgress).toBe("connected");

    tabs.markSessionConnecting(pane.id);
    expect(pane.connectionFailure).toBeUndefined();
    expect(pane.connectionProgress).toBe("token");
  });

  it("keeps step 3 visible when the session drops during connection progress", () => {
    const pane = tabs.openSetupSession(asset);
    tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" });
    tabs.markSessionConnected(pane.id);
    tabs.markSessionDisconnected(pane.id, "Koko 已结束会话：连接建立失败", { dismissible: true });

    expect(pane.status).toBe("disconnected");
    expect(pane.connectionProgress).toBe("connected");
    expect(pane.connectionFailure).toBe("Koko 已结束会话：连接建立失败");
    expect(pane.connectionFailureDismissible).toBe(true);
    expect(tabs.tabs.value[0]?.connectionFailureDismissible).toBe(true);

    tabs.markSessionConnecting(pane.id);
    expect(pane.connectionFailureDismissible).toBeUndefined();
  });

  it("increments the connection attempt before a new request can update the pane", () => {
    const pane = tabs.openSetupSession(asset);

    tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" });
    const firstAttempt = tabs.getSessionConnectionAttempt(pane.id);
    tabs.markSessionConnecting(pane.id);

    expect(tabs.getSessionConnectionAttempt(pane.id)).toBe(firstAttempt + 1);
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

  it("finishes the connection progress after a guide payload is ready", () => {
    vi.useFakeTimers();
    try {
      const pane = tabs.openSetupSession(asset);
      const match = { tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" };
      tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" });
      tabs.markSessionTokenCreated(match);
      tabs.updateSessionPayload(match, { id: "token", connectMethod: { value: "ssh_guide" } });

      vi.advanceTimersByTime(1000);
      expect(pane.connectionProgress).toBe("connected");
      vi.advanceTimersByTime(1000);
      expect(pane.connectionProgress).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps normal connection progress until its connector is ready", () => {
    vi.useFakeTimers();
    try {
      const pane = tabs.openSetupSession(asset);
      const match = { tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" };
      tabs.startSessionConnection(pane.id, { protocol: "ssh", account: "root" });
      tabs.markSessionTokenCreated(match);
      tabs.updateSessionPayload(match, { id: "token", connectMethod: { value: "web_cli_native" } });

      vi.advanceTimersByTime(2000);
      expect(pane.connectionProgress).toBe("session");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the progress overlay after an initial connection failure", () => {
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

    tabs.markSessionFailed(
      { tabId: pane.id, assetId: asset.id, protocol: "ssh", account: "root" },
      "ticket unavailable"
    );

    expect(pane.connectionProgress).toBe("token");
    expect(pane.status).toBe("failed");
    expect(pane.setupDraft).toEqual(draft);
    expect(pane.connectionFailure).toBe("ticket unavailable");

    tabs.resumeConnectionSetup(pane.id);
    expect(pane.mode).toBe("setup");
    expect(pane.status).toBe("selecting");
    expect(pane.connectionProgress).toBeUndefined();
  });

  it("clears connection progress when resuming without a setup form", () => {
    const pane = tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    pane.payload = { id: "token" };
    tabs.markSessionDisconnected(pane.id);
    tabs.markSessionConnecting(pane.id);
    expect(pane.connectionProgress).toBe("token");
    expect(pane.setupAsset).toBeUndefined();

    tabs.resumeConnectionSetup(pane.id);
    expect(pane.connectionProgress).toBeUndefined();
    expect(pane.status).toBe("disconnected");
    expect(pane.mode).toBe("session");
  });

  it("exits windowed focus mode", async () => {
    tabs.openSession(asset, { protocol: "ssh", account: "root", newTab: true });
    expect(tabs.enterFocusMode(tabs.activeTabId.value)).toBe(true);
    expect(tabs.focusMode.value).toBe(true);

    await tabs.exitFocusMode();

    expect(tabs.focusMode.value).toBe(false);
  });
});
