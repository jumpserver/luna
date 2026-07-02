<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

export type SettingsSection = "general" | "appearance" | "application" | "about";

const props = withDefaults(
  defineProps<{
    mode?: "route" | "inline"
    activeSection?: SettingsSection
    embedded?: boolean
  }>(),
  {
    mode: "route",
    activeSection: "general",
    embedded: false
  }
);

const emit = defineEmits<{
  (e: "update:activeSection", value: SettingsSection): void
}>();

const localePath = useLocalePath();
const { t } = useI18n();
const { theme } = useSettingManager();

const sectionDefs = computed(() => {
  const defs: Array<{
    key: SettingsSection
    label: string
    icon: string
    routeName: string
    tauriOnly: boolean
  }> = [
    {
      key: "general",
      label: t("Common.General"),
      icon: "solar:settings-linear",
      routeName: "setting-general",
      tauriOnly: false
    },
    {
      key: "appearance",
      label: t("Common.Appearance"),
      icon: "solar:palette-linear",
      routeName: "setting-appearance",
      tauriOnly: false
    },
    {
      key: "application",
      label: t("Common.OpenWith"),
      icon: "tabler:toggle-right",
      routeName: "setting-application",
      tauriOnly: true
    },
    {
      key: "about",
      label: t("Common.About"),
      icon: "i-lucide-info",
      routeName: "setting-about",
      tauriOnly: false
    }
  ];

  return isTauriRuntime() ? defs : defs.filter((item) => !item.tauriOnly);
});

const routeMenu = computed<NavigationMenuItem[]>(() =>
  sectionDefs.value.map((item) => ({
    label: item.label,
    icon: item.icon,
    to: localePath({ name: item.routeName })
  }))
);

const inlineMenu = computed(() => sectionDefs.value);

const menuUi = {
  list: "p-2",
  link: "px-2 my-1 rounded-sm menu-item flex items-center light:text-gray-800 dark:text-gray-200",
  linkLeadingIcon: "light:text-gray-800 dark:text-gray-200"
} as const;

const selectSection = (key: SettingsSection) => {
  emit("update:activeSection", key);
};
</script>

<template>
  <div
    class="flex min-h-0 w-full gap-0"
    :class="embedded ? 'h-[min(86vh,675px)]' : 'h-full'"
  >
    <div
      class="menu setting-menu shrink-0"
      :style="{
        backgroundColor: theme === 'dark' ? '#222' : '#F5F5F7'
      }"
    >
      <UNavigationMenu
        v-if="mode === 'route'"
        :items="routeMenu"
        :highlight="false"
        :ui="menuUi"
        color="neutral"
        orientation="vertical"
        class="w-40"
      />

      <div v-else class="w-40 p-2">
        <button
          v-for="item in inlineMenu"
          :key="item.key"
          type="button"
          class="menu-item flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm light:text-gray-800 dark:text-gray-200"
          :class="activeSection === item.key
            ? 'bg-black/6 dark:bg-white/10'
            : 'hover:bg-black/4 dark:hover:bg-white/6'"
          @click="selectSection(item.key)"
        >
          <UIcon :name="item.icon" class="size-4 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <UCard
      class="min-w-0 flex-1 rounded-none overflow-y-auto"
      :class="embedded ? 'h-full' : 'h-full'"
      variant="outline"
      :ui="{ body: 'sm:p-0 h-full p-0' }"
    >
      <slot />
    </UCard>
  </div>
</template>
