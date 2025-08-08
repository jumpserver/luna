<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

definePageMeta({
  layout: 'setting',
});

const tabItems = ref<TabsItem[]>([
  {
    label: '远程协议',
  },
  {
    label: '数据库协议',
  },
]);
</script>

<template>
  <UCard>
    <UTabs :items="tabItems" size="lg" variant="pill" class="w-full">
      <template #content="{ item }">
        <SettingItem v-for="i in 3" />
      </template>
    </UTabs>
  </UCard>
</template>
