<script setup lang="ts">
import AiPanelFooter from "./ai/AiPanelFooter.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import AiTimeline from "./ai/AiTimeline.vue";
import { useAiPanelController } from "./ai/useAiPanelController";

const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeWorkspaceMode } = useWorkspaceMode();
const { t } = useI18n();
const aiTargetId = computed(() => (activeWorkspaceMode.value === "files" ? "" : activePaneId.value));
const activeSurface = computed(() => {
  if (activeWorkspaceMode.value === "files") return null;
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});

const {
  session,
  messages,
  viewItems,
  presentation,
  unavailableState,
  draft,
  runProgress,
  riskLabel,
  riskColor,
  presenceStatusTone,
  presenceStatusLabel,
  activityLabel,
  timelineRevision,
  submit,
  interrupt,
  clearError,
  updateApprovalThreshold,
  updateExecutionMode,
  handleTimelineAction
} = useAiPanelController({ paneId: aiTargetId, surface: activeSurface });
const displayedUnavailableState = computed(() => {
  if (activeWorkspaceMode.value !== "files" || presentation.value) return unavailableState.value;
  return {
    icon: "i-lucide-folder-lock",
    title: t("RightPanel.FileAIUnavailableTitle"),
    description: t("RightPanel.FileAIUnavailableDescription")
  };
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!presentation?.available" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        :icon="displayedUnavailableState.icon"
        size="sm"
        variant="naked"
        :title="displayedUnavailableState.title"
        :description="displayedUnavailableState.description"
      />
    </div>

    <template v-else-if="session && presentation">
      <AiPresenceHeader
        :assistant-name="presentation.assistantName"
        :description="presentation.headerDescription"
        :status-label="presenceStatusLabel"
        :status-tone="presenceStatusTone"
        :busy="presentation.busy"
        :context-items="presentation.contextItems"
        :run-progress="runProgress"
        :risk-label="riskLabel"
        :risk-color="riskColor"
      />

      <AiTimeline
        :items="viewItems"
        :session="session"
        :assistant-name="presentation.assistantName"
        :empty="messages.length === 0"
        :empty-state="presentation.empty"
        :activity-label="activityLabel"
        :revision="timelineRevision"
        @action="handleTimelineAction"
      />

      <AiPanelFooter
        v-model="draft"
        :presentation="presentation"
        @submit="submit"
        @interrupt="interrupt"
        @clear-error="clearError"
        @update-approval-threshold="updateApprovalThreshold"
        @update-execution-mode="updateExecutionMode"
      />
    </template>
  </div>
</template>
