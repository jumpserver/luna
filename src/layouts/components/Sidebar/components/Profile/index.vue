<template>
  <n-dropdown
    trigger="hover"
    :show-arrow="true"
    placement="right"
    :options="options"
    @select="handleSelect"
  >
    <svg-icon class="tree-icon" :name="name" :icon-style="iconStyle" />
  </n-dropdown>
</template>

<script setup lang="ts">
import { CSSProperties } from 'vue';
import { optionsDetail } from '@/layouts/components/Sidebar/types';

import SvgIcon from '@/components/SvgIcon/index.vue';

defineProps<{
  name: string;
  options: optionsDetail[];
  iconStyle: CSSProperties;
}>();

const handleSelect = (...args: any) => {
  if (args[0] === 'logout') {
    args[1].onClink();
  }
};
</script>
