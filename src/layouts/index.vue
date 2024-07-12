<template>
  <n-space vertical size="large">
    <n-layout has-sider class="custom-layout">
      <n-layout-header>
        <n-flex class="header-content" vertical align="center" justify="space-between">
          <HeaderLeft v-if="languageLoaded" />
          <HeaderRight />
        </n-flex>
      </n-layout-header>
      <n-layout-sider
        v-draggable="sideWidth"
        ref="sideRef"
        bordered
        collapse-mode="width"
        show-trigger="arrow-circle"
        content-style="padding: 24px;"
        :width="sideWidth"
        :collapsed-width="0"
        :collapsed="isCollapsed"
        :show-collapsed-content="false"
        :style="{
          width: sideWidth + 'px',
          maxWidth: '600px',
          transition: 'width 0.5s ease-in-out'
        }"
      >
        <FileManagement class="file-management" />
      </n-layout-sider>
      <MainContent />
    </n-layout>
  </n-space>
  <SettingDrawer />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import HeaderLeft from './components/Header/headerLeft.vue';
import HeaderRight from './components/Header/headerRight.vue';
import MainContent from './components/MainContent/index.vue';
import FileManagement from './components/FileManagement/index.vue';
import SettingDrawer from './components/SettingDrawer/index.vue';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import mittBus from '@/utils/mittBus.ts';

const sideWidth = ref(300);
const isCollapsed = ref(false);
const languageLoaded = ref(false);

const useLoading = useLoadingStore();
if (!useLoading.isLoading) {
  // updateTranslations 是一个异步的，而子组件的渲染是同步的，因此在子组件中直接使用 t 函数将会曝出警告
  setTimeout(() => {
    languageLoaded.value = true;
  }, 100);
}

const handleTriggerClick = () => {
  sideWidth.value = 0;
  isCollapsed.value = !isCollapsed.value;

  if (!isCollapsed.value) {
    sideWidth.value = 300;
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

// 增加侧边栏右侧边缘拖动手柄的样式
.n-layout-sider {
  position: relative;
}
.n-layout-sider::after {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px; // 右侧边缘宽度
  height: 100%;
  cursor: ew-resize; // 鼠标悬停样式
  content: '';
}
</style>
