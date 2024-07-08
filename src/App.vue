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
import { useUserStore } from '@/stores/modules/user.ts';
import { useTranslations } from '@/hooks/useTranslate.ts';
import { onMounted } from 'vue';

const userStore = useUserStore();
const { updateTranslations } = useTranslations();

onMounted(async () => {
  await updateTranslations(userStore.language);
});
</script>
