<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

import Profile from "./profile.vue";
import SidebarFlipIcon from "~/icons/SidebarFlipIcon.vue";

const localePath = useLocalePath();

const { t } = useI18n();
const { emit } = useEventBus();
const { isMacOS } = usePlatform();
// const isMacOS = false;
const { collapse, setCollapse } = useSettingManager();

const isLoading = ref(false);
const sidebarSearch = ref("");

const sideBarItems = computed<NavigationMenuItem[]>(() => {
  return [
    {
      label: t("Menu.Resource"),
      type: "label"
    },
    {
      label: t("Menu.Linux"),
      icon: "gravity-ui:terminal",
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
      icon: "gravity-ui:database",
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
      icon: "gravity-ui:star",
      to: localePath("favorite"),
      disabled: isLoading.value
    }
  ];
});

const handleCollapse = () => {
  setCollapse(!collapse.value);
};
const emitSearch = (value: string) => emit("search", value);
const debouncedSidebarSearch = useDebounceFn(emitSearch, 200);
</script>

<template>
  <!-- backdrop-blur-lg 如果加上这个属性会导致在拖动窗口的时候，左侧背景一直在变化 -->
  <div
    class="flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-saturate-150 supports-backdrop-filter:dark:bg-zinc-900/15 border-r border-white/30 dark:border-white/10 shadow-sm"
    :style="{
      width: collapse ? '75px' : '220px'
    }"
  >
    <!-- 顶部区域：折叠按钮和搜索框 -->
    <div class="flex flex-col w-full">
      <!-- 折叠按钮 -->
      <div
        class="flex items-center px-3 h-10"
        :class="
          isMacOS
            ? collapse
              ? 'mt-9 justify-center'
              : 'justify-end'
            : collapse
              ? 'py-2 justify-center mt-2'
              : 'py-2 mt-2 justify-between'
        "
      >
        <div class="flex items-center gap-2" v-if="!isMacOS && !collapse">
          <UAvatar size="sm" src="/logo.png" class="bg-transparent" :ui="{ root: 'bg-transparent' }" />
          <span class="text-sm">JumpServer</span>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          :class="collapse ? 'p-2' : 'p-1'"
          :icon="SidebarFlipIcon"
          @click="handleCollapse"
        />
      </div>

      <!-- 搜索框区域 -->
      <div v-show="!collapse" class="px-3 py-2">
        <UInput
          v-model="sidebarSearch"
          size="sm"
          clearable
          autocapitalize="none"
          autocorrect="off"
          icon="i-lucide-search"
          variant="outline"
          :placeholder="t('Operation.Search')"
          class="dark:bg-transparent rounded-sm w-full search-input"
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
    </div>

    <div
      class="px-3 py-0 flex-1 overflow-auto menu"
      :style="{
        display: collapse ? 'inline-flex' : '',
        justifyContent: collapse ? 'center' : ''
      }"
    >
      <UNavigationMenu
        orientation="vertical"
        :items="sideBarItems"
        :collapsed="collapse"
        color="neutral"
        :ui="{
          link: 'px-2 my-1 rounded-sm menu-item flex items-center light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'light:text-gray-800 dark:text-gray-200',
          label: 'light:text-gray-500 dark:text-gray-400 pb-0 text-xs font-light'
        }"
      />
    </div>

    <div class="px-3 py-2 mt-auto">
      <Profile :collapse="collapse" />
    </div>
  </div>
</template>

<style>
.light .menu .menu-item {
  &[data-active] {
    background-color: transparent; 
    
    &::before {
      background-color: var(--bg-hover-light);
    }
    
    /* opacity: 0.8; */
    font-weight: 500;
  }

  &:hover:not([data-active]) {
    background-color: var(--bg-hover-light);
  }
}

.light .search-input input {
    background-color: var(--bg-hover-light);
}

.menu nav[data-collapsed="true"] {
  width: 38px;
}
</style>
