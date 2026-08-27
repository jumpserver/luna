<script setup lang="ts">
import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { PlanItem, ViewStep } from "./types";
import { terminalAiAclKey, terminalAiExecutionKey } from "#koko/composables/terminal/terminalAiPresentation";
import { aiRiskColor, formatAiDuration, renderAiMarkdown } from "./presentation";

const props = defineProps<{
  plan: PlanItem;
  decisions: ReadonlySet<string>;
  expansionOverrides: ReadonlyMap<string, boolean>;
  executionOverrides: ReadonlyMap<string, string>;
  executionMode: string;
  backgroundExec: boolean;
}>();

const emit = defineEmits<{
  decide: [data: TerminalAiEventData, approved: boolean];
  setExecutionOverride: [id: string, value: string];
  setStepExpanded: [key: string, expanded: boolean];
}>();

const { t } = useI18n();

function translatedProtocolValue(key: string | undefined, fallback = "") {
  return key ? t(key) : fallback;
}

function stepStatus(step: ViewStep) {
  if (["completed", "failed", "interrupted", "rejected", "skipped"].includes(step.status)) return step.status;
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

function statusColor(step: ViewStep): "success" | "error" | "warning" | "primary" | "neutral" {
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
  const override = props.expansionOverrides.get(step.key);
  if (override !== undefined) return override;
  return ["primary", "error", "warning"].includes(statusColor(step));
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
  <section class="run-plan">
    <header class="run-plan-header">
      <span class="run-plan-icon">
        <UIcon name="i-lucide-workflow" class="size-4" />
      </span>
      <div class="min-w-0">
        <div class="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
          {{ t("RightPanel.AIExecutionPlan") }}
        </div>
        <div class="markdown-body compact text-xs" v-html="renderAiMarkdown(plan.summary)" />
      </div>
    </header>

    <div class="run-timeline">
      <article v-for="step in plan.steps" :key="step.key" class="run-step">
        <button
          type="button"
          class="run-step-trigger"
          @click="emit('setStepExpanded', step.key, !isStepExpanded(step))"
        >
          <span class="run-step-marker" :class="`run-step-marker-${statusColor(step)}`">
            <UIcon :name="statusIcon(step)" :class="statusColor(step) === 'primary' ? 'animate-spin' : ''" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium text-highlighted">{{ step.title }}</span>
            <span class="block text-[10px] text-muted">{{ t("RightPanel.AIStep", { count: step.index }) }}</span>
          </span>
          <UBadge :color="statusColor(step)" variant="subtle" size="xs">
            {{ statusLabel(step) }}
          </UBadge>
          <UIcon
            :name="isStepExpanded(step) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-3.5 text-muted"
          />
        </button>

        <div v-if="isStepExpanded(step)" class="run-step-body">
          <div
            v-if="step.objective"
            class="markdown-body text-xs text-muted"
            v-html="renderAiMarkdown(step.objective)"
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
                  <UBadge :color="aiRiskColor(Number(execution.command.riskLevel))" variant="subtle" size="xs">
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
              <p
                v-if="execution.command.riskReason"
                class="flex items-start gap-1.5 px-2 py-2 text-[11px] text-warning"
              >
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
                {{ execution.command.riskReason }}
              </p>

              <div
                v-if="execution.command.partType === 'data-approval' && !decisions.has(String(execution.command.id))"
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
                  <UBadge v-if="execution.result.durationMs !== undefined" color="neutral" variant="subtle" size="xs">
                    {{ t("RightPanel.AIExecutionDuration") }}
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
              <pre v-if="execution.result.output" class="command-output"><code>{{
                execution.result.output
              }}</code></pre>
              <p v-if="!execution.result.summary && !execution.result.output" class="p-2 text-[11px] text-muted">
                {{ statusLabel(step) }}
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
    </div>
  </section>
</template>

<style scoped>
.run-plan {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--app-card-bg) 82%, transparent);
}

.run-plan-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem;
  border-bottom: 1px solid var(--app-border);
}

.run-plan-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  place-items: center;
  border-radius: 0.5rem;
  color: var(--ui-color-primary-500);
  background: color-mix(in srgb, var(--ui-color-primary-500) 12%, transparent);
}

.run-timeline {
  padding: 0.5rem;
}

.run-step {
  position: relative;
}

.run-step + .run-step::before {
  position: absolute;
  top: -0.5rem;
  left: 0.6875rem;
  width: 1px;
  height: 0.5rem;
  content: "";
  background: var(--app-border);
}

.run-step + .run-step {
  margin-top: 0.5rem;
}

.run-step-trigger {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 0.5rem;
  text-align: left;
  background: var(--app-main-bg);
}

.run-step-trigger:hover {
  background: var(--app-hover-soft);
}

.run-step-marker {
  display: grid;
  width: 1.375rem;
  height: 1.375rem;
  flex: none;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  color: var(--app-muted);
  background: var(--app-main-bg);
}

.run-step-marker :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
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
  margin-left: 0.6875rem;
  padding: 0.5rem 0 0.25rem 1.1875rem;
  border-left: 1px solid var(--app-border);
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

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}
</style>
