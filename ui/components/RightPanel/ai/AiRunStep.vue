<script setup lang="ts">
import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ViewExecution, ViewStep } from "./types";
import { terminalAiAclKey, terminalAiExecutionKey } from "#koko/composables/terminal/terminalAiPresentation";
import AiToolCallItem from "./domains/shared/AiToolCallItem.vue";
import {
  aiRiskColor,
  formatAiDuration,
  renderAiMarkdown,
  terminalApprovalPending,
  terminalStepNeedsAttention,
  terminalStepRunning,
  terminalStepStatus
} from "./presentation";

const props = withDefaults(
  defineProps<{
    expanded?: boolean;
    step: ViewStep;
    decisions: ReadonlySet<string>;
    executionOverrides: ReadonlyMap<string, string>;
    executionMode: string;
    backgroundExec: boolean;
    readOnly?: boolean;
  }>(),
  { expanded: undefined }
);

const emit = defineEmits<{
  setExpanded: [expanded: boolean];
  decide: [data: TerminalAiEventData, approved: boolean];
  setExecutionOverride: [id: string, value: string];
}>();

const { t } = useI18n();

const hasDetails = computed(
  () => Boolean(props.step.objective) || props.step.executions.length > 0 || Boolean(props.step.acl)
);

function translatedProtocolValue(key: string | undefined, fallback = "") {
  return key ? t(key) : fallback;
}

const needsAttention = computed(() => terminalStepNeedsAttention(props.step, props.decisions));
const expanded = computed(() => props.expanded ?? needsAttention.value);
const stepTitle = computed(() => {
  const title = props.step.title;
  if (title && title !== t("RightPanel.AIStep", { count: props.step.index })) return title;
  return String(props.step.executions.at(-1)?.command?.command || title);
});

// New approval or attention states must surface even after the user collapsed an earlier execution.
watch([needsAttention, stepStatus, () => props.step.executions.length], ([value]) => {
  if (value) emit("setExpanded", true);
});

function hasExecutionDetails({ command, result, operations }: ViewExecution) {
  return Boolean(
    operations?.length ||
    (command?.rationale && !terminalApprovalPending(command, props.decisions)) ||
    command?.execution ||
    command?.timeoutSeconds !== undefined ||
    command?.state === "auto_approved" ||
    Number(command?.decisionDurationMs ?? result?.modelDurationMs) > 0 ||
    result?.execution ||
    (result?.exitCode !== undefined && result.exitCode !== null)
  );
}

function stepStatus() {
  return terminalStepStatus(props.step);
}

function statusLabel() {
  const labels: Record<string, string> = {
    expired: t("RightPanel.AIStatusApprovalExpired"),
    timeout: t("RightPanel.AIStatusTimeout"),
    unknown: t("RightPanel.AIStatusUnknown"),
    cancelled: t("RightPanel.AIStatusCancelled"),
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
    waiting_input: t("RightPanel.AIStatusWaitingInput"),
    cancelling: t("RightPanel.AIStatusCancelling"),
    running: t("RightPanel.AIStatusRunning"),
    skipped: t("RightPanel.AIStatusSkipped"),
    success: t("RightPanel.AIStatusCompleted"),
    succeeded: t("RightPanel.AIStatusCompleted")
  };
  const status = stepStatus();
  return labels[status] || status;
}

function statusColor(): "success" | "error" | "warning" | "primary" | "neutral" {
  const status = stepStatus();
  if (["completed", "success", "succeeded"].includes(status)) return "success";
  if (["error", "failed"].includes(status)) return "error";
  if (
    ["expired", "timeout", "unknown", "awaiting_approval", "awaiting_risk_approval", "waiting_input"].includes(status)
  )
    return "warning";
  if (["approved", "auto_approved", "executing", "in_progress", "reviewing", "running"].includes(status)) {
    return "primary";
  }
  return "neutral";
}

function statusTextClass() {
  return {
    success: "text-success",
    error: "text-error",
    warning: "text-warning",
    primary: "text-primary",
    neutral: "text-muted"
  }[statusColor()];
}

function statusIcon() {
  const color = statusColor();
  if (color === "success") return "i-lucide-circle-check";
  if (color === "error" || color === "warning") return "i-lucide-circle-alert";
  if (color === "primary") return "i-lucide-loader-circle";
  return "i-lucide-circle-dot";
}

function selectedExecution(data: TerminalAiEventData) {
  return props.executionOverrides.get(String(data.id)) || String(data.execution || "pty");
}

function executionLabel(value: unknown) {
  return translatedProtocolValue(terminalAiExecutionKey(value), String(value || ""));
}

