<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme="isDark ? darkTheme : null">
    <n-message-provider>
      <loading>
        <router-view />
      </loading>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { darkTheme } from 'naive-ui';
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
import { onBeforeMount } from 'vue';
import { useTheme } from '@/hooks/useTheme.ts';
import { useTranslations } from '@/hooks/useTranslate.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';

import { setFavicon } from '@/utils';
import { storeToRefs } from 'pinia';

import Loading from '@/components/Loading/index.vue';

const { initTheme } = useTheme();
const { updateTranslations } = useTranslations();

const globalStore = useGlobalStore();

const { isDark } = storeToRefs(globalStore);

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
