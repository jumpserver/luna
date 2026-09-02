<script setup lang="ts">
import type { AiTimelineAction, SqlProposalItem, SqlViewItem } from "../../types";
import type { ChenSqlAiTiming, ChenSqlMetadataApprovalDecision } from "~/chen/composables/useChenSqlAiSessions";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { isChenSqlWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import SqlMetadataApprovalCard from "../../../SqlMetadataApprovalCard.vue";
import SqlSchemaResultCard from "../../../SqlSchemaResultCard.vue";
import { aiRiskColor, formatAiDuration, renderAiMarkdown } from "../../presentation";

const props = defineProps<{
  item: SqlViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();

function proposalDecision(item: SqlProposalItem) {
  if (!isChenSqlWorkspaceAiSession(props.session)) return "";
  return props.session.proposalDecisions.get(item.toolCallId || item.key) || "";
}

function isThoughtExpanded(key: string) {
  if (!isChenSqlWorkspaceAiSession(props.session)) return false;
  return props.session.expansionOverrides.get(key) ?? false;
}

function setThoughtExpanded(key: string, expanded: boolean) {
  emit("action", { domain: "sql", type: "set-thought-expanded", key, expanded });
}

function resolveMetadataApproval(decision: ChenSqlMetadataApprovalDecision) {
  emit("action", { domain: "sql", type: "resolve-metadata-approval", decision });
}

function analysisErrors(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function analysisItems(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function timingTotal(data: ChenSqlAiTiming) {
  return Number(data.clientDurationMs) || Number(data.durationMs) || 0;
}
</script>

<template>
  <SqlMetadataApprovalCard
    v-if="item.kind === 'metadata-approval'"
    :approval="item.approval"
    :terminal="item.terminal"
    @resolve="resolveMetadataApproval"
  />

  <SqlSchemaResultCard v-else-if="item.kind === 'schema-result'" :data="item.data" />

  <UCollapsible
    v-else-if="item.kind === 'sql-thought'"
    :open="isThoughtExpanded(item.key)"
    class="overflow-hidden rounded-xl border border-default bg-elevated/40"
    @update:open="setThoughtExpanded(item.key, $event)"
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
        v-if="!isThoughtExpanded(item.key)"
        class="min-w-0 flex-1 truncate text-left text-[10px] font-normal text-muted"
        :title="item.summaries.at(-1)"
      >
        {{ item.summaries.at(-1) }}
      </span>
      <UIcon
        name="i-lucide-chevron-right"
        class="ml-auto size-3.5 shrink-0 text-muted transition-transform duration-150"
        :class="isThoughtExpanded(item.key) ? 'rotate-90' : ''"
      />
    </UButton>

    <template #content>
      <div class="space-y-1.5 border-t border-default px-2.5 py-2 text-[11px] leading-5 text-muted">
        <p v-for="summary in item.summaries" :key="summary" class="whitespace-pre-wrap [overflow-wrap:anywhere]">
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
        :color="aiRiskColor(Number(item.data.riskLevel))"
        variant="subtle"
        size="xs"
      >
        {{ t("RightPanel.AIRisk", { level: item.data.riskLevel }) }}
      </UBadge>
    </header>
    <p v-if="item.data.riskReason" class="text-[11px] text-muted">
      {{ item.data.riskReason }}
    </p>
    <div v-if="analysisItems(item.data.tables).length" class="text-[11px]">
      <span class="text-muted">{{ t("RightPanel.SQLAITables") }}:</span>
      {{ analysisItems(item.data.tables).join(", ") }}
    </div>
    <div v-if="analysisItems(item.data.columns).length" class="text-[11px]">
      <span class="text-muted">{{ t("RightPanel.SQLAIColumns") }}:</span>
      {{ analysisItems(item.data.columns).join(", ") }}
    </div>
    <ul v-if="analysisErrors(item.data.errors).length" class="space-y-1 text-[11px] text-error">
      <li v-for="error in analysisErrors(item.data.errors)" :key="error" class="flex items-start gap-1.5">
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
      v-html="renderAiMarkdown(String(item.data.explanation))"
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
        @click="emit('action', { domain: 'sql', type: 'reject-proposal', item })"
      />
      <UButton
        size="xs"
        color="primary"
        icon="i-lucide-check"
        :label="t('RightPanel.SQLAIApply')"
        @click="emit('action', { domain: 'sql', type: 'apply-proposal', item })"
      />
    </div>
  </section>

  <section v-else class="rounded-xl border border-default bg-elevated/40 px-2.5 py-2 text-[11px] text-muted">
    <div class="flex items-center gap-1.5">
      <UIcon name="i-lucide-clock-3" class="size-3.5 text-primary" />
      <span class="font-medium text-highlighted">{{ t("RightPanel.SQLAITiming") }}</span>
      <span class="ml-auto font-mono tabular-nums text-highlighted">
        {{ formatAiDuration(timingTotal(item.data)) }}
      </span>
    </div>
    <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      <span v-if="Number(item.data.modelDurationMs) > 0">
        {{ t("RightPanel.SQLAIModelDuration") }} · {{ formatAiDuration(item.data.modelDurationMs) }}
      </span>
      <span v-if="Number(item.data.toolDurationMs) > 0">
        {{ t("RightPanel.SQLAIToolDuration") }} · {{ formatAiDuration(item.data.toolDurationMs) }}
      </span>
      <span v-if="Number(item.data.queueDurationMs) >= 1">
        {{ t("RightPanel.SQLAIQueueDuration") }} · {{ formatAiDuration(item.data.queueDurationMs) }}
      </span>
    </div>
  </section>
</template>

<style scoped>
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
