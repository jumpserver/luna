import { beforeEach, describe, expect, it } from "vitest";
import { resolveAiPanelSource, useAiPanel } from "./useAiPanel";
import { useRightPanel } from "./useRightPanel";

describe("AI overlay panel", () => {
  beforeEach(() => {
    const panel = useAiPanel();
    panel.setSource("workspace");
    panel.openWorkspaceAssistant();
    panel.setOpen(false);
    const rightPanel = useRightPanel();
    rightPanel.setOpen(false);
    rightPanel.setActiveTab("session");
    rightPanel.setPanelWidth(340);
  });

  it("opens the workspace assistant without changing the resource layout", () => {
    const panel = useAiPanel();
    const rightPanel = useRightPanel();
    rightPanel.setOpen(true);
    rightPanel.setActiveTab("sftp");
    rightPanel.setPanelWidth(412);
    panel.toggleAi();
    expect(panel.open.value).toBe(true);
    expect(panel.mode.value).toBe("workspace-assistant");
    expect(rightPanel.open.value).toBe(true);
    expect(rightPanel.activeTab.value).toBe("sftp");
    expect(rightPanel.panelWidth.value).toBe(412);
  });

  it("closes and reopens globally in workspace assistant mode", () => {
    const panel = useAiPanel();
    panel.openWorkspaceAi();
    panel.toggleAi();
    expect(panel.open.value).toBe(false);
    panel.toggleAi();
    expect(panel.open.value).toBe(true);
    expect(panel.mode.value).toBe("workspace-assistant");
  });

  it("opens the resource assistant only when explicitly requested", () => {
    const panel = useAiPanel();
    panel.openWorkspaceAi();
    expect(panel.open.value).toBe(true);
    expect(panel.mode.value).toBe("workspace");
    panel.openAi();
    expect(panel.mode.value).toBe("workspace-assistant");
  });

  it("carries the exact terminal and login binding into the unified assistant once", () => {
    const panel = useAiPanel();
    const binding = { loginContext: '["site","account","org"]', resourceId: "resource-a", agentId: "agent-a" };
    panel.requestTerminalPrompt("pane-a", "Inspect the disk", binding);
    expect(panel.mode.value).toBe("workspace-assistant");
    expect(panel.open.value).toBe(true);
    const request = panel.pendingTerminalPrompt.value!;
    expect(request).toMatchObject({ ...binding, paneId: "pane-a", text: "Inspect the disk" });
    panel.takeTerminalPrompt("another-request");
    expect(panel.pendingTerminalPrompt.value).toBe(request);
    panel.takeTerminalPrompt(request.id);
    expect(panel.pendingTerminalPrompt.value).toBeNull();
  });

  it("does not switch assistants when the resource source changes", () => {
    const panel = useAiPanel();
    panel.openWorkspaceAssistant();
    panel.setSource("sftp");
    expect(panel.mode.value).toBe("workspace-assistant");
    panel.setWorkspaceAssistantActive(false);
    expect(panel.mode.value).toBe("workspace");
    expect(panel.source.value).toBe("sftp");
    panel.setSource("workspace");
    expect(panel.mode.value).toBe("workspace");
    panel.setWorkspaceAssistantActive(true);
    expect(panel.mode.value).toBe("workspace-assistant");
  });

  it.each([
    ["assets", true, "sftp", "sftp"],
    ["assets", false, "sftp", "workspace"],
    ["assets", true, "session", "workspace"],
    ["files", true, "sftp", "workspace"],
    ["tools", false, "session", "workspace"]
  ] as const)(
    "resolves %s resources without a platform fallback",
    (workspaceMode, rightPanelOpen, rightPanelTab, expected) => {
      expect(resolveAiPanelSource({ workspaceMode, rightPanelOpen, rightPanelTab })).toBe(expected);
    }
  );
});
