<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    userAvator?: string | Component;
    username?: string;
    userSite?: string;
    userToken?: string;
  }>(),
  {
    userAvator: '',
    username: '-',
    userSite: '-',
    userToken: ''
  }
);
</script>

<template>
  <n-flex align="center" justify="start" class="w-full !flex-nowrap cursor-pointer group">
    <n-avatar round class="flex-shrink-0" :src="userAvator" />

    <n-flex align="center" vertical justify="start" class="w-full !flex-nowrap !gap-0">
      <n-text depth="1" strong class="cursor-pointer truncate font-medium text-sm">
        {{ username }}
      </n-text>

      <n-flex align="center" justify="start" class="flex-nowrap w-full">
        <n-text depth="3" class="text-xs">
          {{ userSite }}
        </n-text>
      </n-flex>
    </n-flex>
  </n-flex>
</template>

<style scoped>
:deep(.n-text) {
  width: 100%;
}
</style>
