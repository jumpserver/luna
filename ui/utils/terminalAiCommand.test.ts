import { describe, expect, it } from "vitest";
import {
  isTerminalAiCommandShortcut,
  shouldShowTerminalAiCaretHint,
  terminalAiCommandShortcutAction
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

  it("opens the existing panel for an active task and the popover otherwise", () => {
    expect(terminalAiCommandShortcutAction(true, false)).toBe("popover");
    expect(terminalAiCommandShortcutAction(true, true)).toBe("panel");
    expect(terminalAiCommandShortcutAction(false, false)).toBe("ignore");
  });
});

describe("shouldShowTerminalAiCaretHint", () => {
  it("hides the hint until session info is ready and there is enough width", () => {
    expect(shouldShowTerminalAiCaretHint(false, 200)).toBe(false);
    expect(shouldShowTerminalAiCaretHint(true, 79)).toBe(false);
    expect(shouldShowTerminalAiCaretHint(true, 80)).toBe(true);
  });
});
