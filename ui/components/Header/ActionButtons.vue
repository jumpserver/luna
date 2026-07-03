<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { isMacOS } = usePlatform();
const { currentThemePresetLabel, themeDropdownItems } = useThemeOptions();

// 公共按钮配置
const commonButtonProps = {
  size: "sm" as const,
  variant: "ghost" as const,
  color: "neutral" as const
};

// 窗口控制按钮配置
const windowControlButtons = computed(() => {
  // Windows 下显示窗口控制按钮
  return [
    {
      key: "minimize",
      iconName: "i-lucide-minus",
      tooltipLabel: t("ToolTips.Minimize"),
      onClick: async () => {
        if (!isTauriRuntime()) return;
        await useTauriCoreInvoke("minimize_window");
      }
    },
    {
      key: "maximize",
      iconName: "i-lucide-square",
      tooltipLabel: t("ToolTips.Maximize"),
      onClick: async () => {
        if (!isTauriRuntime()) return;
        await useTauriCoreInvoke("toggle_maximize_window");
      }
    },
    {
      key: "close",
      iconName: "i-lucide-x",
      tooltipLabel: t("ToolTips.Close"),
      onClick: async () => {
        if (!isTauriRuntime()) return;
        await useTauriCoreInvoke("close_window");
      }
    }
  ];
});

// 获取窗口控制按钮的样式类
const getWindowControlButtonClass = (buttonKey: string) => {
  const baseClass = "rounded-none w-10 h-10 p-1 flex items-center justify-center";

  switch (buttonKey) {
    case "minimize":
      return `${baseClass} `;
    case "maximize":
      return `${baseClass} `;
    case "close":
      return `${baseClass} hover:bg-red-500 hover:text-white active:bg-red-600`;
    default:
      return baseClass;
  }
};

const { openSettings, warmupWebSettings } = useSettingsWindow();

const openSettingsWindow = async () => {
  if (isTauriRuntime()) {
    await useTauriCoreInvoke("open_settings_window");
    return;
  }

  openSettings();
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

      <UButton
        icon="i-lucide-settings"
        :title="t('ToolTips.Settings')"
        v-bind="commonButtonProps"
        @mouseenter="warmupWebSettings"
        @focus="warmupWebSettings"
        @click="openSettingsWindow"
      />

      <Profile placement="topbar" />

      <UButton
        :icon="rightPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right'"
        :title="rightPanelOpen ? t('RightPanel.Close') : t('RightPanel.Open')"
        v-bind="commonButtonProps"
        @click="toggleRightPanel"
      />
    </div>

    <!-- 窗口控制按钮 -->
    <div v-if="!isMacOS" class="flex items-center">
      <template v-for="button of windowControlButtons" :key="button.key">
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :icon="button.iconName"
          :class="getWindowControlButtonClass(button.key)"
          :title="button.tooltipLabel"
          @click="button.onClick"
        />
      </template>
    </div>
  </section>
</template>
