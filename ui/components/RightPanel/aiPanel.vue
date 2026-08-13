<script setup lang="ts">
import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ChenSqlAiTiming, ChenSqlProposal } from "~/chen/composables/useChenSqlAiSessions";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  terminalAiAclKey,
  terminalAiBackgroundReasonKey,
  terminalAiErrorKey,
  terminalAiExecutionKey,
  terminalAiProgressKey
} from "#koko/composables/terminal/terminalAiPresentation";
import { createTerminalAiMessageId, sendKokoTerminalAiControl } from "#koko/composables/terminal/useTerminalAiSessions";
import { getWorkspaceAiSession, isChenSqlWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";

interface ViewStep {
  id: string;
  key: string;
  index: number;
  title: string;
  objective: string;
  status: string;
  executions: ViewExecution[];
  acl?: TerminalAiEventData;
}

interface ViewExecution {
  id: string;
  key: string;
  index: number;
  command?: TerminalAiEventData;
  result?: TerminalAiEventData;
}

interface TextItem {
  kind: "text";
  key: string;
  role: TerminalAiChatMessage["role"];
  text: string;
}

interface PlanItem {
  kind: "plan";
  key: string;
  id: string;
  summary: string;
  steps: ViewStep[];
}

interface AlertItem {
  kind: "alert";
  key: string;
  data: TerminalAiEventData;
}

interface SqlAnalysisItem {
  kind: "sql-analysis";
  key: string;
  data: TerminalAiEventData;
}

interface SqlProposalItem {
  kind: "sql-proposal";
  key: string;
  data: ChenSqlProposal;
}

interface SqlThoughtItem {
  kind: "sql-thought";
  key: string;
  summaries: string[];
}

interface SqlTimingItem {
  kind: "sql-timing";
  key: string;
  data: ChenSqlAiTiming;
}

type ViewItem = TextItem | PlanItem | AlertItem | SqlAnalysisItem | SqlProposalItem | SqlThoughtItem | SqlTimingItem;

const { t } = useI18n();
const { activePaneId } = useWorkspaceTabs();
const messagesElement = ref<HTMLElement | null>(null);
const session = computed(() => getWorkspaceAiSession(activePaneId.value));
const sqlSession = computed(() => (isChenSqlWorkspaceAiSession(session.value) ? session.value : null));
const assistantName = computed(() => (sqlSession.value ? t("RightPanel.SQLAIName") : "Terminal AI"));
const available = computed(() => Boolean(session.value?.enabled));
const unavailableTitle = computed(() =>
  sqlSession.value ? t("RightPanel.SQLAIUnavailableTitle") : t("RightPanel.AIUnavailableTitle")
);
const unavailableDescription = computed(() => {
  if (sqlSession.value?.errorText) return sqlSession.value.errorText;
  return sqlSession.value ? t("RightPanel.SQLAIUnavailableDescription") : t("RightPanel.AIUnavailableDescription");
});
// AI SDK mutates its shallow message array before triggering the ref, so expose
// a new reference to invalidate viewItems and other computed consumers.
const messages = computed(() => [...(session.value?.chat.messages.value || [])]);
const busy = computed(() => {
  const status = session.value?.chat.status.value;
  return status === "submitted" || status === "streaming";
});
const elapsedClock = ref(Date.now());
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

function stopElapsedTimer() {
  if (elapsedTimer !== null) clearInterval(elapsedTimer);
  elapsedTimer = null;
}

watch(
  () => Boolean(sqlSession.value && busy.value),
  (running) => {
    stopElapsedTimer();
    elapsedClock.value = Date.now();
    if (running && import.meta.client) {
      elapsedTimer = setInterval(() => {
        elapsedClock.value = Date.now();
      }, 500);
    }
  },
  { immediate: true }
);
onBeforeUnmount(stopElapsedTimer);

const sqlElapsedDurationMs = computed(() => {
  const current = sqlSession.value;
  if (!current) return 0;
  const serverDuration = Number(current.timing.durationMs) || 0;
  if (busy.value && current.requestStartedAt > 0) {
    return Math.max(serverDuration, elapsedClock.value - current.requestStartedAt);
  }
  return Number(current.timing.clientDurationMs) || serverDuration;
});
const draft = computed({
  get: () => session.value?.draft || "",
  set: (value: string) => {
    if (session.value) session.value.draft = value;
  }
});

const thresholdOptions = computed(() => [
  {
    label: t("RightPanel.AIApprovalAllShort"),
    description: t("RightPanel.AIApprovalAll"),
    value: 1
  },
  {
    label: t("RightPanel.AIApprovalRisk2Short"),
    description: t("RightPanel.AIApprovalRisk2"),
    value: 2
  },
  {
    label: t("RightPanel.AIApprovalRisk3Short"),
    description: t("RightPanel.AIApprovalRisk3"),
    value: 3
  },
  {
    label: t("RightPanel.AIApprovalRisk4Short"),
    description: t("RightPanel.AIApprovalRisk4"),
    value: 4
  }
]);

const modeOptions = computed(() => [
  {
    label: t("RightPanel.AIModeAutoShort"),
    description: t("RightPanel.AIModeAuto"),
    value: "auto"
  },
  {
    label: t("RightPanel.AIModePtyShort"),
    description: t("RightPanel.AIModePty"),
    value: "pty_only"
  },
  {
    label: t("RightPanel.AIModeBackgroundShort"),
    description: t("RightPanel.AIModeBackground"),
    value: "background_only",
    disabled: !session.value?.backgroundExec
  }
]);

function translatedProtocolValue(key: string | undefined, fallback = "") {
  return key ? t(key) : fallback;
}

const errorLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  if (sqlSession.value) return current.errorText ? t("RightPanel.SQLAIFailed") : "";
  const key = terminalAiErrorKey(current.errorCode, current.errorText);
  return translatedProtocolValue(key, current.errorText ? t("RightPanel.AIFailed") : "");
});

