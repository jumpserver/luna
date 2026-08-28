<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
const { open: aiPanelOpen, toggleAi } = useAiPanel();
const showRightPanelButton = computed(() => activeWorkspaceMode.value !== "files");
const aiButtonLabel = computed(() => t(aiPanelOpen.value ? "RightPanel.AIClose" : "RightPanel.AIOpen"));

const handleToggleAi = () => {
  toggleAi();
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1 px-2">
      <UTooltip arrow :text="aiButtonLabel">
        <UButton
          data-ai-context="preserve"
          icon="i-lucide-sparkles"
          :aria-label="aiButtonLabel"
          :aria-pressed="aiPanelOpen"
          size="sm"
          color="primary"
          :variant="aiPanelOpen ? 'soft' : 'ghost'"
          :ui="{ leadingIcon: 'size-4' }"
          @click="handleToggleAi"
        />
      </UTooltip>

      <Profile placement="topbar" />

      <UTooltip v-if="showRightPanelButton" arrow :text="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')">
        <UButton
          :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
          :aria-label="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
          :aria-pressed="rightPanelOpen"
          size="sm"
          color="neutral"
          :variant="rightPanelOpen ? 'soft' : 'ghost'"
          :ui="{ leadingIcon: 'size-4' }"
          @click="toggleRightPanel"
        />
      </UTooltip>
    </div>
  </section>
</template>
