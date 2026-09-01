import { describe, expect, it } from "vitest";
import type { ScriptAiSnapshot } from "./useScriptAiSessions";
import { normalizeScriptAiProposal, scriptAiReadOnlyApprovalId, scriptAiTimelineMessage } from "./useScriptAiSessions";

const snapshot: ScriptAiSnapshot = {
  paneId: "script-pane",
  scriptId: "script-id",
  name: "Check service",
  content: "systemctl status nginx",
  module: "shell",
  comment: "",
  scope: "private",
  variables: [],
  revision: 3
};

describe("Script AI proposals", () => {
  it("binds an accepted proposal to the current editor revision", () => {
    expect(
      normalizeScriptAiProposal(
        {
          expected_revision: 3,
          name: "Check service safely",
          content: "systemctl is-active nginx",
          module: "shell",
          comment: "Checks nginx state",
          summary: "Use a stable status command",
          risk_level: 1,
          risks: [],
          variables: [
            {
              name: "Service",
              var_name: "service",
              type: "text",
              required: true,
              tips: "Systemd service name",
              options: []
            }
          ]
        },
        snapshot
      )
    ).toMatchObject({
      name: "Check service safely",
      base: { paneId: "script-pane", revision: 3 },
      variables: [{ name: "Service", varName: "service", defaultValue: "" }]
    });
  });

  it("rejects a proposal based on an outdated editor revision", () => {
    expect(
      normalizeScriptAiProposal(
        {
          expected_revision: 2,
          name: "Outdated",
          content: "echo outdated",
          module: "shell"
        },
        snapshot
      )
    ).toEqual({ error: "The script changed after it was read; read_script must be called again" });
  });
});

describe("Script AI approvals", () => {
  it("auto-approves only unresolved read-only script tools", () => {
    expect(scriptAiReadOnlyApprovalId({ approvalId: "approval-1", tool: "read_script" })).toBe("approval-1");
    expect(scriptAiReadOnlyApprovalId({ id: "approval-2", tool: "propose_script" })).toBe("approval-2");
    expect(scriptAiReadOnlyApprovalId({ approvalId: "approval-3", tool: "execute_command" })).toBe("");
    expect(scriptAiReadOnlyApprovalId({ approvalId: "approval-4", tool: "propose_script", resolved: true })).toBe("");
  });
});

describe("Script AI timeline", () => {
  it("keeps visible conversation content and proposal cards only", () => {
    const message = {
      id: "script-events",
      role: "assistant",
      metadata: { domain: "script" },
      parts: [
        { type: "data-capability", data: { enabled: true } },
        { type: "data-progress", data: { code: "tool_running", tool_name: "read_script" } },
        {
          type: "data-progress",
          data: { code: "tool_running", tool_name: "propose_script", toolCallId: "proposal-1" }
        },
        {
          type: "data-agent-tool",
          data: {
            id: "tool-1",
            toolCallId: "tool-1",
            domain: "script",
            toolName: "read_script",
            status: "running"
          }
        },
        { type: "text", text: "Proposal ready" }
      ]
    } as Parameters<typeof scriptAiTimelineMessage>[0];

    expect(scriptAiTimelineMessage(message)?.parts).toEqual([
      {
        type: "data-progress",
        data: { code: "tool_running", tool_name: "propose_script", toolCallId: "proposal-1" }
      },
      {
        type: "data-agent-tool",
        data: {
          id: "tool-1",
          toolCallId: "tool-1",
          domain: "script",
          toolName: "read_script",
          status: "running"
        }
      },
      { type: "text", text: "Proposal ready" }
    ]);
    expect(scriptAiTimelineMessage({ ...message, parts: [message.parts[0]!] })).toBeNull();
  });
});
