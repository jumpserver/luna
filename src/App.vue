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
import { computed } from 'vue';
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
import { useLoadingStore } from '@/stores/modules/loading.ts';

const loadingStore = useLoadingStore();

const isLoading = computed(() => {
  return loadingStore.isLoading;
});
</script>
