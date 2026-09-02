<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { activeWorkspaceMode } = useWorkspaceMode();
const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
const { open: aiPanelOpen, toggleAi } = useAiPanel();
const showRightPanelButton = computed(() => activeWorkspaceMode.value !== "files");
const aiButtonLabel = computed(() => t(aiPanelOpen.value ? "RightPanel.AIClose" : "RightPanel.AIOpen"));
const headerIconButtonClass =
  "grid size-6 shrink-0 place-items-center rounded-lg p-0 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]";
const headerIconButtonActiveClass = "bg-[var(--app-hover-soft)] text-[var(--app-fg)]";

const handleToggleAi = () => {
  toggleAi();
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1.5 px-2">
      <UTooltip arrow :text="aiButtonLabel">
        <UButton
          data-ai-context="preserve"
          icon="i-lucide-sparkles"
          :aria-label="aiButtonLabel"
          :aria-pressed="aiPanelOpen"
          size="sm"
          color="neutral"
          variant="ghost"
          :class="[headerIconButtonClass, aiPanelOpen ? headerIconButtonActiveClass : '']"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          @click="handleToggleAi"
        />
      </UTooltip>

      <Profile />

      <UTooltip v-if="showRightPanelButton" arrow :text="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')">
        <UButton
          :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
          :aria-label="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
          :aria-pressed="rightPanelOpen"
          size="sm"
          color="neutral"
          variant="ghost"
          :class="[headerIconButtonClass, rightPanelOpen ? headerIconButtonActiveClass : '']"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          @click="toggleRightPanel"
        />
      </UTooltip>
    </div>
  </section>
</template>
