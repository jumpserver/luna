import { beforeEach, describe, expect, it } from "vitest";
import { resolveAiPanelSource, useAiPanel } from "./useAiPanel";
import { useRightPanel } from "./useRightPanel";

describe("AI overlay panel", () => {
  beforeEach(() => {
    const aiPanel = useAiPanel();
    aiPanel.setSource("platform");
    aiPanel.setWorkspaceFocused(true);
    aiPanel.setOpen(false);

    const rightPanel = useRightPanel();
    rightPanel.setOpen(false);
    rightPanel.setActiveTab("session");
    rightPanel.setPanelWidth(340);
  });

  it("opens without changing layout state", () => {
    const panel = useAiPanel();
    const rightPanel = useRightPanel();
    rightPanel.setOpen(true);
    rightPanel.setActiveTab("sftp");
    rightPanel.setPanelWidth(412);

    panel.toggleAi();

    expect(panel.open.value).toBe(true);
    expect(rightPanel.open.value).toBe(true);
    expect(rightPanel.activeTab.value).toBe("sftp");
    expect(rightPanel.panelWidth.value).toBe(412);
  });

  it("closes on the next toggle", () => {
    const panel = useAiPanel();
    panel.openAi();

    panel.toggleAi();

    expect(panel.open.value).toBe(false);
  });

  it("opens workspace AI after a teleported workspace action", () => {
    const panel = useAiPanel();
    panel.setWorkspaceFocused(false);

    panel.openWorkspaceAi();

    expect(panel.open.value).toBe(true);
    expect(panel.source.value).toBe("workspace");
    expect(panel.workspaceFocused.value).toBe(true);
  });

  it("uses platform AI without a connected asset", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "assets",
        surfaceStatus: "ready",
        surfaceAssetId: "asset-1",
        standaloneWorkspace: false,
        workspaceFocused: true,
        rightPanelOpen: false,
        rightPanelTab: "session"
      })
    ).toBe("platform");
  });

  it("uses workspace AI for the active connected asset", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "assets",
        surfaceStatus: "connected",
        surfaceAssetId: "asset-1",
        standaloneWorkspace: false,
        workspaceFocused: true,
        rightPanelOpen: false,
        rightPanelTab: "session"
      })
    ).toBe("workspace");
  });

  it("uses workspace AI for the script editor without a connected asset", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "assets",
        surfaceStatus: "ready",
        surfaceAssetId: "script-1",
        surfaceProtocol: "script-editor",
        standaloneWorkspace: false,
        workspaceFocused: true,
        rightPanelOpen: false,
        rightPanelTab: "session"
      })
    ).toBe("workspace");
  });

  it("uses file AI when the connected asset's SFTP panel is active", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "assets",
        surfaceStatus: "connected",
        surfaceAssetId: "asset-1",
        standaloneWorkspace: false,
        workspaceFocused: true,
        rightPanelOpen: true,
        rightPanelTab: "sftp"
      })
    ).toBe("sftp");
  });

  it("returns to platform AI outside the asset workspace", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "tools",
        surfaceStatus: "connected",
        surfaceAssetId: "asset-1",
        standaloneWorkspace: false,
        workspaceFocused: true,
        rightPanelOpen: false,
        rightPanelTab: "session"
      })
    ).toBe("platform");
  });

  it("returns to platform AI after focus leaves a connected asset", () => {
    expect(
      resolveAiPanelSource({
        workspaceMode: "assets",
        surfaceStatus: "connected",
        surfaceAssetId: "asset-1",
        standaloneWorkspace: false,
        workspaceFocused: false,
        rightPanelOpen: false,
        rightPanelTab: "session"
      })
    ).toBe("platform");
  });
});
