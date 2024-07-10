<template>
  <n-dropdown trigger="hover" :show-arrow="true" placement="right" :options="options">
    <svg-icon :name="name" :icon-style="iconStyle" />
  </n-dropdown>
</template>

<script setup lang="ts">
import { CSSProperties } from 'vue';
import { optionsDetail } from '@/layouts/components/Header/types';

import SvgIcon from '@/components/SvgIcon/index.vue';

defineProps<{
  name: string;
  options: optionsDetail[];
  iconStyle: CSSProperties;
}>();
</script>
