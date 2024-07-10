<template>
  <n-dropdown
    trigger="hover"
    :show-arrow="true"
    placement="right"
    :options="options"
    @select="handleSelect"
  >
    <svg-icon :name="name" :icon-style="iconStyle" />
  </n-dropdown>
</template>

<script setup lang="ts">
import { CSSProperties } from 'vue';
import { optionsDetail } from '@/layouts/components/Header/types';

import SvgIcon from '@/components/SvgIcon/index.vue';

const props = defineProps<{
  name: string;
  options: optionsDetail[];
  iconStyle: CSSProperties;
}>();

const handleSelect = (key: string) => {
  props.options.forEach(item => {
    // 类型收窄
    if (item.key === key && typeof item.onClink === 'function') {
      item.onClink();
    }
  });
};
</script>