const errorDetail = computed(() => {
  const current = session.value;
  if (sqlSession.value) return current?.errorText || "";
  if (!current?.errorText || terminalAiErrorKey(current.errorCode, current.errorText)) return "";
  return current.errorText;
});

const runtimeStatusLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  if (sqlSession.value) {
    const keys: Record<string, string> = {
      analyzing: "RightPanel.SQLAIStageAnalyzing",
      model: "RightPanel.SQLAIStageModel",
      reviewing: "RightPanel.SQLAIStageReviewing",
      tool:
        current.runtimeExecution === "validate_sql" ? "RightPanel.SQLAIStageValidation" : "RightPanel.SQLAIStageTool",
      cancelled: "RightPanel.SQLAIStageCancelled"
    };
    const key = keys[current.runtimeStatusCode];
    return key ? t(key) : current.runtimeStatus;
  }
  const key = terminalAiProgressKey({
    code: current.runtimeStatusCode,
    execution: current.runtimeExecution,
    state: current.runtimeState,
    text: current.runtimeStatus
  });
  return translatedProtocolValue(key, current.runtimeStatus);
});

const backgroundReasonLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  return translatedProtocolValue(terminalAiBackgroundReasonKey(current.backgroundReasonCode, current.backgroundReason));
});

const viewItems = computed<ViewItem[]>(() => {
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
        summary: t("RightPanel.AIExecutionPlan"),
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
        title: String(data.title || t("RightPanel.AIStep", { count: plan.steps.length + 1 })),
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

  for (const message of messages.value) {
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

  return items;
});

function scrollToBottom() {
  void nextTick(() => {
    if (messagesElement.value) messagesElement.value.scrollTop = messagesElement.value.scrollHeight;
  });
}

function sendMessage(message: TerminalAiChatMessage) {
  if (sqlSession.value) return;
  sendKokoTerminalAiControl(activePaneId.value, message);
}

function submit() {
  const current = session.value;
  const text = draft.value.trim();
  if (!current || !text || busy.value || !current.enabled) return;

  current.draft = "";
  current.errorCode = "";
  current.errorText = "";
  current.chat.clearError();
  scrollToBottom();

  void current.chat
    .sendMessage({
      text,
      metadata: sqlSession.value ? { operation: "generate" } : { terminalId: Number(current.terminalId) }
    })
    .catch(() => {
      if (!current.errorCode && !current.errorText) current.errorCode = "send_failed";
    });
}

function handleSubmitKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  submit();
}

