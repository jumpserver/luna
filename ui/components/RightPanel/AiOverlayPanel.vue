<script setup lang="ts">
import WorkspaceAiPanel from "./aiPanel.vue";
import WorkspaceAssistantPanel from "./WorkspaceAssistantPanel.vue";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { activeWorkspaceMode } = useWorkspaceMode();
const { activePaneId, activeTab } = useWorkspaceTabs();
const { activeTab: rightPanelTab, open: rightPanelOpen } = useRightPanel();
const { mode, setSource, setWorkspaceAssistantActive, workspaceAssistantActive } = useAiPanel();
const showWorkspaceAssistant = computed(
  () => mode.value === "workspace-assistant" && (activeTab.value || !activePaneId.value)
);
const activeSurface = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});

const resourceAssistantAvailable = computed(
  () =>
    activeWorkspaceMode.value === "files" ||
    (activeWorkspaceMode.value === "assets" &&
      ((activeSurface.value?.status === "connected" && Boolean(activeSurface.value?.assetId)) ||
        activeSurface.value?.protocol === "script-editor" ||
        (!activeTab.value && Boolean(activePaneId.value))))
);

watchEffect(() => {
  setSource(
    resolveAiPanelSource({
      workspaceMode: activeWorkspaceMode.value,
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
      <div class="min-h-0 flex-1 overflow-hidden">
        <KeepAlive>
          <component :is="showWorkspaceAssistant ? WorkspaceAssistantPanel : WorkspaceAiPanel">
            <template #actions>
              <UButton
                v-if="!workspaceAssistantActive"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-sparkles"
                :label="t('RightPanel.LunaAiAutomatic')"
                @click="setWorkspaceAssistantActive(true)"
              />
              <UDropdownMenu
                v-else-if="resourceAssistantAvailable"
                :items="[
                  {
                    label: t('RightPanel.LunaAiResourceHistory'),
                    icon: 'i-lucide-history',
                    onSelect: () => setWorkspaceAssistantActive(false)
                  }
                ]"
                portal="#workspace-ai-overlay"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-ellipsis"
                  :aria-label="t('RightPanel.LunaAiResourceHistory')"
                />
              </UDropdownMenu>
              <UButton
                icon="i-lucide-x"
                :aria-label="t('RightPanel.AIClose')"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="emit('close')"
              />
            </template>
          </component>
        </KeepAlive>
      </div>
    </aside>
  </div>
</template>
