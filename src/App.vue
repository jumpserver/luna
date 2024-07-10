<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="ThemeOverride">
    <n-message-provider>
      <n-spin :show="isLoading">
        <router-view />
      </n-spin>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onBeforeMount } from 'vue';
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
import { useTheme } from '@/hooks/useTheme.ts';
import { useTranslations } from '@/hooks/useTranslate.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import { LightThemeOverrides, DarkThemeOverrides } from './themeOverride.ts';

import { setFavicon } from '@/utils';

const { initTheme } = useTheme();
const globalStore = useGlobalStore();
const loadingStore = useLoadingStore();
const { updateTranslations } = useTranslations();

const isLoading = computed(() => {
  return loadingStore.isLoading;
});

console.log(LightThemeOverrides, DarkThemeOverrides);

onBeforeMount(() => {
  // 初始化主题样式
  initTheme();
  // 设置语言
  setCurrentLanguage();
  // 设置 ico
  setFavicon(globalStore.interface.favicon!);
});

const setCurrentLanguage = () => {
  updateTranslations(globalStore.language);
};
</script>

<style scoped lang="scss">
.n-config-provider,
.n-spin-container {
  width: 100%;
  height: 100%;
}
</style>