function aclLabel(data: TerminalAiEventData) {
  const value = data.state || data.action;
  return translatedProtocolValue(terminalAiAclKey(value), String(value || ""));
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
</script>

<template>
  <UCollapsible
    as="article"
    :open="hasDetails && expanded"
    :disabled="!hasDetails"
    class="run-step"
    @update:open="emit('setExpanded', $event)"
  >
    <UButton color="neutral" variant="ghost" block class="run-step-header" :title="stepTitle">
      <UIcon
        :name="statusIcon()"
        class="size-3.5 shrink-0"
        :class="[statusTextClass(), { 'animate-spin': terminalStepRunning(step) }]"
      />
      <span class="shrink-0 text-[10px] font-normal text-muted">{{ step.index }}</span>
      <span class="min-w-0 flex-1 truncate text-left text-xs font-medium text-highlighted">{{ stepTitle }}</span>
      <span class="shrink-0 text-[10px] font-normal" :class="needsAttention ? statusTextClass() : 'text-muted'">
        {{ statusLabel() }}
      </span>
      <UIcon
        v-if="hasDetails"
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 text-muted transition-transform"
        :class="{ 'rotate-90': expanded }"
      />
    </UButton>

    <template #content>
      <div class="run-step-body">
        <div v-if="step.objective" class="markdown-body text-xs text-muted" v-html="renderAiMarkdown(step.objective)" />

        <section v-for="execution in step.executions" :key="execution.key" class="execution-card">
          <template v-if="execution.command">
            <div class="flex flex-wrap items-center gap-1.5 px-2.5 pt-2 text-[11px] text-muted">
              <UIcon name="i-lucide-terminal" class="size-3.5" />
              <span class="mr-auto">
                {{ t("RightPanel.AICommand") }}
                <template v-if="step.executions.length > 1">{{ execution.index }}</template>
              </span>
              <UBadge
                v-if="Number(execution.command.riskLevel) > 0"
                :color="aiRiskColor(Number(execution.command.riskLevel))"
                variant="subtle"
                size="xs"
              >
                {{ terminalRiskLabel(execution.command.riskLevel) }}
              </UBadge>
            </div>
            <pre class="command-output"><code>{{ execution.command.command }}</code></pre>
            <div
              v-if="execution.command.rationale && terminalApprovalPending(execution.command, decisions)"
              class="markdown-body px-2.5 pb-2 text-xs text-muted"
              v-html="renderAiMarkdown(String(execution.command.rationale))"
            />
            <p
              v-if="execution.command.riskReason"
              class="flex items-start gap-1.5 px-2.5 pb-2 text-[11px] text-warning"
            >
              <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
              {{ execution.command.riskReason }}
            </p>
            <p v-if="execution.command.state === 'expired'" class="px-2.5 pb-2 text-xs text-warning">
              {{ t("RightPanel.AIApprovalExpired") }}
            </p>
            <div
              v-if="!readOnly && terminalApprovalPending(execution.command, decisions)"
              class="space-y-2 border-t border-warning/30 bg-warning/5 p-2.5"
            >
              <div class="flex items-center gap-1.5 text-[11px] font-medium text-warning">
                <UIcon name="i-lucide-shield-alert" class="size-3.5" />
                {{ t("RightPanel.AIStatusAwaitingApproval") }}
              </div>
              <div v-if="executionMode === 'auto'" class="flex flex-wrap gap-1.5">
                <UButton
                  size="xs"
                  color="neutral"
                  :variant="selectedExecution(execution.command) === 'pty' ? 'solid' : 'soft'"
                  :label="t('RightPanel.AICurrentPty')"
                  @click="emit('setExecutionOverride', String(execution.command?.id), 'pty')"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  :variant="selectedExecution(execution.command) === 'background_exec' ? 'solid' : 'soft'"
                  :label="t('RightPanel.AIBackgroundExecution')"
                  :disabled="!backgroundExec || execution.command.backgroundEligible === false"
                  @click="emit('setExecutionOverride', String(execution.command?.id), 'background_exec')"
                />
              </div>
              <div class="flex justify-end gap-1.5">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :label="t('RightPanel.AIReject')"
                  @click="emit('decide', execution.command, false)"
                />
                <UButton
                  size="xs"
                  color="primary"
                  icon="i-lucide-check"
                  :label="t('RightPanel.AIApprove')"
                  @click="emit('decide', execution.command, true)"
                />
              </div>
            </div>
          </template>

          <div v-if="execution.result" class="space-y-2 border-t border-default px-2.5 py-2">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <span class="mr-auto font-medium">{{ t("RightPanel.AIExecutionResult") }}</span>
              <span v-if="Number(execution.result.durationMs) > 0" class="font-mono text-[10px]">
                {{ formatAiDuration(execution.result.durationMs) }}
              </span>
              <span
                v-if="
                  execution.result.exitCode !== undefined &&
                  execution.result.exitCode !== null &&
                  Number(execution.result.exitCode) !== 0
                "
                class="text-error"
              >
                {{ t("RightPanel.AIExitCode", { code: execution.result.exitCode }) }}
              </span>
            </div>
            <div
              v-if="execution.result.summary"
              class="markdown-body text-xs"
              v-html="renderAiMarkdown(String(execution.result.summary))"
            />
            <div v-if="execution.result.done === false" class="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-warning">
              <span v-if="execution.result.attentionReason === 'no_output'">
                {{ t("RightPanel.AINoOutputDuration", { duration: formatAiDuration(execution.result.outputIdleMs) }) }}
              </span>
              <span v-if="execution.result.remainingMs !== undefined">
                {{ t("RightPanel.AIExecutionRemaining", { duration: formatAiDuration(execution.result.remainingMs) }) }}
              </span>
            </div>
            <UCollapsible v-if="execution.result.output" :default-open="needsAttention && !execution.result.summary">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="group -ml-1 px-1 text-muted"
                trailing-icon="i-lucide-chevron-right"
                :ui="{ trailingIcon: 'size-3 group-data-[state=open]:rotate-90 transition-transform' }"
                :label="t('RightPanel.AIRawOutput')"
              />
              <template #content>
                <pre class="command-output raw-output" tabindex="0"><code>{{ execution.result.output }}</code></pre>
              </template>
            </UCollapsible>
            <p v-if="!execution.result.summary && !execution.result.output" class="text-[11px] text-muted">
              {{ statusLabel() }}
            </p>
          </div>

          <UCollapsible v-if="hasExecutionDetails(execution)" class="border-t border-default">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              block
              class="group justify-start px-2.5 py-1.5 text-muted"
              trailing-icon="i-lucide-chevron-right"
              :ui="{ trailingIcon: 'ml-auto size-3 group-data-[state=open]:rotate-90 transition-transform' }"
              :label="t('RightPanel.AIExecutionDetails')"
            />
            <template #content>
              <div class="space-y-2 px-2.5 pb-2.5">
                <div
                  v-if="execution.command?.rationale && !terminalApprovalPending(execution.command, decisions)"
                  class="markdown-body text-xs text-muted"
                  v-html="renderAiMarkdown(String(execution.command.rationale))"
                />
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
                  <span v-if="execution.command?.execution">{{ executionLabel(execution.command.execution) }}</span>
                  <span v-if="execution.command?.timeoutSeconds !== undefined">
                    {{ t("RightPanel.AITimeout", { count: execution.command.timeoutSeconds }) }}
                  </span>
                  <span v-if="Number(execution.command?.decisionDurationMs ?? execution.result?.modelDurationMs) > 0">
                    {{ t("RightPanel.AIModelDuration") }}
                    {{ formatAiDuration(execution.command?.decisionDurationMs ?? execution.result?.modelDurationMs) }}
                  </span>
                  <span v-if="execution.command?.state === 'auto_approved'">{{ t("RightPanel.AIAutoApproved") }}</span>
                  <span v-if="execution.result?.execution">
                    {{ t("RightPanel.AIActualExecution") }} · {{ executionLabel(execution.result.execution) }}
                  </span>
                  <span v-if="execution.result?.exitCode !== undefined && execution.result.exitCode !== null">
                    {{ t("RightPanel.AIExitCode", { code: execution.result.exitCode }) }}
                  </span>
                </div>
                <AiToolCallItem v-for="operation in execution.operations" :key="operation.key" :item="operation" />
              </div>
            </template>
          </UCollapsible>
        </section>

        <div v-if="step.acl" class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
          {{ t("RightPanel.AICommandAcl") }}: {{ aclLabel(step.acl) }}
          {{ step.acl.decision?.name || step.acl.name || "" }}
        </div>
      </div>
    </template>
  </UCollapsible>
</template>

<style scoped>
.run-step {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.625rem;
}

.run-step-header {
  min-height: 2.375rem;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0;
}

.run-step-body {
  display: grid;
  min-width: 0;
  gap: 0.625rem;
  padding: 0.25rem 0.625rem 0.625rem;
}

.execution-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.5rem;
  background: var(--app-card-bg-soft);
}

.command-output {
  max-height: 18rem;
  overflow: auto;
  margin: 0;
  padding: 0.625rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1.65;
}

.raw-output {
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg);
  white-space: pre;
  overflow-wrap: normal;
}

.markdown-body {
  overflow-wrap: anywhere;
  line-height: 1.6;
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

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}
</style>
