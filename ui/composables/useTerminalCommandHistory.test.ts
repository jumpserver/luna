import type { TerminalCommandHistoryState } from "~/composables/useTerminalCommandHistory";
import { describe, expect, it } from "vitest";
import { getTerminalCommandHistoryScope, recordTerminalCommandInState } from "~/composables/useTerminalCommandHistory";

describe("terminal command history storage", () => {
  it("isolates history by site, account and terminal profile", () => {
    const state: TerminalCommandHistoryState = {};
    const alice = getTerminalCommandHistoryScope("https://one.example/", "alice");
    const bob = getTerminalCommandHistoryScope("https://one.example", "bob");

    recordTerminalCommandInState(state, alice, "linux", "ls -la");
    recordTerminalCommandInState(state, alice, "windows", "Get-ChildItem");
    recordTerminalCommandInState(state, bob, "linux", "whoami");

    expect(state[alice]?.linux).toEqual(["ls -la"]);
    expect(state[alice]?.windows).toEqual(["Get-ChildItem"]);
    expect(state[bob]?.linux).toEqual(["whoami"]);
  });

  it("deduplicates MRU history and keeps 200 entries", () => {
    const state: TerminalCommandHistoryState = {};
    for (let index = 0; index < 205; index += 1) {
      recordTerminalCommandInState(state, "scope", "linux", `command-${index}`);
    }
    recordTerminalCommandInState(state, "scope", "linux", "command-200");

    expect(state.scope?.linux).toHaveLength(200);
    expect(state.scope?.linux?.[0]).toBe("command-200");
    expect(state.scope?.linux?.filter((item) => item === "command-200")).toHaveLength(1);
  });
});
