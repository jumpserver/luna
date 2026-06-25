<script setup lang="ts">
import Profile from "~/components/SideBar/profile.vue";

const { t } = useI18n();
const { isMacOS } = usePlatform();
const { userTheme, manualSetTheme } = useThemeAdapter();

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
        await useTauriCoreInvoke("minimize_window");
      }
    },
    {
      key: "maximize",
      iconName: "i-lucide-square",
      tooltipLabel: t("ToolTips.Maximize"),
      onClick: async () => {
        await useTauriCoreInvoke("toggle_maximize_window");
      }
    },
    {
      key: "close",
      iconName: "i-lucide-x",
      tooltipLabel: t("ToolTips.Close"),
      onClick: async () => {
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

const openSettingsWindow = async () => {
  await useTauriCoreInvoke("open_settings_window");
};

const isDarkMode = computed(() => userTheme.value === "dark");

const toggleThemeMode = () => {
  manualSetTheme(isDarkMode.value ? "light" : "dark");
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1 px-2">
      <UButton
        :icon="
          isDarkMode
            ? 'line-md:moon-filled-to-sunny-filled-loop-transition'
            : 'line-md:sunny-filled-loop-to-moon-filled-transition'
        "
        :title="isDarkMode ? t('ToolTips.LightMode') : t('ToolTips.DarkMode')"
        v-bind="commonButtonProps"
        @click="toggleThemeMode"
      />

      <UButton
        icon="i-lucide-settings"
        :title="t('ToolTips.Settings')"
        v-bind="commonButtonProps"
        @click="openSettingsWindow"
      />

      <Profile placement="topbar" />
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
