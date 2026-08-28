import { beforeEach, describe, expect, it } from "vitest";
import { useAiPanel } from "./useAiPanel";
import { useRightPanel } from "./useRightPanel";

describe("AI overlay panel", () => {
  beforeEach(() => {
    const aiPanel = useAiPanel();
    aiPanel.openAi();
    aiPanel.setOpen(false);

    const rightPanel = useRightPanel();
    rightPanel.setOpen(false);
    rightPanel.setActiveTab("session");
    rightPanel.setPanelWidth(340);
  });

  it("opens with the selected workspace context without changing layout state", () => {
    const panel = useAiPanel();
    const rightPanel = useRightPanel();
    rightPanel.setOpen(true);
    rightPanel.setActiveTab("sftp");
    rightPanel.setPanelWidth(412);

    panel.toggleAi("sftp");

    expect(panel.open.value).toBe(true);
    expect(panel.source.value).toBe("sftp");
    expect(rightPanel.open.value).toBe(true);
    expect(rightPanel.activeTab.value).toBe("sftp");
    expect(rightPanel.panelWidth.value).toBe(412);
  });

  it("closes on the next toggle without changing its context", () => {
    const panel = useAiPanel();
    panel.openAi("sftp");

    panel.toggleAi();

    expect(panel.open.value).toBe(false);
    expect(panel.source.value).toBe("sftp");
  });

  it("uses the active workspace session for programmatic AI entry", () => {
    const panel = useAiPanel();
    panel.openAi("sftp");

    panel.openAi();

    expect(panel.source.value).toBe("workspace");
  });
});
