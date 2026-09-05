<script setup lang="ts">
import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ViewStep } from "./types";
import { terminalAiAclKey, terminalAiExecutionKey } from "#koko/composables/terminal/terminalAiPresentation";
import { aiRiskColor, formatAiDuration, renderAiMarkdown } from "./presentation";

const props = defineProps<{
  step: ViewStep;
  decisions: ReadonlySet<string>;
  executionOverrides: ReadonlyMap<string, string>;
  executionMode: string;
  backgroundExec: boolean;
}>();

const emit = defineEmits<{
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

function stepStatus() {
  if (["completed", "failed", "interrupted", "rejected", "skipped"].includes(props.step.status)) {
    return props.step.status;
  }
  const execution = props.step.executions.at(-1);
  if (execution?.command && !execution.result) return String(execution.command.state || props.step.status);
  if (["running", "reviewing"].includes(String(execution?.result?.outcome))) {
    return String(execution?.result?.outcome);
  }
  return props.step.status || String(execution?.result?.outcome || "pending");
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
  if (["expired", "timeout", "unknown", "awaiting_approval", "awaiting_risk_approval"].includes(status))
    return "warning";
  if (["approved", "auto_approved", "executing", "in_progress", "reviewing", "running"].includes(status)) {
    return "primary";
  }
  return "neutral";
}

function statusIcon() {
  const color = statusColor();
  if (color === "success") return "i-lucide-circle-check";
  if (color === "error" || color === "warning") return "i-lucide-circle-alert";
  if (color === "primary") return "i-lucide-loader-circle";
  return "i-lucide-circle-dot";
}

function statusSpinning() {
  return ["executing", "in_progress", "reviewing", "running"].includes(stepStatus());
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
  <article class="run-step">
    <header class="run-step-header" :class="hasDetails ? 'border-b border-default' : ''">
      <span class="run-step-marker" :class="`run-step-marker-${statusColor()}`">
        <UIcon :name="statusIcon()" :class="statusSpinning() ? 'animate-spin' : ''" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[10px] text-muted">{{ t("RightPanel.AIStep", { count: step.index }) }}</span>
        <span class="block text-xs font-medium text-highlighted">{{ step.title }}</span>
      </span>
      <UBadge :color="statusColor()" variant="subtle" size="xs">
        {{ statusLabel() }}
      </UBadge>
    </header>

    <div v-if="hasDetails" class="run-step-body">
      <div v-if="step.objective" class="markdown-body text-xs text-muted" v-html="renderAiMarkdown(step.objective)" />

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
              <UBadge
                v-if="Number(execution.command.riskLevel) > 0"
                :color="aiRiskColor(Number(execution.command.riskLevel))"
                variant="subtle"
                size="xs"
              >
                {{ terminalRiskLabel(execution.command.riskLevel) }}
              </UBadge>
              <UBadge v-if="execution.command.execution" color="neutral" variant="subtle" size="xs">
                {{ executionLabel(execution.command.execution) }}
              </UBadge>
              <UBadge v-if="execution.command.timeoutSeconds !== undefined" color="neutral" variant="subtle" size="xs">
                {{ t("RightPanel.AITimeout", { count: execution.command.timeoutSeconds }) }}
              </UBadge>
              <UBadge
                v-if="execution.command.decisionDurationMs !== undefined"
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ t("RightPanel.AIModelDuration") }}
                {{ formatAiDuration(execution.command.decisionDurationMs) }}
              </UBadge>
              <UBadge v-if="execution.command.state === 'auto_approved'" color="success" variant="subtle" size="xs">
                {{ t("RightPanel.AIAutoApproved") }}
              </UBadge>
            </div>
          </div>
          <pre class="command-output"><code>{{ execution.command.command }}</code></pre>
          <div
            v-if="execution.command.rationale"
            class="markdown-body px-2 pt-2 text-xs text-muted"
            v-html="renderAiMarkdown(String(execution.command.rationale))"
          />
          <p v-if="execution.command.riskReason" class="flex items-start gap-1.5 px-2 py-2 text-[11px] text-warning">
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
            {{ execution.command.riskReason }}
          </p>

          <p v-if="execution.command.state === 'expired'" class="px-2 py-2 text-xs text-warning">
            {{ t("RightPanel.AIApprovalExpired") }}
          </p>
          <div
            v-if="
              execution.command.partType === 'data-approval' &&
              !execution.command.resolved &&
              !decisions.has(String(execution.command.id))
            "
            class="space-y-2 border-t border-warning/30 bg-warning/5 p-2"
          >
            <div class="flex items-center gap-1.5 text-[10px] font-medium text-warning">
              <UIcon name="i-lucide-shield-alert" class="size-3.5" />
              {{ t("RightPanel.AIStatusAwaitingApproval") }}
            </div>
            <div v-if="executionMode === 'auto'" class="flex gap-1.5">
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
        </div>

        <div v-if="execution.result" class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center justify-between border-b border-default px-2 py-1.5 text-[11px] text-muted">
            <span>{{ t("RightPanel.AIExecutionResult") }}</span>
            <div class="flex flex-wrap justify-end gap-1">
              <UBadge v-if="execution.result.execution" color="primary" variant="subtle" size="xs">
                {{ t("RightPanel.AIActualExecution") }} · {{ executionLabel(execution.result.execution) }}
              </UBadge>
              <UBadge
                v-if="
                  execution.result.modelDurationMs !== undefined && execution.command?.decisionDurationMs === undefined
                "
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ t("RightPanel.AIModelDuration") }}
                {{ formatAiDuration(execution.result.modelDurationMs) }}
              </UBadge>
              <UBadge v-if="execution.result.durationMs !== undefined" color="neutral" variant="subtle" size="xs">
                {{ t("RightPanel.AIToolDuration") }}
                {{ formatAiDuration(execution.result.durationMs) }}
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
            v-html="renderAiMarkdown(String(execution.result.summary))"
          />
          <pre v-if="execution.result.output" class="command-output"><code>{{ execution.result.output }}</code></pre>
          <p v-if="!execution.result.summary && !execution.result.output" class="p-2 text-[11px] text-muted">
            {{ statusLabel() }}
          </p>
        </div>
      </div>

      <div v-if="step.acl" class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
        {{ t("RightPanel.AICommandAcl") }}:
        {{ aclLabel(step.acl) }}
        {{ step.acl.decision?.name || step.acl.name || "" }}
      </div>
    </div>
  </article>
</template>

<style scoped>
.run-step {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--app-card-bg) 82%, transparent);
}

.run-step-header {
  display: flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
}

.run-step-marker {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  color: var(--app-muted);
  background: var(--app-main-bg);
}

.run-step-marker :deep(svg) {
  width: 0.8125rem;
  height: 0.8125rem;
}

.run-step-marker-success {
  color: var(--ui-color-success-500);
}

.run-step-marker-error {
  color: var(--ui-color-error-500);
}

.run-step-marker-warning {
  color: var(--ui-color-warning-500);
}

.run-step-marker-primary {
  color: var(--ui-color-primary-500);
}

.run-step-body {
  position: relative;
  display: grid;
  gap: 0.5rem;
  padding: 0.625rem 0.625rem 0.625rem 2.625rem;
}

.run-step-body::before {
  position: absolute;
  top: 0;
  bottom: 0.625rem;
  left: 1.35rem;
  width: 1px;
  content: "";
  background: var(--app-border);
}

.command-output {
  max-height: 18rem;
  overflow: auto;
  padding: 0.5rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
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
