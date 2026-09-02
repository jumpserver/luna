<script setup lang="ts">
import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiTimelineAction, TerminalViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { terminalAiAclKey } from "#koko/composables/terminal/terminalAiPresentation";
import { isKokoTerminalWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import AiRunPlan from "../../AiRunPlan.vue";
import AiRunStep from "../../AiRunStep.vue";

const props = defineProps<{
  item: TerminalViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();
const terminalSession = computed(() => (isKokoTerminalWorkspaceAiSession(props.session) ? props.session : null));

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
</script>

<template>
  <AiRunPlan v-if="item.kind === 'plan'" :plan="item" />

  <AiRunStep
    v-else-if="item.kind === 'terminal-step' && terminalSession"
    :step="item.step"
    :decisions="terminalSession.decisions"
    :execution-overrides="terminalSession.executionOverrides"
    :execution-mode="terminalSession.executionMode"
    :background-exec="terminalSession.backgroundExec"
    @decide="decide"
    @set-execution-override="setExecutionOverride"
  />

  <div
    v-else-if="item.kind === 'alert'"
    class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning"
  >
    <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
    {{ t("RightPanel.AICommandAcl") }}:
    {{ aclLabel(item) }}
    {{ item.data.decision?.name || item.data.name || "" }}
  </div>
</template>
