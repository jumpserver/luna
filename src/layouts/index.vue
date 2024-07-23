<template>
  <NavSearch />
  <n-layout has-sider class="custom-layout">
    <n-layout-header>
      <n-flex class="header-content" vertical align="center" justify="space-between">
        <SideTop />
        <SideBottom />
      </n-flex>
    </n-layout-header>
    <n-layout-sider
      v-draggable="sideWidth"
      bordered
      collapse-mode="width"
      show-trigger="arrow-circle"
      content-style="padding: 24px;"
      :width="sideWidth"
      :collapsed-width="0"
      :collapsed="isCollapsed"
      :show-collapsed-content="false"
      :native-scrollbar="false"
      class="relative transition-sider"
      :style="{
        width: sideWidth + 'px',
        maxWidth: '600px'
      }"
    >
      <FileManagement class="file-management" />
    </n-layout-sider>
    <MainContent />
  </n-layout>
  <SettingDrawer />
</template>

<script setup lang="ts">
import mittBus from '@/utils/mittBus.ts';
import SideTop from './components/Sidebar/sideTop.vue';
import NavSearch from './components/NavSearch/index.vue';
import MainContent from './components/MainContent/index.vue';
import SideBottom from './components/Sidebar/sideBottom.vue';
import SettingDrawer from './components/SettingDrawer/index.vue';
import FileManagement from './components/FileManagement/index.vue';

import { ref, onMounted, onUnmounted } from 'vue';
import { useTreeStore } from '@/stores/modules/tree.ts';
import { storeToRefs } from 'pinia';

const treeStore = useTreeStore();
const { isCollapsed } = storeToRefs(treeStore);

const sideWidth = ref(300);

const handleTriggerClick = () => {
  treeStore.changeCollapsed(!isCollapsed.value);
  if (!isCollapsed.value) {
    sideWidth.value = 300;
  } else {
    sideWidth.value = 0;
  }
};

mittBus.on('tree-click', handleTriggerClick);

onMounted(() => {
  const trigger = document.querySelector('.n-layout-toggle-button');
  if (trigger) {
    trigger.addEventListener('click', handleTriggerClick);
  }
});

onUnmounted(() => {
  mittBus.off('tree-click');
  const trigger = document.querySelector('.n-layout-toggle-button');
  if (trigger) {
    trigger.removeEventListener('click', handleTriggerClick);
  }
});
</script>

<style scoped lang="scss">
@import 'index';
</style>
