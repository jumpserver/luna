import type { AgentEvent } from "#koko/composables/agent/types";
import type { TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import { describe, expect, it } from "vitest";
import { agentEventToUiMessage } from "#koko/composables/agent/useAgentSession";
import { buildAiPanelViewItems } from "./buildViewItems";
import { aiTimelineHasPendingOperation, terminalStepRunning } from "./presentation";

describe("terminal command progress presentation", () => {
  function build(events: Array<Pick<AgentEvent, "type" | "tool_call_id" | "payload">>) {
    return buildAiPanelViewItems({
      messages: events.map((event, index) =>
        agentEventToUiMessage({ ...event, seq: index + 1, run_id: "run" }, "terminal", {})
      ) as TerminalAiChatMessage[],
      metadataApproval: null,
      terminalMetadataApproval: true,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });
  }

  function command(id: string): Array<Pick<AgentEvent, "type" | "tool_call_id" | "payload">> {
    return [
      {
        type: "tool.call",
        tool_call_id: id,
        payload: { tool_name: "execute_shell", arguments: { command: "du -h /" } }
      },
      {
        type: "tool.result",
        tool_call_id: id,
        payload: {
          tool_name: "execute_shell",
          status: "success",
          done: true,
          result: {
            structuredContent: {
              execution_id: `job-${id}`,
              tool_call_id: id,
              status: "running",
              process_finished: false
            }
          }
        }
      }
    ];
  }

  const wait: Pick<AgentEvent, "type" | "tool_call_id" | "payload"> = {
    type: "tool.call",
    tool_call_id: "wait",
    payload: { tool_name: "wait_command_execution", arguments: { execution_id: "job-command", timeout_ms: 30000 } }
  };

  it("shows one command in progress while keeping RPC receipts and polls in its details", () => {
    const items = build([...command("command"), wait]);
    expect(items.filter((item) => item.kind === "agent-tool")).toEqual([]);
    const steps = items.filter((item) => item.kind === "terminal-step");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.step.executions[0]?.operations?.map((item) => [item.data.toolName, item.data.status])).toEqual([
      ["execute_shell", "success"],
      ["wait_command_execution", "running"]
    ]);
    expect(terminalStepRunning(steps[0]!.step)).toBe(true);
    expect(aiTimelineHasPendingOperation(items)).toBe(true);
  });

  it("releases the activity indicator after the actual command completes", () => {
    const items = build([
      ...command("command"),
      wait,
      {
        type: "tool.result",
        tool_call_id: "wait",
        payload: {
          tool_name: "wait_command_execution",
          status: "success",
          done: true,
          result: {
            execution_id: "job-command",
            tool_call_id: "command",
            status: "success",
            process_finished: true,
            output: "8G /"
          }
        }
      }
    ]);
    const step = items.find((item) => item.kind === "terminal-step")!.step;
    expect(terminalStepRunning(step)).toBe(false);
    expect(step.executions[0]?.result?.output).toBe("8G /");
    expect(step.executions[0]?.operations?.at(-1)?.data.status).toBe("success");
    expect(aiTimelineHasPendingOperation(items)).toBe(false);
  });

  it.each(["error", "timeout", "unknown", "cancelled"])("keeps a %s polling receipt visible", (status) => {
    const items = build([
      ...command("command"),
      wait,
      {
        type: "tool.result",
        tool_call_id: "wait",
        payload: {
          tool_name: "wait_command_execution",
          status,
          done: true,
          error: { message: "Observation failed" }
        }
      }
    ]);
    expect(items).toContainEqual(
      expect.objectContaining({ kind: "agent-tool", data: expect.objectContaining({ toolCallId: "wait", status }) })
    );
  });

  it("matches concurrent identical commands by execution ID and keeps unmatched polls visible", () => {
    const items = build([
      ...command("command"),
      ...command("other"),
      wait,
      { ...wait, tool_call_id: "unknown-wait", payload: { ...wait.payload, arguments: { execution_id: "missing" } } }
    ]);
    const steps = items.filter((item) => item.kind === "terminal-step");
    expect(steps.map((item) => item.step.executions[0]?.operations?.map((tool) => tool.data.toolCallId))).toEqual([
      ["command", "wait"],
      ["other"]
    ]);
    expect(items.filter((item) => item.kind === "agent-tool").map((item) => item.data.toolCallId)).toEqual([
      "unknown-wait"
    ]);
  });

  it("uses the tool row during startup and treats approvals as waiting rather than background activity", () => {
    expect(aiTimelineHasPendingOperation([])).toBe(false);
    expect(aiTimelineHasPendingOperation(build(command("command").slice(0, 1)))).toBe(true);
    const items = build([
      command("command")[0]!,
      {
        type: "approval.requested",
        tool_call_id: "command",
        payload: {
          approval_id: "approval",
          tool_name: "execute_shell",
          arguments: { command: "du -h /" }
        }
      }
    ]);
    expect(items.some((item) => item.kind === "agent-tool")).toBe(false);
    expect(terminalStepRunning(items.find((item) => item.kind === "terminal-step")!.step)).toBe(false);
    expect(aiTimelineHasPendingOperation(items)).toBe(true);
  });

  it("preserves unrelated terminal tools instead of folding every tool into command details", () => {
    const items = build([
      { type: "tool.call", tool_call_id: "snapshot", payload: { tool_name: "terminal_snapshot", arguments: {} } },
      {
        type: "tool.result",
        tool_call_id: "snapshot",
        payload: { tool_name: "terminal_snapshot", status: "success", result: { output: "ready" } }
      },
      ...command("command"),
      wait
    ]);
    expect(items.filter((item) => item.kind === "agent-tool").map((item) => item.data.toolName)).toEqual([
      "terminal_snapshot"
    ]);
  });
});

