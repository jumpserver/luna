<script setup lang="ts">
import { LogicalPosition } from "@tauri-apps/api/dpi";

const { t } = useI18n();
const { isMacOS } = usePlatform();
const localePath = useLocalePath();

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
  const label = "secondary";
  const existing = await useTauriWebviewWindowWebviewWindow.getByLabel(label);

  if (existing) {
    try {
      if (await existing.isMinimized()) {
        await existing.unminimize();
      }

      if (!(await existing.isVisible())) {
        await existing.show();
      }

      await existing.setFocus();
    } catch (e) {
      console.error("focus settings window failed", e);
    }
    return;
  }

  const isMac = isMacOS.value;
  // eslint-disable-next-line no-new
  new useTauriWebviewWindowWebviewWindow(label, {
    title: t("Common.ConnectionSettings"),
    url: localePath({ path: "/setting" }),
    height: 675,
    minWidth: 930,
    minHeight: 675,
    maxHeight: 675,
    hiddenTitle: true,
    titleBarStyle: "overlay",
    trafficLightPosition: new LogicalPosition(10, 22),
    decorations: isMac,
    shadow: isMac
  });
};
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center px-2">
      <UButton
        icon="i-lucide-settings"
        :title="t('ToolTips.Settings')"
        v-bind="commonButtonProps"
        @click="openSettingsWindow"
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
