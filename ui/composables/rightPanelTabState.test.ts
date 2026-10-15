import { beforeEach, describe, expect, it } from "vitest";
import {
  nextRightPanelTab,
  rememberedRightPanelTab,
  rememberRightPanelTab,
  resetRightPanelTabState,
  showSftpRightPanelTab
} from "./rightPanelTabState";

beforeEach(() => {
  resetRightPanelTabState();
});

describe("showSftpRightPanelTab", () => {
  it("shows SFTP for SSH while protocols are unknown, then follows the known list", () => {
    expect(showSftpRightPanelTab("ssh", undefined)).toBe(true);
    expect(showSftpRightPanelTab("ssh", [])).toBe(false);
    expect(showSftpRightPanelTab("ssh", [{ name: "sftp" }])).toBe(true);
    expect(showSftpRightPanelTab("rdp", undefined)).toBe(false);
  });
});

describe("nextRightPanelTab", () => {
  it("restores A's session while B stays on sftp", () => {
    expect(
      nextRightPanelTab({
        available: ["session", "sftp"],
        remembered: "session",
        active: "sftp",
        sftpResolved: true,
        paneChanged: true
      })
    ).toBe("session");
    expect(
      nextRightPanelTab({
        available: ["session", "sftp"],
        remembered: "sftp",
        active: "session",
        sftpResolved: true,
        paneChanged: true
      })
    ).toBe("sftp");
  });

  it("does not fall back to session while SFTP permission is still loading", () => {
    expect(
      nextRightPanelTab({
        available: ["session"],
        remembered: "sftp",
        active: "session",
        sftpResolved: false,
        paneChanged: true
      })
    ).toBe("sftp");
  });

  it("falls back once SFTP is known to be unavailable", () => {
    expect(
      nextRightPanelTab({
        available: ["session"],
        remembered: "sftp",
        active: "sftp",
        sftpResolved: true,
        paneChanged: true
      })
    ).toBe("session");
  });

  it("does not inherit the previous pane tab on first visit", () => {
    expect(
      nextRightPanelTab({
        available: ["session", "sftp"],
        active: "sftp",
        sftpResolved: true,
        paneChanged: true
      })
    ).toBe("session");
  });
});

describe("rememberRightPanelTab", () => {
  it("maps pane ids to the last selected tab", () => {
    rememberRightPanelTab("pane-a", "session");
    rememberRightPanelTab("pane-b", "sftp");
    expect(rememberedRightPanelTab("pane-a")).toBe("session");
    expect(rememberedRightPanelTab("pane-b")).toBe("sftp");
  });
});
