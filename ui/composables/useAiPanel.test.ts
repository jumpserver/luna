import { useLocalStorage } from "@vueuse/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, shallowRef } from "vue";
import { resolveUnifiedAiPanel, useAiPanel } from "./useAiPanel";
import { useRightPanel } from "./useRightPanel";
import { setWorkspaceAiEnabled } from "~/shared/aiAvailability";

const tabs = shallowRef<Array<{ id: string; protocol?: string }>>([]);
const activeTabId = shallowRef("");
const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null);
const workspaceTabs = { tabs, activeTabId, activeTab };
const narrow = shallowRef(false);
const saved = new Map<string, string>();
const storage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
  removeItem: (key: string) => saved.delete(key)
};

vi.mock("@vueuse/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...original,
    useMediaQuery: () => narrow,
    useLocalStorage: vi.fn((key, initial, options) =>
      original.useStorage(key, initial, storage, { ...options, flush: "sync" })
    )
  };
});

describe("AI overlay panel", () => {
  beforeEach(async () => {
    narrow.value = false;
    setWorkspaceAiEnabled(true);
    await nextTick();
    vi.stubGlobal("useWorkspaceTabs", () => workspaceTabs);
    tabs.value = [{ id: "tab-a" }, { id: "tab-b" }];
    activeTabId.value = "tab-a";
    const panel = useAiPanel();
    panel.setOpen(false);
    panel.setPanelWidth(380);
    const rightPanel = useRightPanel();
    rightPanel.setOpen(false);
    rightPanel.setActiveTab("session");
    rightPanel.setPanelWidth(340);
  });

  afterAll(() => vi.unstubAllGlobals());

  it("defaults to open on desktop and remembers visibility across tabs and consumers", () => {
    const panel = useAiPanel();
    expect(useLocalStorage).toHaveBeenCalledWith("jumpserver-client:ai-panel-open", true, { writeDefaults: false });
    panel.openAi();
    expect(panel.open.value).toBe(true);

    activeTabId.value = "tab-b";
    expect(panel.open.value).toBe(true);
    useAiPanel().setOpen(false);
    activeTabId.value = "tab-a";
    expect(panel.open.value).toBe(false);
    expect(saved.get("jumpserver-client:ai-panel-open")).toBe("false");
    expect(useLocalStorage("jumpserver-client:ai-panel-open", true).value).toBe(false);
  });

  it("starts narrow screens closed and preserves the desktop preference", async () => {
    const panel = useAiPanel();
    panel.openAi();
    narrow.value = true;
    await nextTick();
    expect(panel.open.value).toBe(false);
    panel.openAi();
    expect(useAiPanel().open.value).toBe(true);
    panel.setOpen(false);
    expect(saved.get("jumpserver-client:ai-panel-open")).toBe("true");
    narrow.value = false;
    await nextTick();
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
    expect(useAiPanel().panelWidth.value).toBe(560);
    expect(saved.get("jumpserver-client:ai-panel-width")).toBe("560");
    expect(useLocalStorage("jumpserver-client:ai-panel-width", 380).value).toBe(560);
    panel.setPanelWidth(100);
    expect(panel.panelWidth.value).toBe(320);
    panel.setPanelWidth(900);
    expect(panel.panelWidth.value).toBe(720);
    panel.setPanelWidth(Number.NaN);
    expect(panel.panelWidth.value).toBe(380);
  });

  it("blocks opening and clears terminal prompts when AI is disabled without losing preferences", () => {
    const panel = useAiPanel();
    panel.openAi();
    activeTabId.value = "tab-b";
    panel.openAi();
    const binding = { loginContext: "login", resourceId: "resource", agentId: "agent" };
    panel.requestTerminalPrompt("pane", "Inspect", binding);
    setWorkspaceAiEnabled(false);
    expect(panel.open.value).toBe(false);
    expect(panel.pendingTerminalPrompt.value).toBeNull();
    panel.toggleAi();
    panel.requestTerminalPrompt("pane", "Inspect", binding);
    expect(panel.open.value).toBe(false);
    expect(panel.pendingTerminalPrompt.value).toBeNull();
    setWorkspaceAiEnabled(true);
    expect(panel.open.value).toBe(true);
    activeTabId.value = "tab-a";
    expect(panel.open.value).toBe(true);
  });

  it.each([
    ["assets", "", "", "workspace", undefined],
    ["assets", "ssh", "terminal", "workspace", undefined],
    ["assets", "local-shell", "", "workspace", undefined],
    ["assets", "script-editor", "", "resource", undefined],
    ["assets", "mysql", "database", "resource", undefined],
    ["assets", "mysql", "terminal", "resource", "sql"],
    ["assets", "sftp", "file-manager", "resource", undefined],
    ["assets", "rdp", "remote-desktop", "workspace", undefined],
    ["assets", "vnc", "remote-desktop", "workspace", undefined],
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
    expect(panel.open.value).toBe(false);
    const request = panel.pendingTerminalPrompt.value!;
    expect(request).toMatchObject({ ...binding, paneId: "pane-a", text: "Inspect the disk" });
    panel.takeTerminalPrompt("another-request");
    expect(panel.pendingTerminalPrompt.value).toBe(request);
    panel.takeTerminalPrompt(request.id);
    expect(panel.pendingTerminalPrompt.value).toBeNull();
  });
});
