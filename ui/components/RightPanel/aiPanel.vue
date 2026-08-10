<script setup lang="ts">
import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  createTerminalAiMessageId,
  getKokoTerminalAiSession,
  sendKokoTerminalAiControl
} from "#koko/composables/terminal/useTerminalAiSessions";

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

type ViewItem = TextItem | PlanItem | AlertItem;

const { t } = useI18n();
const { activePaneId } = useWorkspaceTabs();
const messagesElement = ref<HTMLElement | null>(null);
const session = computed(() => getKokoTerminalAiSession(activePaneId.value));
const available = computed(() => Boolean(session.value?.enabled));
// AI SDK mutates its shallow message array before triggering the ref, so expose
// a new reference to invalidate viewItems and other computed consumers.
const messages = computed(() => [...(session.value?.chat.messages.value || [])]);
const busy = computed(() => {
  const status = session.value?.chat.status.value;
  return status === "submitted" || status === "streaming";
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

const viewItems = computed<ViewItem[]>(() => {
  const items: ViewItem[] = [];
  const plans = new Map<string, PlanItem>();
  const steps = new Map<string, ViewStep>();
  const executions = new Map<string, ViewExecution>();

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
  sendKokoTerminalAiControl(activePaneId.value, message);
}

function submit() {
  const current = session.value;
  const text = draft.value.trim();
  if (!current || !text || busy.value || !current.enabled) return;

  current.draft = "";
  current.errorText = "";
  current.chat.clearError();
  scrollToBottom();

  void current.chat
    .sendMessage({
      text,
      metadata: { terminalId: Number(current.terminalId) }
    })
    .catch(() => {
      if (!current.errorText) current.errorText = t("RightPanel.AISendFailed");
    });
}

function handleSubmitKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  submit();
}

function updatePolicy() {
  const current = session.value;
  if (!current) return;

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
    current.errorText = t("RightPanel.AIPolicyFailed");
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
  if (!current || !decisionId || current.decisions.has(decisionId)) return;

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
    current.errorText = t("RightPanel.AIApprovalFailed");
  }
}

function interrupt() {
  const current = session.value;
  if (!current) return;

  try {
    sendMessage({
      id: createTerminalAiMessageId("interrupt"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [{ type: "data-interrupt", data: { reason: "user" } }]
    });
  } catch {
    current.errorText = t("RightPanel.AIInterruptFailed");
  }
}

function clearError() {
  const current = session.value;
  if (!current) return;
  current.errorText = "";
  current.chat.clearError();
}

function setExecutionOverride(id: string, value: string) {
  session.value?.executionOverrides.set(id, value);
}

function selectedExecution(data: TerminalAiEventData) {
  return session.value?.executionOverrides.get(String(data.id)) || String(data.execution || "pty");
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

watch([activePaneId, () => messages.value.length, () => messages.value.at(-1)?.parts.length], scrollToBottom);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!available" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        icon="i-lucide-sparkles"
        size="sm"
        variant="naked"
        :title="t('RightPanel.AIUnavailableTitle')"
        :description="t('RightPanel.AIUnavailableDescription')"
      />
    </div>

    <template v-else-if="session">
      <header class="shrink-0 space-y-2 border-b border-default p-3">
        <div class="flex items-center gap-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-bot" class="size-4" />
          </span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-highlighted">Terminal AI</div>
            <div class="truncate text-[11px] text-muted">
              {{ t("RightPanel.AIHeaderDescription") }}
            </div>
          </div>
        </div>
      </header>

      <main ref="messagesElement" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <UEmpty
          v-if="messages.length === 0"
          icon="i-lucide-square-terminal"
          size="sm"
          variant="naked"
          :title="t('RightPanel.AIEmptyTitle')"
          :description="t('RightPanel.AIEmptyDescription')"
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
                {{ item.role === "user" ? t("RightPanel.AIYou") : "Terminal AI" }}
              </div>
              <div
                class="markdown-body mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
                :class="item.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
                v-html="renderMarkdown(item.text)"
              />
            </div>
          </article>

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
                            {{ t("RightPanel.AIRisk", { level: execution.command.riskLevel }) }}
                          </UBadge>
                          <UBadge color="neutral" variant="subtle" size="xs">
                            {{ execution.command.execution }}
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
                        <UBadge
                          v-if="execution.result.exitCode !== undefined && execution.result.exitCode !== null"
                          color="neutral"
                          variant="subtle"
                          size="xs"
                        >
                          exit {{ execution.result.exitCode }}
                        </UBadge>
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
                    {{ step.acl.state || step.acl.action }}
                    {{ step.acl.decision?.name || step.acl.name || "" }}
                  </div>
                </div>
              </article>
            </div>
          </section>

          <div v-else class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
            {{ t("RightPanel.AICommandAcl") }}:
            {{ item.data.state || item.data.action }}
            {{ item.data.decision?.name || item.data.name || "" }}
          </div>
        </template>
      </main>

      <footer class="shrink-0 space-y-2 border-t border-default p-3">
        <div v-if="session.errorText" class="flex items-start gap-2 rounded-lg bg-error/10 p-2 text-[11px] text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
          <span class="min-w-0 flex-1">{{ session.errorText }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('koko.actions.close')"
            @click="clearError"
          />
        </div>
        <div v-if="session.runtimeStatus" class="flex items-center gap-1.5 text-[11px] text-muted">
          <UIcon
            :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-circle-dot'"
            class="size-3"
            :class="{ 'animate-spin': busy }"
          />
          {{ session.runtimeStatus }}
        </div>
        <p v-if="!session.backgroundExec && session.backgroundReason" class="text-[11px] text-muted">
          {{ session.backgroundReason }}
        </p>
        <div class="relative overflow-hidden rounded-lg bg-[var(--app-input-bg)]">
          <UTextarea
            v-model="draft"
            :rows="2"
            autoresize
            :maxrows="5"
            :placeholder="t('RightPanel.AIInputPlaceholder')"
            variant="none"
            class="block w-full"
            :disabled="busy"
            :ui="{ base: 'min-h-24 rounded-lg pb-11 text-xs' }"
            @keydown.enter.exact="handleSubmitKeydown"
          />
          <div class="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
            <div class="flex min-w-0 flex-1 items-center gap-1">
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
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-square"
              :label="t('RightPanel.AIInterrupt')"
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
