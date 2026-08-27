import type { TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import { describe, expect, it } from "vitest";
import { buildAiPanelViewItems } from "./buildViewItems";

describe("buildAiPanelViewItems", () => {
  it("links streamed commands and results to their plan step", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "data-plan",
            data: {
              id: "plan-1",
              summary: "Inspect the service",
              steps: [{ id: "step-1", title: "Check status", status: "running" }]
            }
          },
          {
            type: "data-command",
            data: {
              planId: "plan-1",
              stepId: "step-1",
              executionId: "execution-1",
              command: "systemctl status nginx"
            }
          },
          {
            type: "data-execution",
            data: {
              planId: "plan-1",
              stepId: "step-1",
              executionId: "execution-1",
              exitCode: 0,
              summary: "Service is active"
            }
          }
        ]
      }
    ] as unknown as TerminalAiChatMessage[];

    const items = buildAiPanelViewItems({
      messages,
      metadataApproval: null,
      terminalMetadataApproval: true,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    const plan = items.find((item) => item.kind === "plan");
    expect(plan?.summary).toBe("Inspect the service");
    expect(plan?.steps[0]?.executions).toHaveLength(1);
    expect(plan?.steps[0]?.executions[0]?.command?.command).toBe("systemctl status nginx");
    expect(plan?.steps[0]?.executions[0]?.result?.exitCode).toBe(0);
  });
});
