<script setup lang="ts">
import type { AiTimelineAction, ScriptViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { isScriptWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { aiRiskColor } from "../../presentation";

const props = defineProps<{
  item: ScriptViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();
const scriptSession = computed(() => (isScriptWorkspaceAiSession(props.session) ? props.session : null));
const proposal = computed(() => scriptSession.value?.proposals.get(props.item.toolCallId) || null);
const proposalError = computed(() => scriptSession.value?.proposalErrors.get(props.item.toolCallId) || "");
const decision = computed(() => scriptSession.value?.proposalDecisions.get(props.item.key) || "");

function applyProposal() {
  if (!proposal.value) return;
  emit("action", { domain: "script", type: "apply-proposal", item: props.item, proposal: proposal.value });
}

function variablePlaceholder(varName: string) {
  return `{{ jms_${varName} }}`;
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-elevated/60">
    <header class="flex items-center gap-2 border-b border-default px-2.5 py-2">
      <UIcon name="i-lucide-file-diff" class="size-4 text-primary" />
      <span class="mr-auto text-xs font-semibold text-highlighted">
        {{ t("RightPanel.ScriptAIProposal") }}
      </span>
      <UBadge v-if="proposal" :color="aiRiskColor(proposal.riskLevel)" variant="subtle" size="xs">
        {{ t("RightPanel.AIRisk", { level: proposal.riskLevel }) }}
      </UBadge>
      <UBadge v-if="decision" color="neutral" variant="subtle" size="xs">
        {{ t(`RightPanel.ScriptAIProposalState.${decision}`) }}
      </UBadge>
    </header>

    <div v-if="proposal" class="space-y-2 border-b border-default p-2.5 text-[11px]">
      <p class="whitespace-pre-wrap text-muted">{{ proposal.summary }}</p>
      <div class="flex flex-wrap gap-1">
        <UBadge color="neutral" variant="subtle" size="xs">{{ proposal.module }}</UBadge>
        <UBadge color="neutral" variant="subtle" size="xs">{{ proposal.name }}</UBadge>
        <UBadge v-if="proposal.variables.length" color="primary" variant="subtle" size="xs">
          {{ t("RightPanel.ScriptAIVariables", { count: proposal.variables.length }) }}
        </UBadge>
      </div>
      <ul v-if="proposal.risks.length" class="space-y-1 text-warning">
        <li v-for="risk in proposal.risks" :key="risk" class="flex items-start gap-1.5">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3 shrink-0" />
          <span class="break-words">{{ risk }}</span>
        </li>
      </ul>
      <div v-if="proposal.variables.length" class="flex flex-wrap gap-1">
        <UBadge
          v-for="variable in proposal.variables"
          :key="variable.varName"
          color="neutral"
          variant="outline"
          size="xs"
        >
          {{ variablePlaceholder(variable.varName) }}
        </UBadge>
      </div>
    </div>

    <div v-if="proposal" class="grid min-h-0 gap-px bg-[var(--app-border)] sm:grid-cols-2">
      <div class="min-w-0 bg-default">
        <div class="border-b border-default bg-error/10 px-2 py-1 text-[10px] font-medium text-error">
          {{ t("RightPanel.ScriptAIBefore") }}
        </div>
        <pre
          class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
        ><code>{{ proposal.base.content || t("RightPanel.ScriptAINewScript") }}</code></pre>
      </div>
      <div class="min-w-0 bg-default">
        <div class="border-b border-default bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
          {{ t("RightPanel.ScriptAIAfter") }}
        </div>
        <pre
          class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
        ><code>{{ proposal.content }}</code></pre>
      </div>
    </div>

    <div v-else class="flex items-start gap-2 p-2.5 text-[11px] text-error">
      <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
      <span>{{ proposalError || t("RightPanel.ScriptAIProposalInvalid") }}</span>
    </div>

    <div v-if="proposal && !decision" class="flex justify-end gap-1.5 border-t border-default p-2">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        :label="t('RightPanel.AIReject')"
        @click="emit('action', { domain: 'script', type: 'reject-proposal', item })"
      />
      <UButton
        size="xs"
        color="primary"
        icon="i-lucide-check"
        :label="t('RightPanel.ScriptAIApply')"
        @click="applyProposal"
      />
    </div>
  </section>
</template>
