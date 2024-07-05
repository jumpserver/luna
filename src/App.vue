<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <router-view />
    <div v-html="123"></div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { zhCN, dateZhCN } from 'naive-ui';
import { NConfigProvider } from 'naive-ui';
</script>

<style scoped lang="scss">
.container {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
