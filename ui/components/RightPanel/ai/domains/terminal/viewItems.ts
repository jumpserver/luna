import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { PlanItem, ViewExecution, ViewItem, ViewStep } from "../../types";
import type { AiViewItemBuilderFactory } from "../viewItems";

const terminalPartTypes = new Set(["data-plan", "data-command", "data-approval", "data-execution", "data-command-acl"]);

export const createTerminalViewItemBuilder: AiViewItemBuilderFactory = () => {
  const plans = new Map<string, PlanItem>();
  const steps = new Map<string, ViewStep>();
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

  function ensureStep(plan: PlanItem, data: TerminalAiEventData, stepLabel: (count: number) => string) {
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
    }
    return step;
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
    supports: (partType) => terminalPartTypes.has(partType),
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
          const step = ensureStep(plan, rawStep, context.options.stepLabel);
          step.index = index + 1;
          step.title = String(rawStep.title || step.title);
          step.objective = String(rawStep.objective || step.objective);
          step.status = String(rawStep.status || step.status);
        });
        plan.steps.sort((left, right) => left.index - right.index);
        return;
      }

      const step = ensureStep(plan, data, context.options.stepLabel);
      if (partType === "data-command-acl") {
        step.acl = data;
        return;
      }
      const execution = ensureExecution(step, data);
      if (partType === "data-execution") {
        execution.result = { ...execution.result, ...data };
        return;
      }
      execution.command = { ...execution.command, ...data, partType };
    }
  };
};
