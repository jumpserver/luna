<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserSettingStore } from "~/store/modules/userSetting";
import Profile from "./profile.vue";

const { t } = useI18n();
const { emit } = useEventBus();
const localePath = useLocalePath();

const useSettingStore = useUserSettingStore();

const { setCollapse } = useSettingStore;
const { collapse, theme } = storeToRefs(useSettingStore);

const isLoading = ref(false);

const sideBarItems = computed<NavigationMenuItem[]>(() => {
  return [
    {
      label: t("Menu.Resource"),
      type: "label"
    },
    {
      label: t("Menu.Linux"),
      icon: "si:terminal-alt-line",
      to: localePath("linux"),
      disabled: isLoading.value
    },
    {
      label: t("Menu.Windows"),
      icon: "gravity-ui:logo-windows",
      to: localePath("windows"),
      disabled: isLoading.value
    },
    {
      label: t("Menu.Database"),
      icon: "i-lucide-database",
      to: localePath("database"),
      disabled: isLoading.value
    },
    {
      label: t("Menu.Device"),
      icon: "mingcute:device-line",
      to: localePath("device"),
      disabled: isLoading.value
    },
    {
      label: t("Menu.Favorite"),
      icon: "i-lucide-star",
      to: localePath("favorite"),
      disabled: isLoading.value
    }
  ];
});

const handleCollapse = () => {
  setCollapse(!collapse.value);
};
const isDarkMode = computed(() => theme.value === "dark");
const sidebarSearch = ref("");
const emitSearch = (value: string) => emit("search", value);
const debouncedSidebarSearch = useDebounceFn(emitSearch, 200);
</script>

<template>
  <div
    class="flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-white/20 supports-[backdrop-filter]:dark:bg-zinc-900/15 border-r border-white/30 dark:border-white/10 shadow-sm"
    :style="{
      width: collapse ? '72px' : '256px'
    }"
  >
    <section class="flex items-center justify-end w-full px-4 h-12">
      <UButton
        v-if="!collapse"
        color="neutral"
        variant="ghost"
        size="md"
        class="mt-1"
        icon="i-lucide-panel-left"
        @click="handleCollapse"
      />
    </section>

    <div v-show="!collapse" class="px-4 py-2">
      <UInput
        v-model="sidebarSearch"
        clearable
        icon="i-lucide-search"
        variant="outline"
        :placeholder="t('Operation.Search')"
        class="dark:bg-transparent rounded-sm w-full"
        :style="isDarkMode ? '' : 'background-color: rgb(198,198,197, 0.5);'"
        @update:model-value="debouncedSidebarSearch"
      >
        <template v-if="sidebarSearch?.length" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear input"
            @click="
              () => {
                sidebarSearch = '';
                emitSearch('');
              }
            "
          />
        </template>
      </UInput>
    </div>

    <div class="px-4 py-0 flex-1 overflow-auto menu">
      <UNavigationMenu
        orientation="vertical"
        :items="sideBarItems"
        :collapsed="collapse"
        color="neutral"
        :ui="{
          link: 'px-2 my-1 rounded-sm menu-item light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'light:text-gray-800 dark:text-gray-200',
          label: 'light:text-gray-500 dark:text-gray-400 pb-0'
        }"
      />
    </div>

    <div class="px-3 py-2 mt-auto">
      <Profile :collapse="collapse" />
    </div>
  </div>
</template>

<style lang="scss">
.light .menu .menu-item {
  &[data-active] {
    background-color: var(--bg-hover-light);
  }

  &:hover {
    background-color: var(--bg-hover-light);
  }
}
</style>
