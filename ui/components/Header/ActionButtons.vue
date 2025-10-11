<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ActionItem } from "~/types/index";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useUserSettingStore } from "~/store/modules/userSetting";

const { t } = useI18n();
const userSettingStore = useUserSettingStore();
const { theme, layouts, sort } = storeToRefs(userSettingStore);

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
        <UButton
          :icon="action.iconName"
          size="sm"
          variant="ghost"
          class="btn-common"
          @click="action.onClick"
        />
      </template>

      <template v-else>
        <UDropdownMenu arrow :items="action.selectItems" size="sm">
          <UButton
            :icon="action.iconName"
            size="sm"
            variant="ghost"
            class="btn-common"
          />
        </UDropdownMenu>
      </template>
    </template>
  </section>
</template>
