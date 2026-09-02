<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
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

const sectionNavItems = computed<NavigationMenuItem[]>(() =>
  sectionDefs.value.map((item) => {
    const active = activeSection.value?.key === item.key;
    return {
      label: item.label,
      icon: item.icon,
      value: item.key,
      to: props.mode === "route" ? localePath({ name: item.routeName }) : undefined,
      active,
      onSelect: () => selectSection(item.key),
      ui: {
        link: active ? "before:bg-(--app-state-hover-strong) text-highlighted" : "text-muted",
        linkLeadingIcon: active ? "size-4 text-highlighted" : "size-4 text-muted"
      }
    };
  })
);

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
  <div class="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-(--app-surface-canvas)">
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        class="flex max-h-[44%] w-full shrink-0 flex-col bg-(--app-surface-sidebar) md:max-h-none md:w-62"
        :class="hasNativeTitlebarInset ? 'pt-10' : ''"
      >
        <div class="px-3 pt-3">
          <UButton
            :label="t('Setting.BackToApp')"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="xs"
            class="h-8 w-full justify-start text-xs text-muted"
            :ui="{ leadingIcon: 'size-3.5', base: 'rounded-lg' }"
            @click="closeSettings"
          />
        </div>

        <nav class="min-h-0 flex-1 overflow-x-auto px-3 py-3 md:overflow-y-auto" :aria-label="t('Common.Settings')">
          <UNavigationMenu
            orientation="vertical"
            color="neutral"
            variant="pill"
            :items="sectionNavItems"
            :ui="{
              root: 'w-full',
              list: 'flex flex-row gap-1 md:flex-col md:gap-0.5',
              item: 'shrink-0 md:w-full',
              link: 'rounded-lg',
              linkLeadingIcon: 'size-4'
            }"
          />
        </nav>
      </aside>

      <USeparator class="md:hidden" :ui="{ border: 'border-t border-[var(--app-border-soft)]' }" />
      <USeparator
        orientation="vertical"
        class="hidden md:flex"
        :ui="{ border: 'border-s border-[var(--app-border-soft)]' }"
      />

      <main
        class="min-w-0 flex-1 overflow-y-auto bg-(--app-surface-canvas) font-sans"
        :class="hasNativeTitlebarInset ? 'pt-10' : ''"
      >
        <div class="px-5 pt-3 pb-6 sm:px-8 md:px-10 md:pb-8">
          <div class="mx-auto w-full max-w-3xl">
            <Transition name="settings-section" mode="out-in">
              <UPageHeader
                :key="activeSection?.key"
                :title="activeSection?.label"
                :description="activeSection?.description"
                :ui="{
                  root: 'relative mb-8 border-0 py-0',
                  wrapper: 'flex flex-col gap-0',
                  title: 'text-2xl font-semibold tracking-tight text-highlighted',
                  description: 'mt-1.5 text-sm text-muted'
                }"
              />
            </Transition>

            <slot />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
