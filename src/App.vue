<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
import { getTranslation } from './API/modules/init.ts';
import { onMounted } from 'vue';

onMounted(async () => {
  await getTranslation('en');
});
</script>
