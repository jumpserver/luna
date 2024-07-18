<template>
  <fullscreen v-model:fullscreen="isFull" :teleport="true">
    <n-config-provider
      :locale="zhCN"
      :date-locale="dateZhCN"
      :theme="isDark ? darkTheme : null"
      :theme-overrides="currentThemeOverrides"
    >
      <n-dialog-provider>
        <n-message-provider>
          <loading>
            <router-view />
          </loading>
        </n-message-provider>
      </n-dialog-provider>
    </n-config-provider>
  </fullscreen>
</template>

<script setup lang="ts">
import { darkTheme, GlobalThemeOverrides } from 'naive-ui';
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
import { onMounted, onUnmounted, ref } from 'vue';
import { useTheme } from '@/hooks/useTheme.ts';
import { useTranslations } from '@/hooks/useTranslate.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { component as fullscreen } from 'vue-fullscreen';

import { setFavicon } from '@/utils';
import { storeToRefs } from 'pinia';

import mittBus from '@/utils/mittBus.ts';
import Loading from '@/components/Loading/index.vue';

const { initTheme, initThemeColor } = useTheme();
const { updateTranslations } = useTranslations();

const globalStore = useGlobalStore();

const { isDark, isFullScreen } = storeToRefs(globalStore);

const isFull = isFullScreen;

const currentThemeOverrides = ref<GlobalThemeOverrides>({});

onMounted(() => {
  // 初始化主题样式
  initTheme();
  // 设置语言
  setCurrentLanguage();
  // 设置 ico
  setFavicon(globalStore.interface.favicon!);

  // 设置主题颜色
  currentThemeOverrides.value = initThemeColor();

  mittBus.on('theme-color', () => {
    currentThemeOverrides.value = initThemeColor();
  });
});

onUnmounted(() => {
  mittBus.off('theme-color');
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
