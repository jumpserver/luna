import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ViewItem, ViewStep } from "./types";
import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderAiMarkdown(source: string) {
  const html = marked.parse(source, { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html);
}

export function formatAiDuration(value: unknown) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)} s`;
}

export function aiRiskColor(level: number): "error" | "warning" | "info" | "success" {
  if (level >= 4) return "error";
  if (level >= 3) return "warning";
  if (level >= 2) return "info";
  return "success";
}

export function terminalApprovalPending(command: TerminalAiEventData | undefined, decisions: ReadonlySet<string>) {
  return Boolean(command?.partType === "data-approval" && !command.resolved && !decisions.has(String(command.id)));
}

export function terminalStepStatus(step: ViewStep) {
  if (["completed", "failed", "interrupted", "rejected", "skipped"].includes(step.status)) return step.status;
  const execution = step.executions.at(-1);
  if (execution?.command && !execution.result) return String(execution.command.state || step.status);
  const outcome = String(execution?.result?.outcome || "");
  if (["running", "reviewing", "waiting_input", "cancelling", "timeout", "unknown"].includes(outcome)) return outcome;
  return step.status || outcome || "pending";
}

export function terminalStepRunning(step: ViewStep) {
  return ["executing", "in_progress", "reviewing", "running"].includes(terminalStepStatus(step));
}

export function aiTimelineHasPendingOperation(items: ViewItem[]) {
  const lastRequest = items.findLastIndex((item) => item.kind === "text" && item.role === "user");
  return items.slice(lastRequest + 1).some((item) => {
    if (item.kind === "agent-tool") return item.data.status === "running";
    if (item.kind !== "terminal-step") return false;
    return (
      terminalStepRunning(item.step) ||
      ["awaiting_approval", "awaiting_risk_approval", "waiting_input", "cancelling"].includes(
        terminalStepStatus(item.step)
      )
    );
  });
}

export function terminalStepNeedsAttention(step: ViewStep, decisions: ReadonlySet<string>) {
  if (step.executions.some(({ command }) => terminalApprovalPending(command, decisions))) return true;
  if (step.acl && !["accept", "approved"].includes(String(step.acl.state || step.acl.action))) return true;
  return [
    "error",
    "failed",
    "expired",
    "timeout",
    "unknown",
    "waiting_input",
    "awaiting_approval",
    "awaiting_risk_approval"
  ].includes(terminalStepStatus(step));
}
