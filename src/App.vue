<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
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
import { useTranslations } from '@/hooks/useTranslate.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { useLoadingStore } from '@/stores/modules/loading.ts';

const globalStore = useGlobalStore();
const loadingStore = useLoadingStore();
const { updateTranslations } = useTranslations();

const isLoading = computed(() => {
  return loadingStore.isLoading;
});

onBeforeMount(() => {
  setCurrentLanguage();
});

const setCurrentLanguage = () => {
  updateTranslations(globalStore.language);
};
</script>
