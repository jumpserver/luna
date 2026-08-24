<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { openSettings, warmupWebSettings } = useSettingsWindow();

const commonButtonProps = {
  size: "sm" as const,
  color: "neutral" as const
};

const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();

const openSettingsWindow = () => {
  warmupWebSettings();
  void openSettings();
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1 px-2">
      <UTooltip arrow :text="t('Common.Settings')">
        <UButton
          icon="i-lucide-settings"
          :aria-label="t('Common.Settings')"
          v-bind="commonButtonProps"
          variant="ghost"
          @click="openSettingsWindow"
        />
      </UTooltip>

      <Profile placement="topbar" />

      <UTooltip arrow :text="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')">
        <UButton
          :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
          :aria-label="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
          :aria-pressed="rightPanelOpen"
          v-bind="commonButtonProps"
          :variant="rightPanelOpen ? 'soft' : 'ghost'"
          @click="toggleRightPanel"
        />
      </UTooltip>
    </div>
  </section>
</template>
