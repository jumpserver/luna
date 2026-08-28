<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { LangType } from "~/types";

const props = withDefaults(
  defineProps<{
    submenuSide?: "left" | "right";
  }>(),
  {
    submenuSide: "left"
  }
);

const emit = defineEmits<{
  select: [];
}>();

const { t, locales, locale } = useI18n();
const { openSettings } = useSettingsWindow();
const { themeDropdownItems } = useThemeOptions();
const { setLang } = useSettingManager();
const localePath = useLocalePath();

const submenuContent = computed(() => ({
  align: props.submenuSide === "left" ? ("end" as const) : ("start" as const),
  side: props.submenuSide,
  sideOffset: 6
}));

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
    to: localePath("videoplayer"),
    onSelect: () => emit("select")
  },
  {
    label: t("Menu.Transcode"),
    icon: "lucide:repeat-2",
    to: localePath({ path: "/transcode" }),
    onSelect: () => emit("select")
  }
]);

const openPreferences = async () => {
  emit("select");
  await openSettings();
};

const openAbout = async () => {
  emit("select");
  await openSettings("/setting/about");
};
</script>

<template>
  <div class="space-y-0.5">
    <UDropdownMenu :items="languageItems" size="sm" :content="submenuContent">
      <UButton
        :label="t('Common.Language')"
        icon="i-lucide-languages"
        trailing-icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        class="justify-start"
        :ui="{ trailingIcon: 'ms-auto' }"
        @click.stop
      />
    </UDropdownMenu>

    <UDropdownMenu v-if="isDesktopRuntime()" :items="toolItems" size="sm" :content="submenuContent">
      <UButton
        :label="t('Menu.MyTools')"
        icon="i-lucide-wrench"
        trailing-icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        class="justify-start"
        :ui="{ trailingIcon: 'ms-auto' }"
        @click.stop
      />
    </UDropdownMenu>

    <UDropdownMenu :items="themeDropdownItems" size="sm" :content="submenuContent">
      <UButton
        :label="t('Common.SwitchTheme')"
        icon="i-lucide-palette"
        trailing-icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        class="justify-start"
        :ui="{ trailingIcon: 'ms-auto' }"
        @click.stop
      />
    </UDropdownMenu>

    <UButton
      :label="t('Common.Preferences')"
      icon="i-lucide-settings"
      color="neutral"
      variant="ghost"
      size="sm"
      block
      class="justify-start"
      @click="openPreferences"
    />

    <UButton
      :label="t('DesktopMenu.About')"
      icon="i-lucide-info"
      color="neutral"
      variant="ghost"
      size="sm"
      block
      class="justify-start"
      @click="openAbout"
    />
  </div>
</template>
