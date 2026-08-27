import type { TerminalCommandHistoryState } from "~/composables/useTerminalCommandHistory";
import { describe, expect, it } from "vitest";
import {
  getAuthenticatedTerminalCommandHistoryScope,
  getTerminalCommandHistoryScope,
  recordTerminalCommandInState
} from "~/composables/useTerminalCommandHistory";

describe("terminal command history storage", () => {
  it("isolates history by site, JumpServer user id and terminal profile", () => {
    const state: TerminalCommandHistoryState = {};
    const alice = getTerminalCommandHistoryScope("https://one.example/", "user-alice");
    const bob = getTerminalCommandHistoryScope("https://one.example", "user-bob");
    const aliceRelogin = getTerminalCommandHistoryScope("https://one.example/", "user-alice");

    recordTerminalCommandInState(state, alice, "linux", "ls -la");
    recordTerminalCommandInState(state, alice, "windows", "Get-ChildItem");
    recordTerminalCommandInState(state, bob, "linux", "whoami");

    expect(aliceRelogin).toBe(alice);
    expect(state[alice]?.linux).toEqual(["ls -la"]);
    expect(state[alice]?.windows).toEqual(["Get-ChildItem"]);
    expect(state[bob]?.linux).toEqual(["whoami"]);
  });

  it("does not build a history scope without a JumpServer user id", () => {
    expect(getTerminalCommandHistoryScope("https://one.example", "")).toBe("");
    expect(getTerminalCommandHistoryScope("https://one.example", "https://one.example")).toBe("");
    expect(getTerminalCommandHistoryScope("https://one.example", "https://one.example/")).toBe("");
    expect(getTerminalCommandHistoryScope("", "user-alice")).toBe("");
  });

  it("ignores persisted user ids until the session is authenticated", () => {
    expect(
      getAuthenticatedTerminalCommandHistoryScope({
        authenticated: false,
        site: "https://one.example",
        userId: "user-alice"
      })
    ).toBe("");
    expect(
      getAuthenticatedTerminalCommandHistoryScope({
        authenticated: true,
        site: "https://one.example/",
        userId: "user-bob"
      })
    ).toBe("https://one.example::user-bob");
  });

  it("persists safe commands whose short options are not credentials", () => {
    const state: TerminalCommandHistoryState = {};

    recordTerminalCommandInState(state, "scope", "linux", "mkdir -p /tmp/demo");
    recordTerminalCommandInState(state, "scope", "linux", "ssh -p 2222 host");
    recordTerminalCommandInState(state, "scope", "linux", "cp -a src dst");
    recordTerminalCommandInState(state, "scope", "linux", "psql -p 5432 app");

    expect(state.scope?.linux).toEqual(["psql -p 5432 app", "cp -a src dst", "ssh -p 2222 host", "mkdir -p /tmp/demo"]);
  });

  it("rejects sensitive and control-bearing commands at the persistence boundary", () => {
    const state: TerminalCommandHistoryState = {
      scope: { linux: ["echo safe\necho injected"] }
    };

    recordTerminalCommandInState(state, "scope", "redis", "AUTH hunter2");
    recordTerminalCommandInState(state, "scope", "linux", "sshpass -p hunter2 ssh host");
    recordTerminalCommandInState(state, "scope", "redis", "redis-cli ping && redis-cli -a hunter2 ping");
    recordTerminalCommandInState(state, "scope", "sqlserver", "sqlcmd -? | sqlcmd -S db -U sa -P hunter2");
    recordTerminalCommandInState(state, "scope", "mysql", "mysql --version; mysql -phunter2");
    recordTerminalCommandInState(state, "scope", "postgresql", "postgresql://alice:hunter2@db/app");
    recordTerminalCommandInState(state, "scope", "linux", "echo safe\necho injected");
    recordTerminalCommandInState(state, "scope", "linux", "ls -la");

    expect(state).toEqual({ scope: { linux: ["ls -la"] } });
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
