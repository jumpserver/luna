<script setup lang="ts">
import type { AppConfigType } from "~/types";
import TerminalSettings from "~/pages/setting/application/terminal.vue";
import { applicationSettingsGroups, matchesApplicationSearch } from "~/shared/applicationSettings";

const { t } = useI18n();
const { appConfig } = useSettingManager();
const selectedCategory = ref<keyof AppConfigType | "all">("all");
const search = ref("");
const terminalSettings = ref<InstanceType<typeof TerminalSettings> | null>(null);
const groups = computed(() =>
  applicationSettingsGroups(appConfig.value).map((group) => ({
    ...group,
    items: group.items.filter((item) => matchesApplicationSearch(item, search.value))
  }))
);
const categories = computed(() => [
  {
    value: "all" as const,
    label: t("Common.All"),
    icon: "i-lucide-layout-grid",
    count: groups.value.reduce((total, group) => total + group.items.length, 0)
  },
  ...(
    [
      { value: "terminal", label: "Setting.TerminalSettings", icon: "i-lucide-terminal" },
      { value: "remotedesktop", label: "Setting.RemoteDesktop", icon: "i-lucide-monitor" },
      { value: "filetransfer", label: "Setting.FileTransfer", icon: "i-lucide-folder" },
      { value: "databases", label: "Setting.Database", icon: "i-lucide-database" }
    ] as const
  ).map((category) => ({
    ...category,
    label: t(category.label),
    count: groups.value.find((group) => group.category === category.value)?.items.length || 0
  }))
]);
const visibleGroups = computed(() =>
  groups.value
    .filter((group) => selectedCategory.value === "all" || group.category === selectedCategory.value)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => group.category !== "terminal" || !item.use_ssh_helper)
    }))
);
const showTerminals = computed(
  () =>
    ["all", "terminal"].includes(selectedCategory.value) &&
    (!search.value.trim() ||
      groups.value.some((group) => group.category === "terminal" && group.items.some((item) => item.use_ssh_helper)))
);
const activeCategory = computed(() => categories.value.find((category) => category.value === selectedCategory.value)!);
</script>

<template>
  <SettingsGroup :divided="false" body-class="flex min-h-[480px]">
    <nav class="flex w-52 shrink-0 flex-col gap-1 p-2.5" :aria-label="t('Setting.ApplicationManager')">
      <UButton
        v-for="category in categories"
        :key="category.value"
        :label="category.label"
        :icon="category.icon"
        color="neutral"
        variant="ghost"
        size="xs"
        class="h-8 w-full justify-start"
        :class="selectedCategory === category.value ? 'bg-(--app-selected-soft) text-highlighted' : 'text-muted'"
        :aria-current="selectedCategory === category.value ? 'page' : undefined"
        @click="selectedCategory = category.value"
      >
        <template #trailing>
          <UBadge size="xs" color="neutral" variant="subtle" class="ml-auto">{{ category.count }}</UBadge>
        </template>
      </UButton>
    </nav>
    <div class="min-w-0 flex-1 border-l border-(--app-border) p-4">
      <div class="mb-4">
        <h3 class="text-sm font-medium text-highlighted">{{ activeCategory.label }}</h3>
        <p class="mt-1 text-xs text-muted">{{ t("Setting.ApplicationManagerDescription") }}</p>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <UButton
            v-if="selectedCategory === 'terminal' && showTerminals && isDesktopRuntime()"
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-lucide-plus"
            :label="t('Setting.AddCustomTerminal')"
            @click="terminalSettings?.openTerminalForm()"
          />
          <UInput
            v-model="search"
            size="sm"
            icon="i-lucide-search"
            :placeholder="t('Setting.SearchApplications')"
            :aria-label="t('Setting.SearchApplications')"
            class="ml-auto w-64 max-w-full"
          >
            <template v-if="search" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="xs"
                icon="i-lucide-x"
                :aria-label="t('Common.Clear')"
                @click="search = ''"
              />
            </template>
          </UInput>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <TerminalSettings v-if="showTerminals" ref="terminalSettings" management embedded :search="search" />
        <template v-for="group in visibleGroups" :key="group.category">
          <SettingItems
            v-for="item in group.items"
            :key="item.plugin_id || item.name"
            :item="item"
            mode="application"
          />
        </template>
        <UEmpty
          v-if="!activeCategory.count"
          icon="i-lucide-inbox"
          size="sm"
          variant="naked"
          :title="t(search.trim() ? 'Setting.NoMatchingApplications' : 'Common.NoData')"
        />
      </div>
    </div>
  </SettingsGroup>
</template>