describe("buildAiPanelViewItems", () => {
  it("omits empty stream placeholders while preserving substantive text", () => {
    const items = buildAiPanelViewItems({
      messages: [
        {
          id: "assistant-empty",
          role: "assistant",
          parts: [
            { type: "text", text: "" },
            { type: "text", text: "  \n" },
            { type: "text", text: "Disk usage is normal." }
          ]
        }
      ] as TerminalAiChatMessage[],
      metadataApproval: null,
      terminalMetadataApproval: true,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });
    expect(items).toMatchObject([{ kind: "text", text: "Disk usage is normal." }]);
  });

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

  it.each(["approved", "expired", "cancelled"])("merges a restored %s approval without losing its command", (state) => {
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
            data: { ...identity, command: "rm trusted", state, resolved: true }
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
      state,
      resolved: true
    });
    expect(timelineStep?.step.executions[0]?.command).toMatchObject({
      command: "rm trusted",
      state,
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
              status: "running",
              arguments: { query: "users" }
            }
          },
          {
            type: "data-agent-tool",
            data: {
              id: "tool-1",
              toolCallId: "tool-1",
              domain: "sql",
              status: "success",
              durationMs: 123,
              result: { structuredContent: { tables: ["users"] } }
            }
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
      durationMs: 123,
      arguments: { query: "users" },
      result: { structuredContent: { tables: ["users"] } }
    });
  });

  it("keeps assistant text before and after an agent tool round", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "I will inspect the schema." },
          {
            type: "data-agent-tool",
            data: {
              id: "tool-1",
              toolCallId: "tool-1",
              domain: "sql",
              toolName: "inspect_schema",
              status: "success"
            }
          },
          { type: "text", text: "The schema contains the users table." }
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

    expect(items.map(({ kind }) => kind)).toEqual(["text", "agent-tool", "text"]);
    expect(items.filter((item) => item.kind === "text").map((item) => item.text)).toEqual([
      "I will inspect the schema.",
      "The schema contains the users table."
    ]);
  });

  it("keeps the SQL proposal bound to its pending tool call", () => {
    const items = buildAiPanelViewItems({
      messages: [
        {
          id: "sql-proposal",
          role: "assistant",
          parts: [
            {
              type: "data-sql-proposal",
              data: {
                toolCallId: "tool-sql",
                sql: "SELECT 1",
                base: { paneId: "pane-1", tabId: "", revision: 1, target: "new_query" }
              }
            }
          ]
        }
      ] as unknown as TerminalAiChatMessage[],
      metadataApproval: null,
      terminalMetadataApproval: false,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    expect(items.find((item) => item.kind === "sql-proposal")).toMatchObject({
      toolCallId: "tool-sql",
      data: { sql: "SELECT 1" }
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

  it.each(["sql", "script"])("does not render terminal execution plans for %s messages", (domain) => {
    const items = buildAiPanelViewItems({
      messages: [
        {
          id: `${domain}-plan`,
          role: "assistant",
          metadata: { domain },
          parts: [
            {
              type: "data-plan",
              data: {
                id: `${domain}-plan-1`,
                summary: "Internal execution plan",
                steps: [{ id: "step-1", title: "Inspect", status: "completed" }]
              }
            }
          ]
        }
      ] as unknown as TerminalAiChatMessage[],
      metadataApproval: null,
      terminalMetadataApproval: false,
      executionPlanLabel: "Execution plan",
      stepLabel: (count) => `Step ${count}`
    });

    expect(items).toEqual([]);
  });
});

it("retains a timeout notice in the conversation timeline", () => {
  const items = buildAiPanelViewItems({
    messages: [
      { id: "timeout", role: "assistant", parts: [{ type: "data-agent-notice", data: { code: "run_timeout" } }] }
    ] as unknown as TerminalAiChatMessage[],
    metadataApproval: null,
    terminalMetadataApproval: true,
    executionPlanLabel: "Plan",
    stepLabel: String
  });
  expect(items).toEqual([{ domain: "shared", kind: "agent-notice", key: "timeout-notice-0", code: "run_timeout" }]);
});

it.each([
  ["unknown", "cancelled", "unknown"],
  ["success", "unknown", "success"],
  ["timeout", "unknown", "timeout"]
])("preserves %s when a %s delivery races with it", (initial, incoming, expected) => {
  const messages = [initial, incoming].map((status, index) => ({
    id: String(index),
    role: "assistant",
    metadata: { domain: "terminal" },
    parts: [{ type: "data-agent-tool", data: { id: "call", domain: "terminal", status } }]
  })) as unknown as TerminalAiChatMessage[];
  const items = buildAiPanelViewItems({
    messages,
    metadataApproval: null,
    terminalMetadataApproval: true,
    executionPlanLabel: "Plan",
    stepLabel: String
  });
  expect(items).toMatchObject([{ kind: "agent-tool", data: { status: expected } }]);
});
