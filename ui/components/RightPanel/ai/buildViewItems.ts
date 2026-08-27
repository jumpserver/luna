import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { PlanItem, SqlThoughtItem, ViewExecution, ViewItem, ViewStep } from "./types";
import type {
  ChenSqlAiTiming,
  ChenSqlMetadataApproval,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";

interface BuildAiPanelViewItemsOptions {
  messages: TerminalAiChatMessage[];
  metadataApproval: ChenSqlMetadataApproval | null;
  terminalMetadataApproval: boolean;
  executionPlanLabel: string;
  stepLabel: (count: number) => string;
}

export function buildAiPanelViewItems(options: BuildAiPanelViewItemsOptions): ViewItem[] {
  const items: ViewItem[] = [];
  const plans = new Map<string, PlanItem>();
  const steps = new Map<string, ViewStep>();
  const executions = new Map<string, ViewExecution>();
  const sqlThoughts = new Map<string, SqlThoughtItem>();

  const ensurePlan = (id: string, key: string) => {
    let plan = plans.get(id);
    if (!plan) {
      plan = {
        kind: "plan",
        key,
        id,
        summary: options.executionPlanLabel,
        steps: []
      };
      plans.set(id, plan);
      items.push(plan);
    }
    return plan;
  };

  const ensureStep = (plan: PlanItem, data: TerminalAiEventData) => {
    const id = String(data.stepId || data.id || `step-${plan.steps.length + 1}`);
    const key = `${plan.id}:${id}`;
    let step = steps.get(key);
    if (!step) {
      step = {
        id,
        key,
        index: Number(data.step) || plan.steps.length + 1,
        title: String(data.title || options.stepLabel(plan.steps.length + 1)),
        objective: String(data.objective || ""),
        status: String(data.status || "pending"),
        executions: []
      };
      steps.set(key, step);
      plan.steps.push(step);
    }
    return step;
  };

  const ensureExecution = (step: ViewStep, data: TerminalAiEventData) => {
    const legacyId = data.command ? `legacy:${String(data.command)}` : `legacy:${step.executions.length + 1}`;
    const id = String(data.executionId || legacyId);
    const key = `${step.key}:${id}`;
    let execution = executions.get(key);
    if (!execution) {
      execution = { id, key, index: step.executions.length + 1 };
      executions.set(key, execution);
      step.executions.push(execution);
    }
    return execution;
  };

  for (const message of options.messages) {
    message.parts.forEach((part, partIndex) => {
      if (part.type === "text") {
        items.push({
          kind: "text",
          key: `${message.id}-text-${partIndex}`,
          role: message.role,
          text: part.text || ""
        });
        return;
      }

      const data = "data" in part ? (part.data as TerminalAiEventData) : {};
      if (part.type === "data-thought-summary") {
        const summary = String(data.text || "").trim();
        if (!summary) return;
        const key = `${message.id}-sql-thought`;
        let thought = sqlThoughts.get(key);
        if (!thought) {
          thought = { kind: "sql-thought", key, summaries: [] };
          sqlThoughts.set(key, thought);
          items.push(thought);
        }
        if (!thought.summaries.includes(summary)) thought.summaries.push(summary);
        return;
      }

      if (part.type === "data-sql-analysis") {
        items.push({ kind: "sql-analysis", key: `${message.id}-sql-analysis-${partIndex}`, data });
        return;
      }

      if (part.type === "data-sql-proposal") {
        items.push({
          kind: "sql-proposal",
          key: `${message.id}-sql-proposal-${partIndex}`,
          data: data as ChenSqlProposal
        });
        return;
      }

      if (part.type === "data-agent-timing") {
        items.push({
          kind: "sql-timing",
          key: `${message.id}-sql-timing-${partIndex}`,
          data: data as ChenSqlAiTiming
        });
        return;
      }

      if (part.type === "data-schema-result") {
        items.push({ kind: "schema-result", key: `${message.id}-schema-result-${partIndex}`, data });
        return;
      }

      if (part.type === "data-plan") {
        const planId = String(data.id || `plan-${message.id}`);
        const plan = ensurePlan(planId, `${message.id}-plan-${partIndex}`);
        plan.summary = String(data.summary || plan.summary);
        const rawSteps = Array.isArray(data.steps) ? data.steps : [];
        rawSteps.forEach((rawStep: TerminalAiEventData, index: number) => {
          const step = ensureStep(plan, rawStep);
          step.index = index + 1;
          step.title = String(rawStep.title || step.title);
          step.objective = String(rawStep.objective || step.objective);
          step.status = String(rawStep.status || step.status);
        });
        plan.steps.sort((left, right) => left.index - right.index);
        return;
      }

      if (part.type === "data-command" || part.type === "data-approval") {
        const planId = String(data.planId || `plan-${message.id}`);
        const plan = ensurePlan(planId, `${message.id}-plan-${partIndex}`);
        const step = ensureStep(plan, data);
        const execution = ensureExecution(step, data);
        execution.command = { ...execution.command, ...data, partType: part.type };
        return;
      }

      if (part.type === "data-execution") {
        const planId = String(data.planId || `plan-${message.id}`);
        const plan = ensurePlan(planId, `${message.id}-plan-${partIndex}`);
        const step = ensureStep(plan, data);
        const execution = ensureExecution(step, data);
        execution.result = { ...execution.result, ...data };
        return;
      }

      if (part.type === "data-command-acl") {
        if (data.planId || data.stepId) {
          const planId = String(data.planId || `plan-${message.id}`);
          const plan = ensurePlan(planId, `${message.id}-plan-${partIndex}`);
          ensureStep(plan, data).acl = data;
        } else {
          items.push({ kind: "alert", key: `${message.id}-acl-${partIndex}`, data });
        }
      }
    });
  }

  const approval = options.metadataApproval;
  if (approval) {
    const anchorIndex = items.findLastIndex((item) => item.kind === "text" && item.role === "user");
    const insertAt = anchorIndex >= 0 ? anchorIndex + 1 : items.length;
    items.splice(insertAt, 0, {
      kind: "metadata-approval",
      key: `metadata-approval-${approval.approvalId}`,
      approval,
      terminal: options.terminalMetadataApproval
    });
  }

  return items;
}
