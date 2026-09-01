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
});
