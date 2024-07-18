<template>
  <n-button text @click="handleTreeIconClick">
    <svg-icon class="tree-icon" :name="name" :icon-style="iconStyle" />
  </n-button>
</template>

<script setup lang="ts">
import mittBus from '@/utils/mittBus.ts';
import SvgIcon from '@/components/SvgIcon/index.vue';

import { CSSProperties } from 'vue';

defineProps<{
  name: string;
  iconStyle: CSSProperties;
}>();

const handleTreeIconClick = () => {
  mittBus.emit('tree-click');
};
</script>

<style scoped lang="scss">
.tree-icon:hover {
  fill: var(--el-color-primary-light-1) !important;
}
</style>
