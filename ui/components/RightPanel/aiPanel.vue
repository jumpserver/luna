<script setup lang="ts">
import {
  createKokoCompactFileAiOwnerId,
  getActiveKokoFileAiTargetId,
  KOKO_GLOBAL_FILE_AI_OWNER_ID
} from "#koko/composables/sftp/useFileAiSessions";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import AiPanelFooter from "./ai/AiPanelFooter.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import AiTimeline from "./ai/AiTimeline.vue";
import { resolveAiPanelTarget } from "./ai/target";
import { useAiPanelController } from "./ai/useAiPanelController";

const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeWorkspaceMode } = useWorkspaceMode();
const { source: aiSource } = useAiPanel();
const { t } = useI18n();
const activeSurface = computed(() => {
  if (activeWorkspaceMode.value === "files") return null;
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});
const activeSurfaceIsFileManager = computed(() => {
  const surface = activeSurface.value;
  if (!surface) return false;
  const payloadMethod = (surface.payload?.connectMethod as { value?: string } | undefined)?.value;
  return findDeclaredCapability(surface.protocol, payloadMethod || surface.connectMethod)?.surface === "file-manager";
});
const ownerFileTargetId = computed(() => getActiveKokoFileAiTargetId(activePaneId.value) || "");
const globalFileTargetId = computed(() => getActiveKokoFileAiTargetId(KOKO_GLOBAL_FILE_AI_OWNER_ID) || "");
const compactFileOwnerId = computed(() => createKokoCompactFileAiOwnerId(activeSurface.value?.id || ""));
const compactFileTargetId = computed(() => getActiveKokoFileAiTargetId(compactFileOwnerId.value) || "");
const preferCompactFileAi = computed(
  () => aiSource.value === "sftp" && activeSurface.value?.protocol?.toLowerCase() === "ssh"
);
const aiTargetId = computed(() =>
  resolveAiPanelTarget({
    workspaceMode: activeWorkspaceMode.value,
    paneId: activePaneId.value,
    ownerFileTargetId: ownerFileTargetId.value,
    ownerFileTargetAllowed: activeSurfaceIsFileManager.value,
    globalFileTargetId: globalFileTargetId.value,
    compactFileTargetId: compactFileTargetId.value,
    preferCompactFileAi: preferCompactFileAi.value
  })
);
const fileAiRequested = computed(
  () =>
    activeWorkspaceMode.value === "files" ||
    Boolean(activeSurfaceIsFileManager.value && ownerFileTargetId.value) ||
    preferCompactFileAi.value
);

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
  if (!fileAiRequested.value || presentation.value) return unavailableState.value;
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
