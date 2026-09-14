<script setup lang="ts">
import { getActiveKokoFileAiTargetId, KOKO_GLOBAL_FILE_AI_OWNER_ID } from "#koko/composables/sftp/useFileAiSessions";
import { findDeclaredCapability } from "~/shared/connectors/capabilities";
import AiPanelFooter from "./ai/AiPanelFooter.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import AiTimeline from "./ai/AiTimeline.vue";
import { resolveAiPanelTarget } from "./ai/target";
import { useAiPanelController } from "./ai/useAiPanelController";

const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeWorkspaceMode } = useWorkspaceMode();
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
const aiTargetId = computed(() =>
  resolveAiPanelTarget({
    workspaceMode: activeWorkspaceMode.value,
    paneId: activePaneId.value,
    ownerFileTargetId: ownerFileTargetId.value,
    ownerFileTargetAllowed: activeSurfaceIsFileManager.value,
    globalFileTargetId: globalFileTargetId.value
  })
);
const fileAiRequested = computed(
  () => activeWorkspaceMode.value === "files" || Boolean(activeSurfaceIsFileManager.value && ownerFileTargetId.value)
);

const {
  session,
  viewItems,
  presentation,
  canClearLocalHistory,
  canNewSession,
  startingNewSession,
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
  newSession,
  clearLocalHistory,
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
const timelineEmptyState = computed(() =>
  presentation.value?.available ? presentation.value.empty : displayedUnavailableState.value
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AiPresenceHeader
      :assistant-name="presentation?.assistantName || t('RightPanel.LunaAiName')"
      :description="presentation?.headerDescription || ''"
      :status-label="presentation ? presenceStatusLabel : ''"
      :status-tone="presentation?.available ? presenceStatusTone : 'warning'"
      :busy="Boolean(presentation?.busy || presentation?.running)"
      :tool-names="presentation?.toolNames || []"
      :run-progress="runProgress"
      :risk-label="riskLabel"
      :risk-color="riskColor"
    >
      <template #actions>
        <UTooltip v-if="canClearLocalHistory" :text="t('RightPanel.AIClearLocalHistory')">
          <UButton
            icon="i-lucide-eraser"
            :aria-label="t('RightPanel.AIClearLocalHistory')"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="clearLocalHistory"
          />
        </UTooltip>
        <UTooltip
          v-if="session"
          :text="
            presentation?.available ? t('RightPanel.AINewSessionDescription') : displayedUnavailableState.description
          "
        >
          <span class="inline-flex">
            <UButton
              icon="i-lucide-plus"
              :aria-label="t('RightPanel.AINewSession')"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canNewSession"
              :loading="startingNewSession"
              @click="newSession"
            />
          </span>
        </UTooltip>
        <slot name="actions" />
      </template>
    </AiPresenceHeader>

    <div v-if="!session || !presentation" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        :icon="displayedUnavailableState.icon"
        size="sm"
        variant="naked"
        :title="displayedUnavailableState.title"
        :description="displayedUnavailableState.description"
      />
    </div>

    <template v-else>
      <AiTimeline
        :items="viewItems"
        :session="session"
        :assistant-name="presentation.assistantName"
        :empty="viewItems.length === 0"
        :empty-state="timelineEmptyState"
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
