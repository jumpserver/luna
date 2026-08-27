<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { LangType } from "~/types";

import Profile from "~/components/SideBar/profile.vue";

const { t, locales, locale } = useI18n();
const { openSettings } = useSettingsWindow();
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
    to: localePath("videoplayer")
  },
  {
    label: t("Menu.Transcode"),
    icon: "lucide:repeat-2",
    to: localePath({ path: "/transcode" })
  }
]);

const appMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("Common.Language"),
    icon: "i-lucide-languages",
    children: languageItems.value
  },
  ...(isDesktopRuntime()
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
    label: t("Common.Preferences"),
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
      <UDropdownMenu
        :items="appMenuItems"
        size="sm"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
        :ui="{
          item: '!items-center leading-none',
          itemLeadingIcon: 'size-4 shrink-0 block leading-none',
          itemTrailingIcon: 'size-4 shrink-0 block leading-none',
          itemLabel: 'block truncate text-start leading-none',
          itemWrapper: 'min-w-0 flex-1 justify-start text-start'
        }"
      >
        <UTooltip arrow :text="t('Common.AppMenu')">
          <UButton
            icon="i-lucide-settings"
            :aria-label="t('Common.AppMenu')"
            v-bind="commonButtonProps"
            variant="ghost"
            :ui="{ leadingIcon: 'size-4' }"
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
