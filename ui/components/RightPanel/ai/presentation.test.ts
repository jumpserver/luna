import type { ViewStep } from "./types";
import { describe, expect, it } from "vitest";
import {
  aiTimelineHasPendingOperation,
  terminalApprovalPending,
  terminalStepNeedsAttention,
  terminalStepStatus
} from "./presentation";

function step(overrides: Partial<ViewStep> = {}): ViewStep {
  return {
    id: "step",
    key: "plan:step",
    index: 1,
    title: "Inspect disk",
    objective: "",
    status: "pending",
    executions: [],
    ...overrides
  };
}

const decisions = new Set<string>();

describe("Terminal AI detail visibility", () => {
  it("does not let an older request suppress the next request's activity indicator", () => {
    expect(
      aiTimelineHasPendingOperation([
        { domain: "terminal", kind: "terminal-step", key: "old", planId: "old", step: step({ status: "running" }) },
        { domain: "shared", kind: "text", key: "new", role: "user", text: "Inspect another asset" }
      ])
    ).toBe(false);
  });

  it.each(["pending", "running", "success", "completed", "cancelled", "skipped"])(
    "keeps %s steps compact by default",
    (status) => {
      expect(terminalStepNeedsAttention(step({ status }), decisions)).toBe(false);
    }
  );

  it.each([
    "failed",
    "error",
    "timeout",
    "unknown",
    "waiting_input",
    "expired",
    "awaiting_approval",
    "awaiting_risk_approval"
  ])("surfaces %s steps", (status) => {
    expect(terminalStepNeedsAttention(step({ status }), decisions)).toBe(true);
  });

  it("surfaces unresolved approvals even while the plan is pending", () => {
    const command = { id: "approval-1", partType: "data-approval", state: "awaiting_approval" };
    const pending = step({ executions: [{ id: "exec", key: "exec", index: 1, command }] });
    expect(terminalApprovalPending(command, decisions)).toBe(true);
    expect(terminalStepNeedsAttention(pending, decisions)).toBe(true);
    expect(terminalApprovalPending(command, new Set(["approval-1"]))).toBe(false);
    expect(terminalStepNeedsAttention(pending, new Set(["approval-1"]))).toBe(true); // The server status still awaits approval.
    expect(terminalApprovalPending({ ...command, resolved: true }, decisions)).toBe(false);
    expect(terminalApprovalPending(undefined, decisions)).toBe(false);
  });

  it("uses live execution attention states until the plan reaches a terminal state", () => {
    const running = step({
      status: "in_progress",
      executions: [{ id: "exec", key: "exec", index: 1, result: { outcome: "waiting_input" } }]
    });
    expect(terminalStepStatus(running)).toBe("waiting_input");
    expect(terminalStepNeedsAttention(running, decisions)).toBe(true);
    expect(terminalStepStatus({ ...running, status: "completed" })).toBe("completed");
    expect(terminalStepNeedsAttention({ ...running, status: "completed" }, decisions)).toBe(false);
  });

  it("keeps ACL warnings visible without expanding accepted checks", () => {
    expect(terminalStepNeedsAttention(step({ status: "success", acl: { action: "notify_and_warn" } }), decisions)).toBe(
      true
    );
    expect(
      terminalStepNeedsAttention(step({ status: "success", acl: { state: "waiting_for_review" } }), decisions)
    ).toBe(true);
    expect(terminalStepNeedsAttention(step({ status: "success", acl: { action: "accept" } }), decisions)).toBe(false);
  });
});
