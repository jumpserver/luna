<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { currentThemePresetLabel, themeDropdownItems } = useThemeOptions();

// 公共按钮配置
const commonButtonProps = {
  size: "sm" as const,
  variant: "ghost" as const,
  color: "neutral" as const
};

const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1 px-2">
      <UDropdownMenu
        :items="themeDropdownItems"
        :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
        :ui="{ content: 'w-64 p-1' }"
      >
        <UButton icon="solar:palette-linear" :title="currentThemePresetLabel" v-bind="commonButtonProps" />
      </UDropdownMenu>

      <Profile placement="topbar" />

      <UButton
        :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
        :title="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
        v-bind="commonButtonProps"
        @click="toggleRightPanel"
      />
    </div>
  </section>
</template>
