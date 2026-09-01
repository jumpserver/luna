import type { TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import { describe, expect, it } from "vitest";
import { buildAiPanelViewItems } from "./buildViewItems";

describe("buildAiPanelViewItems", () => {
  it("places a pending approval at the latest conversation position", () => {
    const messages = [
      { id: "user-approval", role: "user", parts: [{ type: "text", text: "Inspect the schema" }] },
      { id: "assistant-approval", role: "assistant", parts: [{ type: "text", text: "I need your approval" }] }
    ] as unknown as TerminalAiChatMessage[];

    const items = buildAiPanelViewItems({
      messages,
      metadataApproval: {
        approvalId: "approval-1",
        requestId: "request-1",
        toolCallId: "tool-1",
        provider: "",
        model: "",
        database: "database-1",
        schema: "public",
        tables: ["users"],
        query: "users",
        discovery: false,
        maxMatches: 20,
        followUpTableLimit: 5,
        dataCategories: ["tables"],
        expandedScope: false,
        expiresInSeconds: 300,
        resolving: false
      },
      terminalMetadataApproval: false,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    expect(items.map(({ kind }) => kind)).toEqual(["text", "text", "metadata-approval"]);
  });

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
              outcome: "success",
              execution: "background",
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
    const timelineStep = items.find((item) => item.kind === "terminal-step");
    expect(items.map(({ kind }) => kind)).toEqual(["plan", "terminal-step"]);
    expect(plan?.domain).toBe("terminal");
    expect(plan?.summary).toBe("Inspect the service");
    expect(plan?.steps[0]?.executions).toHaveLength(1);
    expect(plan?.steps[0]?.executions[0]?.command?.command).toBe("systemctl status nginx");
    expect(plan?.steps[0]?.executions[0]?.result?.exitCode).toBe(0);
    expect(plan?.steps[0]?.status).toBe("success");
    expect(timelineStep?.step).toBe(plan?.steps[0]);
    expect(timelineStep?.step.executions[0]?.result?.execution).toBe("background");
    expect(timelineStep?.step.executions[0]?.result?.exitCode).toBe(0);
  });

  it("merges a restored approval resolution without losing its command", () => {
    const identity = {
      id: "approval-1",
      planId: "run-1",
      stepId: "tool-call-1",
      executionId: "tool-call-1"
    };
    const messages = [
      {
        id: "approval-requested",
        role: "assistant",
        parts: [
          {
            type: "data-approval",
            data: { ...identity, command: "rm trusted", state: "awaiting_approval" }
          }
        ]
      },
      {
        id: "approval-resolved",
        role: "assistant",
        parts: [
          {
            type: "data-approval",
            data: { ...identity, command: "rm trusted", state: "approved", resolved: true }
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
    const timelineStep = items.find((item) => item.kind === "terminal-step");
    expect(plan?.steps).toHaveLength(1);
    expect(items.filter((item) => item.kind === "terminal-step")).toHaveLength(1);
    expect(plan?.steps[0]?.executions).toHaveLength(1);
    expect(plan?.steps[0]?.executions[0]?.command).toMatchObject({
      command: "rm trusted",
      state: "approved",
      resolved: true
    });
    expect(timelineStep?.step.executions[0]?.command).toMatchObject({
      command: "rm trusted",
      state: "approved",
      resolved: true
    });
  });

  it("moves an active terminal step to the latest conversation position", () => {
    const messages = [
      {
        id: "plan",
        role: "assistant",
        parts: [
          {
            type: "data-plan",
            data: {
              id: "plan-1",
              summary: "Inspect and repair",
              steps: [
                { id: "step-1", title: "Inspect", status: "pending" },
                { id: "step-2", title: "Repair", status: "pending" }
              ]
            }
          }
        ]
      },
      { id: "assistant-note", role: "assistant", parts: [{ type: "text", text: "Starting inspection" }] },
      {
        id: "approval",
        role: "assistant",
        parts: [
          {
            type: "data-approval",
            data: {
              id: "approval-1",
              planId: "plan-1",
              stepId: "step-1",
              executionId: "execution-1",
              command: "systemctl status nginx",
              state: "awaiting_approval"
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

    expect(items.map(({ kind, key }) => `${kind}:${key}`)).toEqual([
      "plan:plan-plan-0",
      "terminal-step:plan-1:step-2-timeline",
      "text:assistant-note-text-0",
      "terminal-step:plan-1:step-1-timeline"
    ]);
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
          {
            type: "data-agent-tool",
            data: {
              id: "tool-1",
              toolCallId: "tool-1",
              domain: "sql",
              toolName: "inspect_schema",
              status: "running"
            }
          },
          {
            type: "data-agent-tool",
            data: { id: "tool-1", toolCallId: "tool-1", domain: "sql", status: "success", durationMs: 123 }
          },
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
      "shared:agent-tool",
      "file:file-action",
      "terminal:alert"
    ]);
    expect(items.find((item) => item.kind === "agent-tool")?.data).toMatchObject({
      sourceDomain: "sql",
      toolName: "inspect_schema",
      status: "success",
      durationMs: 123
    });
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

  it("renders Script AI messages with the shared conversation and script proposal card", () => {
    const messages = [
      {
        id: "script-user",
        role: "user",
        metadata: { domain: "script" },
        parts: [{ type: "text", text: "Create an admin user" }]
      },
      {
        id: "script-proposal",
        role: "assistant",
        metadata: { domain: "script" },
        parts: [
          {
            type: "data-progress",
            data: { tool_name: "propose_script", toolCallId: "proposal-1", state: "tool_running" }
          },
          { type: "text", text: "Review this proposal before applying it." }
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
      "shared:text",
      "script:script-proposal",
      "shared:text"
    ]);
  });
});
