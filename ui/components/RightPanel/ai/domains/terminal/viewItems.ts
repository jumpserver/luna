import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { PlanItem, TerminalStepItem, ViewExecution, ViewItem, ViewStep } from "../../types";
import type { AiViewItemBuilderFactory } from "../viewItems";

const terminalPartTypes = new Set(["data-plan", "data-command", "data-approval", "data-execution", "data-command-acl"]);

function isTerminalMessage(message: { metadata?: unknown }) {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object" || !("domain" in metadata)) return true;
  return metadata.domain === "terminal";
}

export const createTerminalViewItemBuilder: AiViewItemBuilderFactory = () => {
  const plans = new Map<string, PlanItem>();
  const steps = new Map<string, ViewStep>();
  const stepItems = new Map<string, TerminalStepItem>();
  const executions = new Map<string, ViewExecution>();

  function ensurePlan(items: ViewItem[], id: string, key: string, executionPlanLabel: string) {
    let plan = plans.get(id);
    if (!plan) {
      plan = {
        domain: "terminal",
        kind: "plan",
        key,
        id,
        summary: executionPlanLabel,
        steps: []
      };
      plans.set(id, plan);
      items.push(plan);
    }
    return plan;
  }

  function ensureStep(
    items: ViewItem[],
    plan: PlanItem,
    data: TerminalAiEventData,
    stepLabel: (count: number) => string
  ) {
    const id = String(data.stepId || data.id || `step-${plan.steps.length + 1}`);
    const key = `${plan.id}:${id}`;
    let step = steps.get(key);
    if (!step) {
      step = {
        id,
        key,
        index: Number(data.step) || plan.steps.length + 1,
        title: String(data.title || stepLabel(plan.steps.length + 1)),
        objective: String(data.objective || ""),
        status: String(data.status || "pending"),
        executions: []
      };
      steps.set(key, step);
      plan.steps.push(step);
      const item: TerminalStepItem = {
        domain: "terminal",
        kind: "terminal-step",
        key: `${key}-timeline`,
        planId: plan.id,
        step
      };
      stepItems.set(key, item);
      items.push(item);
    }
    return step;
  }

  function moveStepToLatest(items: ViewItem[], step: ViewStep) {
    const item = stepItems.get(step.key);
    if (!item) return;
    const index = items.indexOf(item);
    if (index < 0 || index === items.length - 1) return;
    items.splice(index, 1);
    items.push(item);
  }

  function ensureExecution(step: ViewStep, data: TerminalAiEventData) {
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
  }

  return {
    domain: "terminal",
    supports: (partType, message) => terminalPartTypes.has(partType) && isTerminalMessage(message),
    append(context, input) {
      const { data, message, partIndex, partType } = input;
      const planId = String(
        partType === "data-plan" ? data.id || `plan-${message.id}` : data.planId || `plan-${message.id}`
      );
      if (partType === "data-command-acl" && !data.planId && !data.stepId) {
        context.items.push({
          domain: "terminal",
          kind: "alert",
          key: `${message.id}-acl-${partIndex}`,
          data
        });
        return;
      }

      const plan = ensurePlan(
        context.items,
        planId,
        `${message.id}-plan-${partIndex}`,
        context.options.executionPlanLabel
      );
      if (partType === "data-plan") {
        plan.summary = String(data.summary || plan.summary);
        const rawSteps = Array.isArray(data.steps) ? data.steps : [];
        rawSteps.forEach((rawStep: TerminalAiEventData, index: number) => {
          const step = ensureStep(context.items, plan, rawStep, context.options.stepLabel);
          step.index = index + 1;
          step.title = String(rawStep.title || step.title);
          step.objective = String(rawStep.objective || step.objective);
          step.status = String(rawStep.status || step.status);
        });
        plan.steps.sort((left, right) => left.index - right.index);
        return;
      }

      const step = ensureStep(context.items, plan, data, context.options.stepLabel);
      moveStepToLatest(context.items, step);
      if (partType === "data-command-acl") {
        step.acl = data;
        return;
      }
      const execution = ensureExecution(step, data);
      if (partType === "data-execution") {
        if (data.outcome === "unknown" && ["success", "error", "timeout"].includes(String(execution.result?.outcome)))
          return;
        execution.result = { ...execution.result, ...data };
        if (data.outcome || data.status) step.status = String(data.outcome || data.status);
        return;
      }
      execution.command = { ...execution.command, ...data, partType };
    }
  };
};
