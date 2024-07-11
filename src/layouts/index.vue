<template>
  <n-space vertical size="large">
    <n-layout has-sider class="custom-layout">
      <n-layout-header>
        <n-flex class="header-content" vertical align="center" justify="space-between">
          <header-left v-if="languageLoaded"></header-left>
          <header-right></header-right>
        </n-flex>
      </n-layout-header>
      <n-layout-sider
        ref="siderRef"
        collapse-mode="width"
        :show-collapsed-content="false"
        :collapsed="isCollapsed"
        :collapsed-width="0"
        :width="240"
        show-trigger="arrow-circle"
        content-style="padding: 24px;"
        bordered
        @trigger-click="handleTriggerClick"
      >
        <FileManagement class="file-management"></FileManagement>
      </n-layout-sider>
      <main-content></main-content>
    </n-layout>
  </n-space>
  <SettingDrawer />
</template>

<script setup lang="ts">
import HeaderLeft from './components/Header/headerLeft.vue';
import HeaderRight from './components/Header/headerRight.vue';
import MainContent from './components/MainContent/index.vue';
import FileManagement from './components/FileManagement/index.vue';
import SettingDrawer from './components/SettingDrawer/index.vue';

import { onUnmounted, ref, onMounted } from 'vue';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import mittBus from '@/utils/mittBus.ts';

const languageLoaded = ref(false);

const isCollapsed = ref(false);

const useLoading = useLoadingStore();
if (!useLoading.isLoading) {
  // updateTranslations 是一个异步的，而子组件的渲染是同步的，因此在子组件中直接使用 t 函数将会曝出警告
  setTimeout(() => {
    languageLoaded.value = true;
  }, 100);
}

const siderRef = ref(null);

mittBus.on('treeClick', () => {
  isCollapsed.value = !isCollapsed.value;
});

const handleTriggerClick = () => {
  isCollapsed.value = !isCollapsed.value;
};

onMounted(() => {
  const trigger = document.querySelector('.n-layout-toggle-button');
  if (trigger) {
    trigger.addEventListener('click', handleTriggerClick);
  }
});

onUnmounted(() => {
  mittBus.off('treeClick');
  const trigger = document.querySelector('.n-layout-toggle-button');
  if (trigger) {
    trigger.removeEventListener('click', handleTriggerClick);
  }
});
</script>

<style scoped lang="scss">
@import 'index';
</style>
