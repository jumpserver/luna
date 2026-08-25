<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { LangType } from "~/types";

import Profile from "~/components/SideBar/profile.vue";

const { t, locales, locale } = useI18n();
const { openSettings } = useSettingsWindow();
const { openToolWindow } = useToolWindow();
const { themeDropdownItems } = useThemeOptions();
const { setLang } = useSettingManager();
const localePath = useLocalePath();

const commonButtonProps = {
  size: "sm" as const,
  color: "neutral" as const
};

const { open: rightPanelOpen, toggle: toggleRightPanel } = useRightPanel();

const languageItems = computed<DropdownMenuItem[]>(() =>
  ((locales.value as Array<{ code?: string; name?: string } | string>) || []).map((item) => {
    const code = typeof item === "string" ? item : item.code || "";
    const label = typeof item === "string" ? item : item.name || code;

    return {
      label,
      type: "checkbox",
      checked: locale.value === code,
      onUpdateChecked: (checked: boolean) => {
        if (checked && code) setLang(code as LangType);
      }
    };
  })
);

const toolItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("Menu.Player"),
    icon: "lucide:clapperboard",
    onSelect: () => void openToolWindow(localePath("videoplayer"), "JumpServer Video Player")
  },
  {
    label: t("Menu.Transcode"),
    icon: "lucide:repeat-2",
    onSelect: () => void openToolWindow(localePath({ path: "/transcode" }), t("Transcode.Title"))
  }
]);

const settingsItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("Common.Language"),
    icon: "i-lucide-languages",
    children: languageItems.value
  },
  ...(isTauriRuntime()
    ? [
        {
          label: t("Menu.MyTools"),
          icon: "i-lucide-wrench",
          children: toolItems.value
        } satisfies DropdownMenuItem
      ]
    : []),
  {
    label: t("Common.SwitchTheme"),
    icon: "i-lucide-palette",
    children: themeDropdownItems.value
  },
  { type: "separator" },
  {
    label: t("Common.Settings"),
    icon: "i-lucide-settings",
    onSelect: () => void openSettings()
  },
  {
    label: t("DesktopMenu.About"),
    icon: "i-lucide-info",
    onSelect: () => void openSettings("/setting/about")
  }
]);
</script>

<template>
  <section class="flex items-center h-full">
    <div class="flex items-center gap-1 px-2">
      <UDropdownMenu :items="settingsItems" :content="{ align: 'end', side: 'bottom', sideOffset: 6 }">
        <UTooltip arrow :text="t('Common.Settings')">
          <UButton
            icon="i-lucide-settings"
            :aria-label="t('Common.Settings')"
            v-bind="commonButtonProps"
            variant="ghost"
          />
        </UTooltip>
      </UDropdownMenu>

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
