<script setup lang="ts">
import WorkspaceAiPanel from "./aiPanel.vue";
import PlatformAiPanel from "./PlatformAiPanel.vue";
import WorkspaceAssistantPanel from "./WorkspaceAssistantPanel.vue";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { activeWorkspaceMode } = useWorkspaceMode();
const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeTab: rightPanelTab, open: rightPanelOpen } = useRightPanel();
const { mode, setSource, setWorkspaceAssistantActive, workspaceAssistantActive, workspaceFocused } = useAiPanel();
const panelTitle = computed(() =>
  workspaceAssistantActive.value ? t("RightPanel.WorkspaceAssistantName") : t("RightPanel.AI")
);
const activeSurface = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});

watchEffect(() => {
  setSource(
    resolveAiPanelSource({
      workspaceMode: activeWorkspaceMode.value,
      surfaceStatus: activeSurface.value?.status,
      surfaceAssetId: activeSurface.value?.assetId,
      surfaceProtocol: activeSurface.value?.protocol,
      standaloneWorkspace: !activeTab.value && Boolean(activePaneId.value),
      workspaceFocused: workspaceFocused.value,
      rightPanelOpen: rightPanelOpen.value,
      rightPanelTab: rightPanelTab.value
    })
  );
});
</script>

<template>
  <div id="workspace-ai-overlay" data-ai-context="preserve" class="pointer-events-none absolute inset-0 z-50">
    <button
      v-if="isNarrowScreen"
      type="button"
      class="pointer-events-auto absolute inset-0 bg-black/35 backdrop-blur-[1px]"
      :aria-label="t('RightPanel.AIClose')"
      @click="emit('close')"
    />

    <aside
      class="pointer-events-auto absolute inset-y-0 right-0 flex w-[min(380px,calc(100vw-3rem))] min-h-0 flex-col border-l border-[var(--app-border)] bg-[var(--app-panel-bg)] text-[var(--app-fg)] shadow-2xl"
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-2">
        <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ panelTitle }}</span>
        <UTooltip
          :text="
            workspaceAssistantActive ? t('RightPanel.WorkspaceAssistantBack') : t('RightPanel.WorkspaceAssistantOpen')
          "
        >
          <UButton
            :icon="workspaceAssistantActive ? 'i-lucide-arrow-left' : 'i-lucide-monitor-cog'"
            :aria-label="
              workspaceAssistantActive ? t('RightPanel.WorkspaceAssistantBack') : t('RightPanel.WorkspaceAssistantOpen')
            "
            :color="workspaceAssistantActive ? 'primary' : 'neutral'"
            variant="ghost"
            size="xs"
            @click="setWorkspaceAssistantActive(!workspaceAssistantActive)"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-x"
          :aria-label="t('RightPanel.AIClose')"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="emit('close')"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <KeepAlive>
          <WorkspaceAssistantPanel v-if="mode === 'workspace-assistant'" />
          <PlatformAiPanel v-else-if="mode === 'platform'" />
          <WorkspaceAiPanel v-else />
        </KeepAlive>
      </div>
    </aside>
  </div>
</template>
