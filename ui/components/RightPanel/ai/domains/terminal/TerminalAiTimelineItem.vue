<script setup lang="ts">
import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiTimelineAction, TerminalViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { terminalAiAclKey } from "#koko/composables/terminal/terminalAiPresentation";
import AiRunPlan from "../../AiRunPlan.vue";

defineProps<{
  item: TerminalViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();

function aclLabel(item: Extract<TerminalViewItem, { kind: "alert" }>) {
  const value = item.data.state || item.data.action;
  const key = terminalAiAclKey(value);
  return key ? t(key) : String(value || "");
}

function decide(data: TerminalAiEventData, approved: boolean) {
  emit("action", { domain: "terminal", type: "decide", data, approved });
}

function setExecutionOverride(id: string, value: string) {
  emit("action", { domain: "terminal", type: "set-execution-override", id, value });
}

function setStepExpanded(key: string, expanded: boolean) {
  emit("action", { domain: "terminal", type: "set-step-expanded", key, expanded });
}
</script>

<template>
  <AiRunPlan
    v-if="item.kind === 'plan'"
    :plan="item"
    :decisions="session.decisions"
    :expansion-overrides="session.expansionOverrides"
    :execution-overrides="session.executionOverrides"
    :execution-mode="session.executionMode"
    :background-exec="session.backgroundExec"
    @decide="decide"
    @set-execution-override="setExecutionOverride"
    @set-step-expanded="setStepExpanded"
  />

  <div v-else class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">
    <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
    {{ t("RightPanel.AICommandAcl") }}:
    {{ aclLabel(item) }}
    {{ item.data.decision?.name || item.data.name || "" }}
  </div>
</template>
