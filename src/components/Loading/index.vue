<template>
  <n-spin :show="isLoading">
    <template #description> Loading </template>
    <slot name="default"></slot>
  </n-spin>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useLoadingStore } from '@/stores/modules/loading.ts';

const loadingStore = useLoadingStore();

const { isLoading } = storeToRefs(loadingStore);
</script>

<style scoped lang="scss"></style>
