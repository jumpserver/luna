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
    expect(plan?.domain).toBe("terminal");
    expect(plan?.summary).toBe("Inspect the service");
    expect(plan?.steps[0]?.executions).toHaveLength(1);
    expect(plan?.steps[0]?.executions[0]?.command?.command).toBe("systemctl status nginx");
    expect(plan?.steps[0]?.executions[0]?.result?.exitCode).toBe(0);
  });

  it("routes mixed protocol parts to their registered domains", () => {
    const messages = [
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          { type: "text", text: "Checking the query" },
          { type: "data-thought-summary", data: { text: "Inspect schema first" } },
          { type: "data-sql-analysis", data: { valid: true, riskLevel: 1 } },
          { type: "data-file-action", data: { id: "action-1", tool: "stat", path: "/srv/app" } },
          { type: "data-command-acl", data: { state: "rejected" } }
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

    expect(items.map(({ domain, kind }) => `${domain}:${kind}`)).toEqual([
      "shared:text",
      "sql:sql-thought",
      "sql:sql-analysis",
      "file:file-action",
      "terminal:alert"
    ]);
  });

  it("builds structured file analysis, diff, approval, and result items", () => {
    const messages = [
      {
        id: "assistant-file",
        role: "assistant",
        metadata: { domain: "file", targetId: "file-pane-1" },
        parts: [
          { type: "data-capability", data: { tools: ["list", "read_text"], maxTextBytes: 65536 } },
          {
            type: "data-plan",
            data: {
              id: "file-plan-1",
              summary: "Review and update config",
              steps: [{ id: "step-1", title: "Inspect config", status: "completed" }]
            }
          },
          {
            type: "data-file-action",
            data: { id: "action-1", tool: "save_text", path: "/etc/app.conf", riskLevel: 3, state: "proposed" }
          },
          {
            type: "data-file-diff",
            data: { id: "action-1", path: "/etc/app.conf", before: "port=80", after: "port=8080" }
          },
          {
            type: "data-file-approval",
            data: { id: "approval-1", digest: "digest-1", tool: "save_text", path: "/etc/app.conf" }
          },
          {
            type: "data-file-result",
            data: { id: "action-1", tool: "save_text", path: "/etc/app.conf", outcome: "success" }
          }
        ]
      }
    ] as unknown as TerminalAiChatMessage[];

    const items = buildAiPanelViewItems({
      messages,
      metadataApproval: null,
      terminalMetadataApproval: false,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    expect(items.map(({ domain, kind }) => `${domain}:${kind}`)).toEqual([
      "file:file-analysis",
      "file:file-plan",
      "file:file-diff",
      "file:file-approval",
      "file:file-result"
    ]);
    expect(items.find((item) => item.kind === "file-diff")?.data.after).toBe("port=8080");
    const result = items.find((item) => item.kind === "file-result");
    expect(result?.data.riskLevel).toBe(3);
    expect(result?.data.state).toBe("proposed");
  });

  it("merges a replayed File AI action into its existing result", () => {
    const messages = [
      {
        id: "assistant-file-result-first",
        role: "assistant",
        metadata: { domain: "file", targetId: "file-pane-1" },
        parts: [
          {
            type: "data-file-result",
            data: { id: "action-1", tool: "read_text", path: "/root/a.txt", outcome: "error", error: "failed" }
          },
          {
            type: "data-file-action",
            data: { id: "action-1", tool: "read_text", path: "/root/a.txt", riskLevel: 2, rationale: "inspect" }
          },
          {
            type: "data-error",
            data: { message: "File AI run failed" }
          }
        ]
      }
    ] as unknown as TerminalAiChatMessage[];

    const items = buildAiPanelViewItems({
      messages,
      metadataApproval: null,
      terminalMetadataApproval: false,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    expect(items.filter((item) => item.domain === "file")).toHaveLength(1);
    const result = items.find((item) => item.kind === "file-result");
    expect(result?.data).toMatchObject({ outcome: "error", error: "failed", riskLevel: 2, rationale: "inspect" });
  });
});
