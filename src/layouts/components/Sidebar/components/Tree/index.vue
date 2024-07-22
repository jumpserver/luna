<template>
  <n-button text @click="handleTreeIconClick" :class="isCollapsed ? '' : 'icon-wrapper'">
    <svg-icon class="tree-icon" :name="name" :icon-style="iconStyle" />
  </n-button>
</template>

<script setup lang="ts">
import mittBus from '@/utils/mittBus.ts';
import SvgIcon from '@/components/SvgIcon/index.vue';

import { storeToRefs } from 'pinia';
import { CSSProperties } from 'vue';
import { useTreeStore } from '@/stores/modules/tree.ts';

defineProps<{
  name: string;
  iconStyle: CSSProperties;
}>();

const treeStore = useTreeStore();
const { isCollapsed } = storeToRefs(treeStore);

const handleTreeIconClick = () => {
  mittBus.emit('tree-click');
};
</script>

<style scoped lang="scss">
.icon-wrapper {
  position: relative;
  width: 100%;
  .tree-icon {
    fill: var(--el-color-primary-light-1) !important;
  }
  &::before {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    width: 2px;
    height: 100%;
    content: '';
    background-color: var(--el-color-primary-light-1);
  }
}
</style>
