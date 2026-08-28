<script setup lang="ts">
import type { SettingsSection } from "~/composables/useSettingsWindow";
import { useUserInfoStore } from "~/store/modules/userInfo";

const props = withDefaults(
  defineProps<{
    mode?: "route" | "inline";
    activeSection?: SettingsSection;
  }>(),
  {
    mode: "route",
    activeSection: "general"
  }
);

const route = useRoute();
const localePath = useLocalePath();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { closeSettings, activeSection: inlineActiveSection } = useSettingsWindow();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const hasNativeTitlebarInset = computed(() => isDesktopRuntime() && isMacOS.value);

const sectionDefs = computed(() => {
  const defs = [
    {
      key: "user" as const,
      label: t("Common.User"),
      description: t("Setting.UserDescription"),
      icon: "i-lucide-user-round",
      routeName: "setting-user",
      desktopOnly: false,
      authenticatedOnly: true
    },
    {
      key: "general" as const,
      label: t("Common.General"),
      description: t("Setting.GeneralDescription"),
      icon: "i-lucide-settings-2",
      routeName: "setting-general",
      desktopOnly: false,
      authenticatedOnly: false
    },
    {
      key: "appearance" as const,
      label: t("Common.Appearance"),
      description: t("Setting.AppearanceDescription"),
      icon: "i-lucide-palette",
      routeName: "setting-appearance",
      desktopOnly: false,
      authenticatedOnly: false
    },
    {
      key: "application" as const,
      label: t("Common.OpenWith"),
      description: t("Setting.ApplicationDescription"),
      icon: "i-lucide-panels-top-left",
      routeName: "setting-application",
      desktopOnly: true,
      authenticatedOnly: false
    },
    {
      key: "about" as const,
      label: t("Common.About"),
      description: t("Setting.AboutDescription"),
      icon: "i-lucide-info",
      routeName: "setting-about",
      desktopOnly: false,
      authenticatedOnly: false
    }
  ];

  return defs.filter(
    (item) => (!item.desktopOnly || isDesktopRuntime()) && (!item.authenticatedOnly || loggedIn.value)
  );
});

const routeActiveSection = computed(() => {
  return sectionDefs.value.find((item) => route.path.startsWith(`/setting/${item.key}`)) || sectionDefs.value[0];
});

const activeSection = computed(() => {
  if (props.mode === "inline") {
    return sectionDefs.value.find((item) => item.key === props.activeSection) || sectionDefs.value[0];
  }
  return routeActiveSection.value;
});

const selectSection = (section: SettingsSection) => {
  if (props.mode === "inline") {
    inlineActiveSection.value = section;
  }
};

watch(
  loggedIn,
  (value) => {
    if (!import.meta.client || value) return;

    if (props.mode === "inline" && inlineActiveSection.value === "user") {
      inlineActiveSection.value = "general";
      return;
    }

    if (props.mode === "route" && route.path.startsWith("/setting/user")) {
      void navigateTo(localePath({ name: "setting-general" }), { replace: true });
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--app-surface-frame)]">
    <div
      class="flex min-h-0 flex-1 flex-col gap-3 p-[var(--workspace-island-inset)] md:flex-row"
      :class="hasNativeTitlebarInset ? 'pt-10' : ''"
    >
      <aside class="settings-island flex max-h-[44%] w-full shrink-0 flex-col md:max-h-none md:w-[240px]">
        <div class="px-2 pt-2">
          <UButton
            :label="t('Setting.BackToApp')"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="xs"
            class="h-8 w-full justify-start text-xs"
            :ui="{ leadingIcon: 'size-3.5', base: 'rounded-[length:var(--app-radius)]' }"
            @click="closeSettings"
          />
        </div>

        <nav class="min-h-0 flex-1 overflow-x-auto px-2 py-3 md:overflow-y-auto" :aria-label="t('Common.Settings')">
          <p class="mb-2 hidden px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted md:block">
            {{ t("Common.Settings") }}
          </p>

          <div class="flex gap-1 md:block md:space-y-1">
            <UButton
              v-for="item in sectionDefs"
              :key="item.key"
              :to="mode === 'route' ? localePath({ name: item.routeName }) : undefined"
              :label="item.label"
              :icon="item.icon"
              color="neutral"
              variant="ghost"
              class="w-auto shrink-0 justify-start md:w-full"
              :class="activeSection?.key === item.key ? 'bg-[var(--app-selected-soft)] text-highlighted' : 'text-muted'"
              :ui="{ base: 'rounded-[length:var(--app-radius)]' }"
              :aria-current="activeSection?.key === item.key ? 'page' : undefined"
              @click="selectSection(item.key)"
            />
          </div>
        </nav>
      </aside>

      <main class="settings-island settings-island--content min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 md:px-10 md:py-8">
          <header class="mb-6">
            <h1 class="text-xl font-semibold text-highlighted">
              {{ activeSection?.label }}
            </h1>
            <p class="mt-1 text-sm text-muted">
              {{ activeSection?.description }}
            </p>
          </header>

          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
