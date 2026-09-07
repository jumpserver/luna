<script setup lang="ts">
import type { AgentToolItem, AiTimelineAction } from "../ai/types";
import type { WorkspaceTerminalTask } from "~/composables/useWorkspaceTerminalTasks";
import { buildAiPanelViewItems } from "../ai/buildViewItems";
import { resolveAiTimelineRenderer } from "../ai/domains/registry";
import AiActivityItem from "../ai/domains/shared/AiActivityItem.vue";
import AiToolCallItem from "../ai/domains/shared/AiToolCallItem.vue";
import { aiTimelineHasPendingOperation } from "../ai/presentation";

const props = defineProps<{ task: WorkspaceTerminalTask; operations?: AgentToolItem[] }>();
defineEmits<{ action: [action: AiTimelineAction] }>();
const { t } = useI18n();
const manuallyExpanded = ref<boolean>();
const open = computed({
  get: () => manuallyExpanded.value ?? props.task.status !== "completed",
  set: (value: boolean) => {
    manuallyExpanded.value = value;
  }
});
const statusLabel = computed(() =>
  t(
    {
      running: "RightPanel.AIStatusRunning",
      waiting_approval: "RightPanel.AIStatusAwaitingApproval",
      waiting_input: "RightPanel.AIStatusWaitingInput",
      completed: "RightPanel.AIStatusCompleted",
      failed: "RightPanel.AIStatusFailed",
      interrupted: "RightPanel.AIStatusInterrupted"
    }[props.task.status]
  )
);
const items = computed(() =>
  buildAiPanelViewItems({
    messages: props.task.messages.filter((message) => message.role !== "user"),
    metadataApproval: props.task.active ? props.task.session.metadataApproval : null,
    terminalMetadataApproval: true,
    executionPlanLabel: t("RightPanel.AIExecutionPlan"),
    stepLabel: (count) => t("RightPanel.AIStep", { count })
  })
);
watch(
  () => props.task.status,
  (status) => {
    if (["waiting_approval", "waiting_input", "failed", "interrupted"].includes(status)) manuallyExpanded.value = true;
  }
);
</script>

<template>
  <UCollapsible v-model:open="open" class="min-w-0 rounded-lg border border-default">
    <UButton color="neutral" variant="ghost" block class="min-w-0 justify-start gap-2 px-2.5 py-2">
      <UIcon name="i-lucide-terminal" class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 text-left">
        <span class="block truncate text-xs font-medium">{{ task.target.asset_name }} · {{ task.target.account }}</span>
        <span class="block truncate text-[10px] font-normal text-muted" :title="task.prompt">{{ task.prompt }}</span>
      </span>
      <span class="shrink-0 text-[10px] text-muted">{{ statusLabel }}</span>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 transition-transform"
        :class="{ 'rotate-90': open }"
      />
    </UButton>
    <template #content>
      <div class="min-w-0 space-y-3 border-t border-default p-2.5">
        <UCollapsible v-if="operations?.length" class="min-w-0">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            trailing-icon="i-lucide-chevron-down"
            :label="t('RightPanel.AIExecutionDetails')"
          />
          <template #content>
            <AiToolCallItem
              v-for="operation in operations"
              :key="operation.key"
              :item="operation"
              :label="t(`RightPanel.LunaAiTool_${operation.data.toolName}`)"
            />
          </template>
        </UCollapsible>
        <component
          :is="resolveAiTimelineRenderer(item.domain)"
          v-for="item in items"
          :key="item.key"
          :item="item"
          :session="task.session"
          :assistant-name="t('RightPanel.LunaAiName')"
          v-bind="item.domain === 'terminal' ? { readOnly: !task.active } : {}"
          @action="$emit('action', $event)"
        />
        <div
          v-if="task.active && task.status !== 'running' && !aiTimelineHasPendingOperation(items)"
          role="status"
          class="flex items-center gap-2 py-1 text-xs text-warning"
        >
          <UIcon
            :name="task.status === 'waiting_approval' ? 'i-lucide-shield-alert' : 'i-lucide-keyboard'"
            class="size-3.5 shrink-0"
          />
          {{ statusLabel }}
        </div>
        <AiActivityItem
          v-else-if="task.active && !aiTimelineHasPendingOperation(items)"
          :assistant-name="t('RightPanel.LunaAiName')"
          :label="statusLabel"
        />
        <UAlert
          v-if="task.error"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="statusLabel"
          :description="task.error === 'terminal_changed' ? t('RightPanel.LunaAiTargetChanged') : task.error"
        />
      </div>
    </template>
  </UCollapsible>
</template>
