<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const localePath = useLocalePath();

const { t } = useI18n();
const { isMacOS } = usePlatform();
const { theme } = useSettingManager();
const { initialTheme, listenOSThemeChange } = useThemeAdapter();

const commonButtonProps = {
  size: "sm" as const,
  variant: "ghost" as const,
  color: "neutral" as const
};

const windowControlButtons = computed(() => {
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

const windowControlRailClass = computed(() => {
  return isMacOS.value ? "w-0" : "w-36";
});

const getWindowControlButtonClass = (buttonKey: string) => {
  const baseClass = "rounded-none w-12 h-13 p-1 flex items-center justify-center";

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

const settingMenu = computed<NavigationMenuItem[]>(() => {
  return [
    {
      label: t("Common.General"),
      icon: "solar:settings-linear",
      to: localePath({ name: "setting-general" })
    },
    {
      label: t("Common.Appearance"),
      icon: "solar:palette-linear",
      to: localePath({ name: "setting-appearance" })
    },
    {
      label: t("Common.OpenWith"),
      icon: "tabler:toggle-right",
      to: localePath({ name: "setting-application" })
    },
    {
      label: t("Common.About"),
      icon: "i-lucide-info",
      to: localePath({ name: "setting-about" })
    }
  ];
});

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
});
</script>

<template>
  <UPage
    class="h-screen flex flex-col"
    :ui="{
      center: 'flex flex-col h-full min-h-0'
    }"
    :style="{
      backgroundColor: theme === 'dark' ? '#2C2C2C' : '#F5F5F5'
    }"
  >
    <UPageHeader
      :ui="{
        root: 'p-0'
      }"
    >
      <template #default>
        <!--
          整条标题栏底层是一个满宽度的 data-tauri-drag-region
          上层可见内容默认 pointer-events-none，所以标题区域和空白区域都会把事件透传给底层拖拽层
          右侧窗口按钮区域单独恢复 pointer-events-auto，并且整块都标记 data-tauri-drag-region="false"，确保按钮区域不会触发拖拽事件
        -->
        <div class="header-bg relative h-10 px-4">
          <div data-tauri-drag-region class="absolute inset-0 z-0" />

          <div class="relative z-10 flex h-full items-center pointer-events-none">
            <div aria-hidden="true" :class="windowControlRailClass" />

            <div class="min-w-0 flex-1 px-4 text-center select-none">
              <p class="pointer-events-none truncate text-sm font-bold">
                {{ t("Common.ConnectionSettings") }}
              </p>
            </div>

            <div
              class="flex h-full shrink-0 items-center justify-end pointer-events-auto"
              :class="windowControlRailClass"
              data-tauri-drag-region="false"
            >
              <template v-if="!isMacOS">
                <template v-for="button of windowControlButtons" :key="button.key">
                  <UButton
                    :icon="button.iconName"
                    :class="getWindowControlButtonClass(button.key)"
                    :title="button.tooltipLabel"
                    v-bind="commonButtonProps"
                    data-tauri-drag-region="false"
                    @click="button.onClick"
                  />
                </template>
              </template>
            </div>
          </div>
        </div>
      </template>
    </UPageHeader>

    <UPageBody class="mt-0 pb-0 flex-1 min-h-0 h-full overflow-y-auto">
      <div class="flex gap-0 w-full h-full min-h-0">
        <div
          class="menu setting-menu shrink-0"
          :style="{
            backgroundColor: theme === 'dark' ? '#222' : '#F5F5F7'
          }"
        >
          <UNavigationMenu
            :items="settingMenu"
            :highlight="false"
            :ui="{
              list: 'p-2',
              link: 'px-2 my-1 rounded-sm menu-item flex items-center light:text-gray-800 dark:text-gray-200',
              linkLeadingIcon: 'light:text-gray-800 dark:text-gray-200'
            }"
            color="neutral"
            orientation="vertical"
            class="w-40"
          />
        </div>

        <UCard
          class="flex-1 min-w-0 h-full rounded-none overflow-y-auto"
          variant="outline"
          :ui="{ body: 'sm:p-0 h-full p-0' }"
        >
          <slot />
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>
