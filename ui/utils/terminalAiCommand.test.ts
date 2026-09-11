import { describe, expect, it } from "vitest";
import {
  isTerminalAiCommandShortcut,
  isTerminalAiHistoryShortcut,
  shouldShowTerminalAiCaretHint,
  terminalAiCommandShortcutAction,
  terminalAiLiveTurn
} from "~/utils/terminalAiCommand";

const shortcutEvent = (overrides: Partial<Parameters<typeof isTerminalAiCommandShortcut>[0]> = {}) => ({
  code: "KeyK",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...overrides
});

describe("Terminal AI command shortcut", () => {
  it("uses Command on macOS and Control on other platforms", () => {
    expect(isTerminalAiCommandShortcut(shortcutEvent({ metaKey: true }), true)).toBe(true);
    expect(isTerminalAiCommandShortcut(shortcutEvent({ ctrlKey: true }), false)).toBe(true);
    expect(isTerminalAiCommandShortcut(shortcutEvent({ ctrlKey: true }), true)).toBe(false);
    expect(isTerminalAiCommandShortcut(shortcutEvent({ metaKey: true }), false)).toBe(false);
    expect(isTerminalAiCommandShortcut(shortcutEvent({ metaKey: true, shiftKey: true }), true)).toBe(false);
  });

  it("opens history with Shift plus the AI shortcut", () => {
    expect(isTerminalAiHistoryShortcut(shortcutEvent({ metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(isTerminalAiHistoryShortcut(shortcutEvent({ ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isTerminalAiHistoryShortcut(shortcutEvent({ metaKey: true }), true)).toBe(false);
    expect(isTerminalAiHistoryShortcut(shortcutEvent({ metaKey: true, shiftKey: true, altKey: true }), true)).toBe(
      false
    );
  });

  it("reopens the HUD for an active task and the composer otherwise", () => {
    expect(terminalAiCommandShortcutAction(true, false)).toBe("popover");
    expect(terminalAiCommandShortcutAction(true, true)).toBe("hud");
    expect(terminalAiCommandShortcutAction(false, false)).toBe("ignore");
  });
});

describe("terminalAiLiveTurn", () => {
  it("keeps the current user turn, pending approval, and failed task visible", () => {
    const turn = terminalAiLiveTurn(
      [
        {
          role: "user",
          parts: [{ type: "text", text: "restart nginx" }]
        },
        {
          role: "assistant",
          parts: [
            {
              type: "data-approval",
              data: { approvalId: "appr-1", toolName: "run_command", arguments: { command: "systemctl restart nginx" } }
            }
          ]
        }
      ],
      [{ active: true, status: "waiting_approval", prompt: "restart nginx" }]
    );
    expect(turn.lastUser).toBe("restart nginx");
    expect(turn.live).toBe(true);
    expect(turn.waitingApproval).toBe(true);
    expect(turn.pendingApprovals).toEqual([
      { id: "appr-1", toolName: "run_command", command: "systemctl restart nginx" }
    ]);
    expect(terminalAiLiveTurn([], [{ active: true, status: "failed", prompt: "bad" }]).failed).toBe(true);
    expect(terminalAiLiveTurn([], [{ active: true, status: "failed", prompt: "bad" }]).live).toBe(true);
  });

  it("drops settled workspace approvals and keeps later assistant text", () => {
    const turn = terminalAiLiveTurn([
      { role: "user", parts: [{ type: "text", text: "list files" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "data-approval",
            data: { approvalId: "appr-1", toolName: "start_terminal_task", resolved: false }
          },
          {
            type: "data-approval",
            data: { approvalId: "appr-1", toolName: "start_terminal_task", resolved: true, state: "approved" }
          },
          { type: "text", text: "I will run pwd && ls -la" }
        ]
      }
    ]);
    expect(turn.pendingApprovals).toEqual([]);
    expect(turn.lastAssistant).toBe("I will run pwd && ls -la");
    expect(turn.live).toBe(true);
  });

  it("keeps completed terminal-task assistant output in the live turn", () => {
    const turn = terminalAiLiveTurn(
      [
        { role: "user", parts: [{ type: "text", text: "list files" }] },
        {
          role: "assistant",
          parts: [
            { type: "text", text: "I'll check." },
            { type: "data-terminal-task", data: { taskId: "t1" } }
          ]
        }
      ],
      [
        {
          id: "t1",
          active: false,
          status: "completed",
          prompt: "list files",
          messages: [
            { role: "user", parts: [{ type: "text", text: "list files" }] },
            { role: "assistant", parts: [{ type: "text", text: "## 当前目录\n/root" }] }
          ]
        }
      ]
    );
    expect(turn.lastAssistant).toContain("I'll check.");
    expect(turn.lastAssistant).toContain("当前目录");
    expect(turn.live).toBe(true);
  });
});

describe("shouldShowTerminalAiCaretHint", () => {
  it("hides the hint until session info is ready, there is enough width, and input is idle", () => {
    expect(shouldShowTerminalAiCaretHint(false, 200)).toBe(false);
    expect(shouldShowTerminalAiCaretHint(true, 79)).toBe(false);
    expect(shouldShowTerminalAiCaretHint(true, 80, false)).toBe(false);
    expect(shouldShowTerminalAiCaretHint(true, 80)).toBe(true);
    expect(shouldShowTerminalAiCaretHint(true, 80, true)).toBe(true);
  });
});
