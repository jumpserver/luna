import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { describe, expect, it } from "vitest";
import { sqlAiPanelDomain } from "./adapter";

describe("SQL AI panel domain", () => {
  it("shows an active analysis in the shared conversation activity item", () => {
    const session = {
      kind: "sql",
      enabled: true,
      chat: { status: { value: "streaming" } },
      requestStartedAt: 1_000,
      timing: { durationMs: 0, clientDurationMs: 0 },
      runtimeStatusCode: "analyzing",
      runtimeExecution: "",
      contextProvider: () => null,
      agent: { state: { toolNames: [] } },
      errorText: "",
      metadataApproval: null,
      pendingProposalCalls: new Map(),
      approvalThreshold: "auto",
      executionMode: "auto"
    } as unknown as WorkspaceAiSession;

    const presentation = sqlAiPanelDomain.describe(
      session,
      { paneId: "sql-pane", surface: null, now: 1_750, t: (key) => key },
      []
    );

    expect(presentation).toMatchObject({
      running: true,
      runtimeStatusLabel: "RightPanel.SQLAIStageAnalyzing",
      elapsedDurationMs: 750,
      showActivity: true,
      showRuntimeStatus: false
    });
  });

  it("keeps the run awaiting approval until a SQL proposal is applied", () => {
    const proposalDecisions = new Map<string, "applied" | "rejected" | "stale">();
    const session = {
      kind: "sql",
      pendingProposalCalls: new Map([["tool-sql", {}]]),
      proposalDecisions,
      applyProposal: () => ({ applied: true })
    } as unknown as WorkspaceAiSession;
    const item = {
      domain: "sql",
      kind: "sql-proposal",
      key: "proposal-card",
      toolCallId: "tool-sql",
      data: {
        sql: "SELECT 1",
        base: {
          paneId: "sql-pane",
          tabId: "",
          revision: 1,
          target: "new_query",
          selectionFrom: 0,
          selectionTo: 0,
          nodeKey: "database"
        }
      }
    } as const;

    sqlAiPanelDomain.handleTimelineAction(
      session,
      { domain: "sql", type: "apply-proposal", item },
      {
        paneId: "sql-pane",
        surface: null,
        now: 0,
        t: (key) => key
      }
    );

    expect(proposalDecisions.get("tool-sql")).toBe("applied");
  });
});