function updatePolicy() {
  const current = session.value;
  if (!current || sqlSession.value) return;

  try {
    sendMessage({
      id: createTerminalAiMessageId("policy"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [
        {
          type: "data-policy",
          data: {
            approvalThreshold: current.approvalThreshold,
            executionMode: current.executionMode
          }
        }
      ]
    });
  } catch {
    current.errorCode = "policy_failed";
    current.errorText = "";
  }
}

function changeApprovalThreshold(value: unknown) {
  const current = session.value;
  if (!current) return;
  current.approvalThreshold = Number(value) || 2;
  updatePolicy();
}

function changeExecutionMode(value: unknown) {
  const current = session.value;
  if (!current) return;
  current.executionMode = String(value || "auto");
  updatePolicy();
}

function decide(data: TerminalAiEventData, approved: boolean) {
  const current = session.value;
  const decisionId = String(data.id || "");
  if (!current || sqlSession.value || !decisionId || current.decisions.has(decisionId)) return;

  current.decisions.add(decisionId);
  try {
    sendMessage({
      id: createTerminalAiMessageId("decision"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [
        {
          type: "data-approval",
          data: {
            id: data.id,
            digest: data.digest,
            approved,
            execution: current.executionOverrides.get(decisionId) || data.execution
          }
        }
      ]
    });
  } catch {
    current.decisions.delete(decisionId);
    current.errorCode = "approval_failed";
    current.errorText = "";
  }
}

function interrupt() {
  const current = session.value;
  if (!current) return;

  if (sqlSession.value) {
    sqlSession.value.cancelActive();
    return;
  }

  try {
    sendMessage({
      id: createTerminalAiMessageId("interrupt"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [{ type: "data-interrupt", data: { reason: "user" } }]
    });
  } catch {
    current.errorCode = "interrupt_failed";
    current.errorText = "";
  }
}

function clearError() {
  const current = session.value;
  if (!current) return;
  current.errorCode = "";
  current.errorText = "";
  current.chat.clearError();
}

function setExecutionOverride(id: string, value: string) {
  session.value?.executionOverrides.set(id, value);
}

function selectedExecution(data: TerminalAiEventData) {
  return session.value?.executionOverrides.get(String(data.id)) || String(data.execution || "pty");
}

function executionLabel(value: unknown) {
  return translatedProtocolValue(terminalAiExecutionKey(value), String(value || ""));
}

function aclLabel(data: TerminalAiEventData) {
  const value = data.state || data.action;
  return translatedProtocolValue(terminalAiAclKey(value), String(value || ""));
}

function renderMarkdown(source: string) {
  const html = marked.parse(source, { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html);
}

function stepStatus(step: ViewStep) {
  if (["completed", "failed", "rejected", "skipped"].includes(step.status)) return step.status;
  const execution = step.executions.at(-1);
  if (execution?.command && !execution.result) return String(execution.command.state || step.status);
  if (["running", "reviewing"].includes(String(execution?.result?.outcome))) {
    return String(execution?.result?.outcome);
  }
  return step.status || String(execution?.result?.outcome || "pending");
}

function statusLabel(step: ViewStep) {
  const labels: Record<string, string> = {
    approved: t("RightPanel.AIStatusApproved"),
    auto_approved: t("RightPanel.AIStatusAutoApproved"),
    awaiting_approval: t("RightPanel.AIStatusAwaitingApproval"),
    awaiting_risk_approval: t("RightPanel.AIStatusAwaitingApproval"),
    completed: t("RightPanel.AIStatusCompleted"),
    error: t("RightPanel.AIStatusFailed"),
    executing: t("RightPanel.AIStatusRunning"),
    failed: t("RightPanel.AIStatusFailed"),
    in_progress: t("RightPanel.AIStatusRunning"),
    interrupted: t("RightPanel.AIStatusInterrupted"),
    pending: t("RightPanel.AIStatusPending"),
    rejected: t("RightPanel.AIStatusRejected"),
    reviewing: t("RightPanel.AIStatusReviewing"),
    running: t("RightPanel.AIStatusRunning"),
    skipped: t("RightPanel.AIStatusSkipped"),
    success: t("RightPanel.AIStatusCompleted"),
    succeeded: t("RightPanel.AIStatusCompleted")
  };
  const status = stepStatus(step);
  return labels[status] || status;
}

function statusColor(step: ViewStep) {
  const status = stepStatus(step);
  if (["completed", "success", "succeeded"].includes(status)) return "success";
  if (["error", "failed", "rejected"].includes(status)) return "error";
  if (["awaiting_approval", "awaiting_risk_approval"].includes(status)) return "warning";
  if (["approved", "auto_approved", "executing", "in_progress", "reviewing", "running"].includes(status)) {
    return "primary";
  }
  return "neutral";
}

function statusIcon(step: ViewStep) {
  const color = statusColor(step);
  if (color === "success") return "i-lucide-circle-check";
  if (color === "error" || color === "warning") return "i-lucide-circle-alert";
  if (color === "primary") return "i-lucide-loader-circle";
  return "i-lucide-circle-dot";
}

function isStepExpanded(step: ViewStep) {
  const override = session.value?.expansionOverrides.get(step.key);
  if (override !== undefined) return override;
  return ["primary", "error", "warning"].includes(statusColor(step));
}

function toggleStep(step: ViewStep) {
  session.value?.expansionOverrides.set(step.key, !isStepExpanded(step));
}

function riskColor(level: number) {
  if (level >= 4) return "error";
  if (level >= 3) return "warning";
  if (level >= 2) return "info";
  return "success";
}

function terminalRiskLabel(level: unknown) {
  const labels: Record<number, string> = {
    1: t("RightPanel.AIRiskReadOnly"),
    2: t("RightPanel.AIRiskLow"),
    3: t("RightPanel.AIRiskMedium"),
    4: t("RightPanel.AIRiskHigh")
  };
  return labels[Number(level)] || t("RightPanel.AIRisk", { level });
}

function proposalDecision(item: SqlProposalItem) {
  return sqlSession.value?.proposalDecisions.get(item.key) || "";
}

function applySqlProposal(item: SqlProposalItem) {
  const current = sqlSession.value;
  if (!current || proposalDecision(item)) return;
  const result = current.applyProposal(item.data);
  current.proposalDecisions.set(item.key, result.applied ? "applied" : "stale");
}

function rejectSqlProposal(item: SqlProposalItem) {
  const current = sqlSession.value;
  if (!current || proposalDecision(item)) return;
  current.proposalDecisions.set(item.key, "rejected");
}

function isSqlThoughtExpanded(item: SqlThoughtItem) {
  return sqlSession.value?.expansionOverrides.get(item.key) ?? false;
}

function setSqlThoughtExpanded(item: SqlThoughtItem, expanded: boolean) {
  sqlSession.value?.expansionOverrides.set(item.key, expanded);
}

function sqlAnalysisErrors(data: TerminalAiEventData) {
  return Array.isArray(data.errors) ? data.errors.map(String) : [];
}

function sqlAnalysisItems(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function formatExecutionDuration(value: unknown) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)} s`;
}

function sqlTimingTotal(data: ChenSqlAiTiming) {
  return Number(data.clientDurationMs) || Number(data.durationMs) || 0;
}

watch([activePaneId, () => messages.value.length, () => messages.value.at(-1)?.parts.length], scrollToBottom);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!available" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        icon="i-lucide-sparkles"
        size="sm"
        variant="naked"
        :title="unavailableTitle"
        :description="unavailableDescription"
      />
    </div>

    <template v-else-if="session">
      <header class="shrink-0 space-y-2 border-b border-default p-3">
        <div class="flex items-center gap-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-bot" class="size-4" />
          </span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-highlighted">{{ assistantName }}</div>
            <div class="truncate text-[11px] text-muted">
              {{ sqlSession ? t("RightPanel.SQLAIHeaderDescription") : t("RightPanel.AIHeaderDescription") }}
            </div>
          </div>
        </div>
      </header>

      <main ref="messagesElement" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <UEmpty
          v-if="messages.length === 0"
          :icon="sqlSession ? 'i-lucide-database-zap' : 'i-lucide-square-terminal'"
          size="sm"
          variant="naked"
          :title="sqlSession ? t('RightPanel.SQLAIEmptyTitle') : t('RightPanel.AIEmptyTitle')"
          :description="sqlSession ? t('RightPanel.SQLAIEmptyDescription') : t('RightPanel.AIEmptyDescription')"
        />

        <template v-for="item in viewItems" :key="item.key">
          <article
            v-if="item.kind === 'text'"
            class="flex gap-2"
            :class="item.role === 'user' ? 'flex-row-reverse' : ''"
          >
            <span
              class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary"
            >
              <UIcon :name="item.role === 'user' ? 'i-lucide-user-round' : 'i-lucide-bot'" class="size-3.5" />
            </span>
            <div class="min-w-0 max-w-[88%]" :class="item.role === 'user' ? 'text-right' : ''">
              <div class="text-[10px] text-muted">
                {{ item.role === "user" ? t("RightPanel.AIYou") : assistantName }}
              </div>
              <div
                class="markdown-body mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
                :class="item.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
                v-html="renderMarkdown(item.text)"
              />
            </div>
          </article>

          <UCollapsible
            v-else-if="item.kind === 'sql-thought'"
            :open="isSqlThoughtExpanded(item)"
            class="overflow-hidden rounded-xl border border-default bg-elevated/40"
            @update:open="setSqlThoughtExpanded(item, $event)"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="min-h-9 cursor-pointer justify-start rounded-none px-2.5 py-2"
            >
              <UIcon name="i-lucide-brain" class="size-3.5 shrink-0 text-primary" />
              <span class="shrink-0 text-[11px] font-medium text-highlighted">
                {{ t("RightPanel.SQLAIThoughtSummary") }}
              </span>
              <span
                v-if="!isSqlThoughtExpanded(item)"
                class="min-w-0 flex-1 truncate text-left text-[10px] font-normal text-muted"
                :title="item.summaries.at(-1)"
              >
                {{ item.summaries.at(-1) }}
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-3.5 shrink-0 text-muted transition-transform duration-150"
                :class="isSqlThoughtExpanded(item) ? 'rotate-90' : ''"
              />
            </UButton>

            <template #content>
              <div class="space-y-1.5 border-t border-default px-2.5 py-2 text-[11px] leading-5 text-muted">
                <p
                  v-for="summary in item.summaries"
                  :key="summary"
                  class="whitespace-pre-wrap [overflow-wrap:anywhere]"
                >
                  {{ summary }}
                </p>
              </div>
            </template>
          </UCollapsible>

          <section
            v-else-if="item.kind === 'sql-analysis'"
            class="space-y-2 rounded-xl border border-default bg-elevated/60 p-2.5"
          >
            <header class="flex flex-wrap items-center gap-1.5">
              <span class="mr-auto text-xs font-semibold text-highlighted">
                {{ t("RightPanel.SQLAIAnalysis") }}
              </span>
              <UBadge :color="item.data.valid ? 'success' : 'error'" variant="subtle" size="xs">
                {{ item.data.valid ? t("RightPanel.SQLAIValid") : t("RightPanel.SQLAIInvalid") }}
              </UBadge>
              <UBadge v-if="item.data.statementType" color="neutral" variant="subtle" size="xs">
                {{ item.data.statementType }}
              </UBadge>
              <UBadge
                v-if="Number(item.data.riskLevel) > 0"
                :color="riskColor(Number(item.data.riskLevel))"
                variant="subtle"
                size="xs"
              >
                {{ t("RightPanel.AIRisk", { level: item.data.riskLevel }) }}
              </UBadge>
            </header>
            <p v-if="item.data.riskReason" class="text-[11px] text-muted">
              {{ item.data.riskReason }}
            </p>
            <div v-if="sqlAnalysisItems(item.data.tables).length" class="text-[11px]">
              <span class="text-muted">{{ t("RightPanel.SQLAITables") }}:</span>
              {{ sqlAnalysisItems(item.data.tables).join(", ") }}
            </div>
            <div v-if="sqlAnalysisItems(item.data.columns).length" class="text-[11px]">
              <span class="text-muted">{{ t("RightPanel.SQLAIColumns") }}:</span>
              {{ sqlAnalysisItems(item.data.columns).join(", ") }}
            </div>
            <ul v-if="sqlAnalysisErrors(item.data).length" class="space-y-1 text-[11px] text-error">
              <li v-for="error in sqlAnalysisErrors(item.data)" :key="error" class="flex items-start gap-1.5">
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
                <span class="break-words">{{ error }}</span>
              </li>
            </ul>
          </section>

          <section
            v-else-if="item.kind === 'sql-proposal'"
            class="overflow-hidden rounded-xl border border-default bg-elevated/60"
          >
            <header class="flex items-center gap-2 border-b border-default px-2.5 py-2">
              <UIcon name="i-lucide-file-diff" class="size-4 text-primary" />
              <span class="mr-auto text-xs font-semibold text-highlighted">
                {{ t("RightPanel.SQLAIProposal") }}
              </span>
              <UBadge v-if="proposalDecision(item)" color="neutral" variant="subtle" size="xs">
                {{ t(`RightPanel.SQLAIProposalState.${proposalDecision(item)}`) }}
              </UBadge>
            </header>
            <div
              v-if="item.data.explanation"
              class="markdown-body border-b border-default p-2.5 text-xs text-muted"
              v-html="renderMarkdown(String(item.data.explanation))"
            />
            <div class="grid min-h-0 gap-px bg-[var(--app-border)] sm:grid-cols-2">
              <div class="min-w-0 bg-default">
                <div class="border-b border-default bg-error/10 px-2 py-1 text-[10px] font-medium text-error">
                  {{ t("RightPanel.SQLAIBefore") }}
                </div>
                <pre
                  class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
                ><code>{{ item.data.originalSql || t("RightPanel.SQLAINewQuery") }}</code></pre>
              </div>
              <div class="min-w-0 bg-default">
                <div class="border-b border-default bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
                  {{ t("RightPanel.SQLAIAfter") }}
                </div>
                <pre
                  class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
                ><code>{{ item.data.sql }}</code></pre>
              </div>
            </div>
            <div v-if="!proposalDecision(item)" class="flex justify-end gap-1.5 border-t border-default p-2">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :label="t('RightPanel.AIReject')"
                @click="rejectSqlProposal(item)"
              />
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-check"
                :label="t('RightPanel.SQLAIApply')"
                @click="applySqlProposal(item)"
              />
            </div>
          </section>

          <section
            v-else-if="item.kind === 'sql-timing'"
            class="rounded-xl border border-default bg-elevated/40 px-2.5 py-2 text-[11px] text-muted"
          >
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-clock-3" class="size-3.5 text-primary" />
              <span class="font-medium text-highlighted">{{ t("RightPanel.SQLAITiming") }}</span>
              <span class="ml-auto font-mono tabular-nums text-highlighted">
                {{ formatExecutionDuration(sqlTimingTotal(item.data)) }}
              </span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              <span v-if="Number(item.data.modelDurationMs) > 0">
                {{ t("RightPanel.SQLAIModelDuration") }}
                · {{ formatExecutionDuration(item.data.modelDurationMs) }}
              </span>
              <span v-if="Number(item.data.toolDurationMs) > 0">
                {{ t("RightPanel.SQLAIToolDuration") }}
                · {{ formatExecutionDuration(item.data.toolDurationMs) }}
              </span>
              <span v-if="Number(item.data.queueDurationMs) >= 1">
                {{ t("RightPanel.SQLAIQueueDuration") }}
                · {{ formatExecutionDuration(item.data.queueDurationMs) }}
              </span>
            </div>
          </section>

          <section
            v-else-if="item.kind === 'plan'"
            class="overflow-hidden rounded-xl border border-default bg-elevated/60"
          >
            <header class="flex items-start gap-2 border-b border-default p-2.5">
              <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-square-terminal" class="size-4" />
              </span>
              <div class="min-w-0">
                <div class="text-[10px] text-muted">
                  {{ t("RightPanel.AIExecutionPlan") }}
                </div>
                <div class="markdown-body compact text-xs" v-html="renderMarkdown(item.summary)" />
              </div>
            </header>

            <div class="space-y-1.5 p-2">
              <article
                v-for="step in item.steps"
                :key="step.key"
                class="overflow-hidden rounded-lg border border-default bg-default"
              >
                <button
                  type="button"
                  class="grid min-h-10 w-full grid-cols-[20px_minmax(0,1fr)_auto_14px] items-center gap-1.5 px-2 py-1.5 text-left hover:bg-elevated"
                  @click="toggleStep(step)"
                >
                  <span class="grid size-5 place-items-center rounded border border-default text-[10px] text-muted">
                    {{ step.index }}
                  </span>
                  <span class="truncate text-xs font-medium">{{ step.title }}</span>
                  <UBadge :color="statusColor(step)" variant="subtle" size="xs">
                    <UIcon
                      :name="statusIcon(step)"
                      class="size-3"
                      :class="statusColor(step) === 'primary' ? 'animate-spin' : ''"
                    />
                    {{ statusLabel(step) }}
                  </UBadge>
                  <UIcon
                    :name="isStepExpanded(step) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3.5"
                  />
                </button>

                <div v-if="isStepExpanded(step)" class="space-y-2 px-2 pb-2 pl-8">
                  <div
                    v-if="step.objective"
                    class="markdown-body text-xs text-muted"
                    v-html="renderMarkdown(step.objective)"
                  />

                  <div v-for="execution in step.executions" :key="execution.key" class="space-y-2">
                    <div v-if="execution.command" class="overflow-hidden rounded-lg border border-default">
                      <div
                        class="flex items-center justify-between gap-2 border-b border-default px-2 py-1.5 text-[11px] text-muted"
                      >
                        <span>
                          {{ t("RightPanel.AICommand") }}
                          <span v-if="step.executions.length > 1">{{ execution.index }}</span>
                        </span>
                        <div class="flex flex-wrap justify-end gap-1">
                          <UBadge :color="riskColor(Number(execution.command.riskLevel))" variant="subtle" size="xs">
                            {{ terminalRiskLabel(execution.command.riskLevel) }}
                          </UBadge>
                          <UBadge color="neutral" variant="subtle" size="xs">
                            {{ executionLabel(execution.command.execution) }}
                          </UBadge>
                          <UBadge
                            v-if="execution.command.decisionDurationMs !== undefined"
                            color="neutral"
                            variant="subtle"
                            size="xs"
                          >
                            {{ t("RightPanel.AIDecisionDuration") }}
                            {{ formatExecutionDuration(execution.command.decisionDurationMs) }}
                          </UBadge>
                          <UBadge
                            v-if="execution.command.state === 'auto_approved'"
                            color="success"
                            variant="subtle"
                            size="xs"
                          >
                            {{ t("RightPanel.AIAutoApproved") }}
                          </UBadge>
                        </div>
                      </div>
                      <pre
                        class="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted/40 p-2 font-mono text-[11px]"
                      ><code>{{ execution.command.command }}</code></pre>
                      <div
                        v-if="execution.command.rationale"
                        class="markdown-body px-2 pt-2 text-xs text-muted"
                        v-html="renderMarkdown(String(execution.command.rationale))"
                      />
                      <p
                        v-if="execution.command.riskReason"
                        class="flex items-start gap-1.5 px-2 py-2 text-[11px] text-warning"
                      >
                        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
                        {{ execution.command.riskReason }}
                      </p>

                      <div
                        v-if="
                          execution.command.partType === 'data-approval' &&
                          !session.decisions.has(String(execution.command.id))
                        "
                        class="space-y-2 border-t border-default p-2"
                      >
                        <div v-if="session.executionMode === 'auto'" class="flex gap-1.5">
                          <UButton
                            size="xs"
                            color="neutral"
                            :variant="selectedExecution(execution.command) === 'pty' ? 'solid' : 'soft'"
                            :label="t('RightPanel.AICurrentPty')"
                            @click="setExecutionOverride(String(execution.command?.id), 'pty')"
                          />
                          <UButton
                            size="xs"
                            color="neutral"
                            :variant="selectedExecution(execution.command) === 'background_exec' ? 'solid' : 'soft'"
                            :label="t('RightPanel.AIBackgroundExecution')"
                            :disabled="!session.backgroundExec || execution.command.backgroundEligible === false"
                            @click="setExecutionOverride(String(execution.command?.id), 'background_exec')"
                          />
                        </div>
                        <div class="flex justify-end gap-1.5">
                          <UButton
                            size="xs"
                            color="neutral"
                            variant="soft"
                            :label="t('RightPanel.AIReject')"
                            @click="decide(execution.command || {}, false)"
                          />
                          <UButton
                            size="xs"
                            color="primary"
                            :label="t('RightPanel.AIApprove')"
                            @click="decide(execution.command || {}, true)"
                          />
                        </div>
                      </div>
                    </div>

                    <div v-if="execution.result" class="overflow-hidden rounded-lg border border-default">
                      <div
                        class="flex items-center justify-between border-b border-default px-2 py-1.5 text-[11px] text-muted"
                      >
                        <span>{{ t("RightPanel.AIExecutionResult") }}</span>
                        <div class="flex flex-wrap justify-end gap-1">
                          <UBadge
                            v-if="execution.result.durationMs !== undefined"
                            color="neutral"
                            variant="subtle"
                            size="xs"
                          >
                            {{ t("RightPanel.AIExecutionDuration") }}
                            {{ formatExecutionDuration(execution.result.durationMs) }}
                          </UBadge>
                          <UBadge
                            v-if="execution.result.exitCode !== undefined && execution.result.exitCode !== null"
                            color="neutral"
                            variant="subtle"
                            size="xs"
                          >
                            {{ t("RightPanel.AIExitCode", { code: execution.result.exitCode }) }}
                          </UBadge>
                        </div>
                      </div>
                      <div
                        v-if="execution.result.summary"
                        class="markdown-body p-2 text-xs text-muted"
                        v-html="renderMarkdown(String(execution.result.summary))"
                      />
                      <pre
                        v-if="execution.result.output"
                        class="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted/40 p-2 font-mono text-[11px]"
                      ><code>{{ execution.result.output }}</code></pre>
                      <p
                        v-if="!execution.result.summary && !execution.result.output"
                        class="p-2 text-[11px] text-muted"
                      >
                        {{ statusLabel(step) }}
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="step.acl"
                    class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning"
                  >
                    <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
                    {{ t("RightPanel.AICommandAcl") }}:
                    {{ aclLabel(step.acl) }}
                    {{ step.acl.decision?.name || step.acl.name || "" }}
                  </div>
                </div>
              </article>
            </div>
          </section>

          <div
            v-else-if="item.kind === 'alert'"
            class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
            {{ t("RightPanel.AICommandAcl") }}:
            {{ aclLabel(item.data) }}
            {{ item.data.decision?.name || item.data.name || "" }}
          </div>
        </template>
      </main>

      <footer class="shrink-0 space-y-2 border-t border-default p-3">
        <div v-if="errorLabel" class="flex items-start gap-2 rounded-lg bg-error/10 p-2 text-[11px] text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block">{{ errorLabel }}</span>
            <span v-if="errorDetail" class="mt-0.5 block break-words text-[10px] opacity-80">{{ errorDetail }}</span>
            <span
              v-if="sqlSession && sqlElapsedDurationMs > 0"
              class="mt-1 flex items-center gap-1 font-mono text-[10px] tabular-nums opacity-80"
            >
              <UIcon name="i-lucide-clock-3" class="size-3" />
              {{ t("RightPanel.SQLAITiming") }} · {{ formatExecutionDuration(sqlElapsedDurationMs) }}
            </span>
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('koko.actions.close')"
            @click="clearError"
          />
        </div>
        <div v-if="runtimeStatusLabel || (sqlSession && busy)" class="flex items-center gap-1.5 text-[11px] text-muted">
          <UIcon
            :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-circle-dot'"
            class="size-3"
            :class="{ 'animate-spin': busy }"
          />
          <span>{{ runtimeStatusLabel }}</span>
          <span v-if="sqlSession" class="ml-auto font-mono tabular-nums text-highlighted">
            {{ formatExecutionDuration(sqlElapsedDurationMs) }}
          </span>
        </div>
        <p v-if="!sqlSession && !session.backgroundExec && backgroundReasonLabel" class="text-[11px] text-muted">
          {{ backgroundReasonLabel }}
        </p>
        <div class="relative overflow-hidden rounded-lg bg-[var(--app-input-bg)]">
          <UTextarea
            v-model="draft"
            :rows="2"
            autoresize
            :maxrows="5"
            :placeholder="sqlSession ? t('RightPanel.SQLAIInputPlaceholder') : t('RightPanel.AIInputPlaceholder')"
            variant="none"
            class="block w-full"
            :disabled="busy"
            :ui="{ base: 'min-h-24 rounded-lg pb-11 text-xs' }"
            @keydown.enter.exact="handleSubmitKeydown"
          />
          <div class="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
            <div v-if="!sqlSession" class="flex min-w-0 flex-1 items-center gap-1">
              <USelect
                size="xs"
                variant="soft"
                icon="i-lucide-shield-check"
                class="min-w-0 max-w-36"
                :model-value="session.approvalThreshold"
                :items="thresholdOptions"
                value-key="value"
                label-key="label"
                :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
                @update:model-value="changeApprovalThreshold"
              />
              <USelect
                size="xs"
                variant="soft"
                icon="i-lucide-sparkles"
                class="min-w-0 max-w-32"
                :model-value="session.executionMode"
                :items="modeOptions"
                value-key="value"
                label-key="label"
                :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
                @update:model-value="changeExecutionMode"
              />
            </div>
            <UButton
              v-if="busy"
              class="ml-auto"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-square"
              :label="sqlSession ? t('RightPanel.SQLAICancel') : t('RightPanel.AIInterrupt')"
              @click="interrupt"
            />
            <UTooltip :text="t('RightPanel.AISend')">
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-send"
                :aria-label="t('RightPanel.AISend')"
                :disabled="busy || !draft.trim()"
                @click="submit"
              />
            </UTooltip>
          </div>
        </div>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.markdown-body {
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.markdown-body.compact {
  font-weight: 600;
  line-height: 1.45;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.4rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.3rem 0;
  padding-left: 1.2rem;
}

.markdown-body :deep(li + li) {
  margin-top: 0.2rem;
}

.markdown-body :deep(a) {
  color: var(--ui-color-primary-500);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  overflow: auto;
  margin: 0.4rem 0;
  padding: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg-soft);
  white-space: pre-wrap;
}

.markdown-body :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: 0.4rem 0;
  padding-left: 0.55rem;
  border-left: 2px solid var(--ui-color-primary-500);
  color: var(--app-muted);
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 0.4rem 0;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--app-border);
  text-align: left;
}
</style>
