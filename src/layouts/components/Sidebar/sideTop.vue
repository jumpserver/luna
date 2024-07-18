<template>
  <n-flex justify="center" align="center" class="top-item">
    <logo :logo-image="logoImage || ''" />
    <n-flex justify="center" align="center">
      <template v-for="option of topIconOptions" :key="option.name">
        <component :is="option.component" :name="option.name" :icon-style="option.iconStyle" />
      </template>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import { useGlobalStore } from '@/stores/modules/global';

import Logo from './components/Logo/index.vue';
import Tree from './components/Tree/index.vue';
import Organization from './components/Organization/index.vue';

import type { CSSProperties } from 'vue';

const globalStore = useGlobalStore();

const iconStyle: CSSProperties = {
  fill: '#646A73',
  width: '30px',
  height: '30px',
  transition: 'fill 0.3s'
};

const topIconOptions = [
  {
    iconStyle,
    name: 'tree',
    component: Tree
  },
  {
    iconStyle,
    name: 'organize',
    component: Organization
  }
];

const logoImage = globalStore.interface.logo_logout;
</script>

<style scoped lang="scss">
.top-item {
  gap: 20px 12px !important;
  width: 100%;
  margin-top: 25px;
  cursor: pointer;
  :deep(.n-flex) {
    gap: 20px 12px !important;
    width: 100%;
  }
}
</style>
