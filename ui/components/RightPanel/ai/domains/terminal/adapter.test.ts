import type { PlanItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { describe, expect, it } from "vitest";
import { terminalAiPanelDomain } from "./adapter";

describe("Terminal AI panel domain", () => {
  it("binds an approved execution override to the tool call", () => {
    const session = {
      kind: "terminal",
      decisions: new Set<string>(),
      executionOverrides: new Map([["approval-1", "pty"]]),
      errorCode: "",
      errorText: ""
    } as unknown as WorkspaceAiSession;

    terminalAiPanelDomain.handleTimelineAction?.(
      session,
      {
        domain: "terminal",
        type: "decide",
        data: { id: "approval-1", toolCallId: "tool-1" },
        approved: true
      },
      { paneId: "terminal-pane", surface: null, now: 0, t: (key) => key }
    );

    expect((session as { executionOverrides: Map<string, string> }).executionOverrides.get("tool-1")).toBe("pty");
  });

  it("does not treat a rejected operation as a failed AI run", () => {
    const plan: PlanItem = {
      domain: "terminal",
      kind: "plan",
      key: "run-1-plan",
      id: "run-1",
      summary: "Run command",
      steps: [
        {
          id: "tool-1",
          key: "run-1:tool-1",
          index: 1,
          title: "Run command",
          objective: "",
          status: "rejected",
          executions: []
        }
      ]
    };

    const summary = terminalAiPanelDomain.summarize(
      {} as WorkspaceAiSession,
      { paneId: "terminal-pane", surface: null, now: 0, t: (key) => key },
      [plan]
    );

    expect(summary).toMatchObject({ runProgress: "0/1", outcome: "ready" });
  });

  it("keeps a failed tool local to the operation instead of failing Terminal AI", () => {
    const plan: PlanItem = {
      domain: "terminal",
      kind: "plan",
      key: "run-1-plan",
      id: "run-1",
      summary: "Run command",
      steps: [
        {
          id: "tool-1",
          key: "run-1:tool-1",
          index: 1,
          title: "Run command",
          objective: "",
          status: "failed",
          executions: []
        }
      ]
    };

    const summary = terminalAiPanelDomain.summarize(
      {} as WorkspaceAiSession,
      { paneId: "terminal-pane", surface: null, now: 0, t: (key) => key },
      [plan]
    );

    expect(summary).toMatchObject({ runProgress: "0/1", outcome: "ready" });
  });
});
