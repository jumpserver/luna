<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useUserSettingStore } from "~/store/modules/userSetting";
import Profile from "./profile.vue";
import SidebarFlipIcon from "~/icons/SidebarFlipIcon.vue";

const { t } = useI18n();
const { emit } = useEventBus();
const localePath = useLocalePath();

const useSettingStore = useUserSettingStore();

const { setCollapse } = useSettingStore;
const { collapse, theme } = storeToRefs(useSettingStore);

const isLoading = ref(false);

// 使用平台检测 composable
const { isMacOS } = usePlatform();

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
  console.log('Sidebar collapse button clicked, current state:', collapse.value);
  setCollapse(!collapse.value);
  console.log('Sidebar collapse state after toggle:', !collapse.value);
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
      width: collapse ? '63px' : '220px'
    }"
  >
    <!-- 搜索和折叠按钮区域 -->
    <section v-if="isMacOS" class="flex items-center justify-end w-full px-3 h-12">
      <UButton
        v-if="!collapse"
        color="neutral"
        variant="ghost"
        size="md"
        class="mt-1 p-1"
        :icon="SidebarFlipIcon"
        @click="handleCollapse"
      />
    </section>

    <div v-show="!collapse" class="px-3 py-2">
      <UInput
        v-model="sidebarSearch"
        size="sm"
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

    <div class="px-3 py-0 flex-1 overflow-auto menu">
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
    background-color: #ccccccdd;
    font-weight: 500;
  }

  &:hover:not([data-active]) {
    background-color: var(--bg-hover-light);
  }
}

// 搜索容器布局
.search-container {
  &--inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  &--stacked {
    display: block;
  }
}

// 搜索输入框样式
.search-input {
  background-color: transparent;
  border-radius: 0.125rem;
  
  &--inline {
    flex: 1;
  }
  
  &--full {
    width: 100%;
  }
}

// 折叠按钮样式
.collapse-button {
  &--inline {
    padding: 0.25rem;
    flex-shrink: 0;
  }
  
  &--stacked {
    margin-top: 0.25rem;
    padding: 0.25rem;
    display: block;
    margin-left: auto;
    margin-right: 0;
    width: fit-content;
  }
}
</style>
