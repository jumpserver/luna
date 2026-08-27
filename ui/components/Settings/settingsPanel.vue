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
const searchQuery = ref("");
const hasNativeTitlebarInset = computed(() => isDesktopRuntime());

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

const filteredSections = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return sectionDefs.value;

  return sectionDefs.value.filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase().includes(query));
});

const handleSearchShortcut = (event: KeyboardEvent) => {
  if (event.key.toLocaleLowerCase() !== "f" || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  document.querySelector<HTMLInputElement>("#settings-search")?.focus();
};

const selectSection = (section: SettingsSection) => {
  if (props.mode === "inline") {
    inlineActiveSection.value = section;
  }
};

useEventListener(document, "keydown", handleSearchShortcut);

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
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--app-main-bg)] md:flex-row">
    <aside
      class="flex max-h-[44%] w-full shrink-0 flex-col border-b border-[var(--app-border)] bg-[var(--app-sidebar-bg)] md:max-h-none md:w-[280px] md:border-b-0 md:border-r"
    >
      <div
        class="relative z-20 border-b border-[var(--app-border)] px-3"
        :class="hasNativeTitlebarInset ? 'pb-2 pt-10' : 'py-2'"
      >
        <UButton
          :label="t('Setting.BackToApp')"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="xs"
          class="h-7 w-full justify-start text-xs"
          :ui="{ leadingIcon: 'size-3.5' }"
          @click="closeSettings"
        />
      </div>

      <div class="border-b border-[var(--app-border)] px-3 py-2">
        <UInput
          id="settings-search"
          v-model="searchQuery"
          :placeholder="t('Setting.SearchPlaceholder')"
          icon="i-lucide-search"
          color="neutral"
          variant="outline"
          size="xs"
          class="w-full"
          :ui="{ base: 'h-7 text-xs', leadingIcon: 'size-3.5', trailing: 'pe-1.5' }"
        >
          <template #trailing>
            <span v-if="!searchQuery" class="flex items-center gap-0.5 text-[10px] text-muted">
              <UKbd>{{ isMacOS ? "⌘" : "Ctrl" }}</UKbd>
              <UKbd>F</UKbd>
            </span>
            <UButton
              v-else
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('Common.Cancel')"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>
      </div>

      <nav
        class="shrink-0 overflow-x-auto px-3 py-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:py-4"
        :aria-label="t('Common.Settings')"
      >
        <p class="mb-2 hidden px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted md:block">
          {{ t("Common.Settings") }}
        </p>

        <div class="flex gap-1 md:block md:space-y-1">
          <UButton
            v-for="item in filteredSections"
            :key="item.key"
            :to="mode === 'route' ? localePath({ name: item.routeName }) : undefined"
            :label="item.label"
            :icon="item.icon"
            color="neutral"
            variant="ghost"
            class="w-auto shrink-0 justify-start rounded-lg md:w-full"
            :class="activeSection?.key === item.key ? 'bg-[var(--app-selected-soft)] text-highlighted' : 'text-muted'"
            :aria-current="activeSection?.key === item.key ? 'page' : undefined"
            @click="selectSection(item.key)"
          />
        </div>

        <p v-if="filteredSections.length === 0" class="px-3 py-6 text-center text-xs text-muted">
          {{ t("Setting.NoSearchResults") }}
        </p>
      </nav>
    </aside>

    <main class="min-w-0 flex-1 overflow-y-auto bg-[var(--app-main-bg)]">
      <div
        class="mx-auto w-full max-w-4xl px-4 pb-8 sm:px-6 md:px-8 md:pb-10 lg:px-12"
        :class="hasNativeTitlebarInset ? 'pt-6 md:pt-[76px]' : 'pt-5 md:pt-10'"
      >
        <header class="mb-5 border-b border-[var(--app-border)] pb-4 md:mb-6 md:pb-5">
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
</template>
