<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ActionItem } from "~/types/index";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useUserSettingStore } from "~/store/modules/userSetting";

const { t } = useI18n();
const userSettingStore = useUserSettingStore();
const { theme, layouts, sort } = storeToRefs(userSettingStore);
const { isMacOS } = usePlatform();

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
        tooltipLabel: "最小化",
        onClick: async () => {
          await useTauriCoreInvoke('minimize_window');
        }
      },
      {
        key: "maximize",
        iconName: "i-lucide-square",
        tooltipLabel: "最大化",
        onClick: async () => {
          await useTauriCoreInvoke('toggle_maximize_window');
        }
      },
      {
        key: "close",
        iconName: "i-lucide-x",
        tooltipLabel: "关闭",
        onClick: async () => {
          await useTauriCoreInvoke('close_window');
        }
      }
    ];
});

// 获取窗口控制按钮的样式类
const getWindowControlButtonClass = (buttonKey: string) => {
  const baseClass = "!w-12 !h-8 !p-0 !flex !items-center !justify-center";
  
  switch (buttonKey) {
    case 'minimize':
      return `${baseClass} hover:!bg-gray-200 active:!bg-gray-300`;
    case 'maximize':
      return `${baseClass} hover:!bg-gray-200 active:!bg-gray-300`;
    case 'close':
      return `${baseClass} hover:!bg-red-500 hover:!text-white active:!bg-red-600`;
    default:
      return baseClass;
  }
};

// 从 Operation 组件移动过来的按钮操作逻辑
const actionItems = computed<ActionItem[]>(() => [
  {
    key: "refresh",
    type: "action",
    iconName: "i-lucide-refresh-ccw",
    tooltipLabel: t("ToolTips.Refresh"),
    onClick: () => {
      useEventBus().emit("refresh", undefined);
    }
  },
  {
    key: "sort",
    type: "select",
    iconName: "i-lucide-arrow-down-wide-narrow",
    tooltipLabel: t("ToolTips.Sort"),
    selectItems: [
      {
        icon: "i-lucide-arrow-down-a-z",
        label: t("Sort.A-z"),
        value: "name",
        type: "checkbox" as const,
        checked: sort.value === "name",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("name");
          }
        }
      },
      {
        icon: "i-lucide-arrow-up-z-a",
        label: t("Sort.Z-A"),
        value: "-name",
        type: "checkbox" as const,
        checked: sort.value === "-name",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("-name");
          }
        }
      },
      {
        type: "separator" as const
      },
      {
        icon: "i-lucide-calendar-arrow-down",
        label: t("Sort.NewestToOldest"),
        value: "-date_updated",
        type: "checkbox" as const,
        checked: sort.value === "-date_updated",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("-date_updated");
          }
        }
      },
      {
        icon: "i-lucide-calendar-arrow-up",
        label: t("Sort.OldestToNewest"),
        value: "date_updated",
        type: "checkbox" as const,
        checked: sort.value === "date_updated",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort("date_updated");
}
        }
      }
    ] as DropdownMenuItem[]
  },
  {
    key: "layout",
    type: "select",
    iconName: "i-lucide-layout-grid",
    tooltipLabel: t("ToolTips.Layout"),
    selectItems: [
      {
        icon: "i-lucide-grid-2x2",
        label: t("Layout.Grid"),
        value: "grid",
        type: "checkbox" as const,
        checked: layouts.value === "grid",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts("grid");
          }
        }
      },
      {
        icon: "i-lucide-table-of-contents",
        label: t("Layout.Table"),
        value: "table",
        type: "checkbox" as const,
        checked: layouts.value === "table",
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts("table");
          }
        }
      }
    ] as DropdownMenuItem[]
  },
  {
    key: "settings",
    type: "action",
    iconName: "i-lucide-settings",
    tooltipLabel: t("ToolTips.Settings"),
    onClick: () => {
      // eslint-disable-next-line no-new
      new useTauriWebviewWindowWebviewWindow("secondary", {
        title: t("Common.ConnectionSettings"),
        url: "/setting",
        minWidth: 760,
        minHeight: 520,
        hiddenTitle: true,
        titleBarStyle: "overlay",
        trafficLightPosition: new LogicalPosition(10, 22)
      });
    }
  }
]);
</script>

<template>
  <section class="flex items-center h-full gap-3 mr-2">
    <template v-for="action of actionItems" :key="action.iconName">
      <template v-if="action.type === 'action'">
        <UButton :icon="action.iconName" v-bind="commonButtonProps" @click="action.onClick" />
      </template>

      <template v-else>
        <UDropdownMenu arrow :items="action.selectItems" size="sm">
          <UButton 
            :icon="action.iconName" 
            v-bind="commonButtonProps"
            @click="() => console.log('Dropdown button clicked:', action.key)"
          />
        </UDropdownMenu>
      </template>
    </template>

    <!-- 窗口控制按钮 -->
    <div class="flex items-center ml-2">
      <template v-for="button of windowControlButtons" :key="button.key">
        <UButton 
          :icon="button.iconName"
          :class="getWindowControlButtonClass(button.key)"
          @click="button.onClick"
          :title="button.tooltipLabel"
          size="sm"
          variant="ghost"
          color="neutral"
        />
      </template>
    </div>
  </section>
</template>
