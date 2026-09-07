import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, shallowRef } from "vue";
import { resolveAiPanelSource, resolveUnifiedAiPanel, useAiPanel } from "./useAiPanel";
import { useRightPanel } from "./useRightPanel";

const tabs = shallowRef<Array<{ id: string; protocol?: string }>>([]);
const activeTabId = shallowRef("");
const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);
const workspaceTabs = { tabs, activeTabId, activeTab };

describe("AI overlay panel", () => {
  beforeEach(() => {
    vi.stubGlobal("useWorkspaceTabs", () => workspaceTabs);
    tabs.value = [{ id: "tab-a" }, { id: "tab-b" }];
    activeTabId.value = "tab-a";
    const panel = useAiPanel();
    panel.setSource("workspace");
    panel.setOpen(false);
    panel.setPanelWidth(380);
    const rightPanel = useRightPanel();
    rightPanel.setOpen(false);
    rightPanel.setActiveTab("session");
    rightPanel.setPanelWidth(340);
  });

  afterAll(() => vi.unstubAllGlobals());

  it("hides on a new tab without destroying the previous tab visibility", () => {
    const panel = useAiPanel();
    panel.openAi();
    expect(panel.open.value).toBe(true);

    activeTabId.value = "tab-b";
    expect(panel.open.value).toBe(false);
    activeTabId.value = "tab-a";
    expect(panel.open.value).toBe(true);
  });

  it("opens Luna without changing the resource layout", () => {
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

  it("closes and reopens within the current tab", () => {
    const panel = useAiPanel();
    panel.openAi();
    panel.toggleAi();
    expect(panel.open.value).toBe(false);
    panel.toggleAi();
    expect(panel.open.value).toBe(true);
  });

  it("clamps its resizable width", () => {
    const panel = useAiPanel();
    panel.setPanelWidth(560);
    expect(panel.panelWidth.value).toBe(560);
    panel.setPanelWidth(100);
    expect(panel.panelWidth.value).toBe(320);
    panel.setPanelWidth(900);
    expect(panel.panelWidth.value).toBe(720);
  });

  it.each([
    ["assets", "", "", "workspace", undefined],
    ["assets", "ssh", "terminal", "workspace", undefined],
    ["assets", "local-shell", "", "workspace", undefined],
    ["assets", "script-editor", "", "resource", undefined],
    ["assets", "mysql", "database", "resource", undefined],
    ["assets", "mysql", "terminal", "resource", "sql"],
    ["assets", "sftp", "file-manager", "resource", undefined],
    ["files", "", "", "resource", undefined]
  ] as const)(
    "selects the %s/%s/%s AI surface automatically",
    (workspaceMode, protocol, surface, expected, sessionKind) => {
      expect(resolveUnifiedAiPanel({ workspaceMode, protocol, surface, sessionKind })).toBe(expected);
    }
  );

  it("carries the exact terminal and login binding into the unified assistant once", () => {
    const panel = useAiPanel();
    const binding = { loginContext: '["site","account","org"]', resourceId: "resource-a", agentId: "agent-a" };
    panel.requestTerminalPrompt("pane-a", "Inspect the disk", binding);
    expect(panel.open.value).toBe(true);
    const request = panel.pendingTerminalPrompt.value!;
    expect(request).toMatchObject({ ...binding, paneId: "pane-a", text: "Inspect the disk" });
    panel.takeTerminalPrompt("another-request");
    expect(panel.pendingTerminalPrompt.value).toBe(request);
    panel.takeTerminalPrompt(request.id);
    expect(panel.pendingTerminalPrompt.value).toBeNull();
  });

  it("keeps the resource source independent from panel visibility", () => {
    const panel = useAiPanel();
    panel.setSource("sftp");
    expect(panel.source.value).toBe("sftp");
    expect(panel.open.value).toBe(false);
    panel.setSource("workspace");
    expect(panel.source.value).toBe("workspace");
    expect(panel.open.value).toBe(false);
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
