import { describe, expect, it, vi } from "vitest";
import {
  getTerminalCommandLineBeforeCursor,
  getTerminalCommandSuggestions,
  isSafeTerminalCommandHistory,
  resolveTerminalCommandProfile,
  terminalCommandEchoContainsPrefix,
  TerminalCommandInputTracker,
  terminalCommandSuggestionKeyAction
} from "#koko/composables/terminal/terminalCommandSuggestions";

describe("terminal command suggestions", () => {
  it("resolves SSH platforms and database protocols", () => {
    expect(resolveTerminalCommandProfile({ protocol: "ssh", assetPlatform: "Linux" })).toBe("linux");
    expect(resolveTerminalCommandProfile({ protocol: "ssh", assetPlatform: "Windows Server" })).toBe("windows");
    expect(resolveTerminalCommandProfile({ protocol: "mariadb" })).toBe("mysql");
    expect(resolveTerminalCommandProfile({ protocol: "pg" })).toBe("postgresql");
    expect(resolveTerminalCommandProfile({ protocol: "redis" })).toBe("redis");
    expect(resolveTerminalCommandProfile({})).toBe("linux");
  });

  it("ranks profile history before catalog entries and removes exact matches", () => {
    const suggestions = getTerminalCommandSuggestions("linux", "l", ["ls -la", "lsof"]);
    expect(suggestions.slice(0, 2)).toEqual([
      { command: "ls -la", source: "history" },
      { command: "lsof", source: "history" }
    ]);
    expect(suggestions).toContainEqual({ command: "ls", source: "catalog" });
    expect(getTerminalCommandSuggestions("linux", "ls", [])).not.toContainEqual({ command: "ls", source: "catalog" });
  });

  it("matches Windows and database commands without case sensitivity", () => {
    expect(getTerminalCommandSuggestions("windows", "g", [])[0]?.command).toBe("get-childitem");
    expect(getTerminalCommandSuggestions("mysql", "s", []).map((item) => item.command)).toContain("select");
    expect(getTerminalCommandSuggestions("mysql", "S", []).map((item) => item.command)).toContain("SELECT");
    expect(getTerminalCommandSuggestions("mongodb", "db.g", [])[0]?.command).toBe("db.getCollectionNames");
  });

  it("drops unsafe loaded history before building candidates", () => {
    expect(getTerminalCommandSuggestions("linux", "e", ["echo safe", "echo bad\necho injected"])).toEqual(
      expect.not.arrayContaining([{ command: "echo bad\necho injected", source: "history" }])
    );
  });

  it("intercepts navigation, completion and dismissal only while open", () => {
    expect(terminalCommandSuggestionKeyAction("ArrowDown", true)).toBe("next");
    expect(terminalCommandSuggestionKeyAction("ArrowUp", true)).toBe("previous");
    expect(terminalCommandSuggestionKeyAction("Tab", true)).toBe("accept");
    expect(terminalCommandSuggestionKeyAction("Escape", true)).toBe("close");
    expect(terminalCommandSuggestionKeyAction("Enter", true)).toBeNull();
    expect(terminalCommandSuggestionKeyAction("Tab", false)).toBeNull();
    expect(terminalCommandSuggestionKeyAction("Tab", true, "keyup")).toBeNull();
  });

  it("reads the active Xterm line using the viewport base offset", () => {
    const getLine = vi.fn(() => ({ translateToString: () => "prompt> ls" }));

    expect(getTerminalCommandLineBeforeCursor({ baseY: 40, cursorY: 2, cursorX: 10, getLine })).toBe("prompt> ls");
    expect(getLine).toHaveBeenCalledWith(42);
  });

  it("matches a typed prefix even when the block cursor still sits on that cell", () => {
    const cells = "root@y4:~# l";
    const cursorOnTypedChar = cells.length - 1;
    const getLine = vi.fn(() => ({
      translateToString: (_trim: boolean, start: number, end: number) => cells.slice(start, end)
    }));
    const buffer = { baseY: 0, cursorY: 0, cursorX: cursorOnTypedChar, cols: 80, getLine };

    expect(getTerminalCommandLineBeforeCursor(buffer)).toBe("root@y4:~# ");
    expect(terminalCommandEchoContainsPrefix(buffer, "l")).toBe(true);
  });

  it("tracks only a simple visible command line", () => {
    const tracker = new TerminalCommandInputTracker();
    tracker.handleData(" ");
    tracker.handleData("l");
    expect(tracker.prefix).toBe("l");
    expect(tracker.accept("ls")).toBe("s");
    tracker.handleData(" ");
    tracker.handleData("-");
    tracker.handleData("l");
    expect(tracker.prefix).toBe("");
    expect(tracker.handleData("\r").submitted).toBe("ls -l");
    expect(tracker.line).toBe("");

    tracker.handleData("paste");
    expect(tracker.valid).toBe(false);
    expect(tracker.handleData("\r").submitted).toBe("");

    tracker.handleData("partial");
    tracker.handleData("\x03");
    expect(tracker.valid).toBe(true);
    expect(tracker.line).toBe("");
  });

  it("rejects sensitive or unsafe persisted history", () => {
    const examplePassword = ["hunter", "2"].join("");
    expect(isSafeTerminalCommandHistory("ls -la")).toBe(true);
    expect(isSafeTerminalCommandHistory(`curl -u admin:${examplePassword} https://example.test`)).toBe(false);
    expect(isSafeTerminalCommandHistory("export API_TOKEN=abc")).toBe(false);
    expect(isSafeTerminalCommandHistory("mysql -psecret")).toBe(false);
    expect(isSafeTerminalCommandHistory("redis-cli -a hunter2")).toBe(false);
    expect(isSafeTerminalCommandHistory("AUTH hunter2")).toBe(false);
    expect(isSafeTerminalCommandHistory("postgresql://alice:hunter2@db.example/app")).toBe(false);
    expect(isSafeTerminalCommandHistory("mongodb+srv://alice:hunter2@db.example/app")).toBe(false);
    expect(isSafeTerminalCommandHistory("CONNECT scott/tiger@orcl")).toBe(false);
    expect(isSafeTerminalCommandHistory("sqlcmd -S db.example -U sa -P hunter2")).toBe(false);
    expect(isSafeTerminalCommandHistory("echo a\necho b")).toBe(false);
    expect(isSafeTerminalCommandHistory("x".repeat(513))).toBe(false);
  });
});
