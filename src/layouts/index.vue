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
        collapse-mode="width"
        :collapsed-width="0"
        :width="240"
        show-trigger="arrow-circle"
        content-style="padding: 24px;"
        bordered
      >
        <FileManagement class="file-management"></FileManagement>
      </n-layout-sider>
      <n-layout>
        <n-layout-header
          style="width: 100%; height: 40px; border-bottom: 1px solid #000000"
        ></n-layout-header>
      </n-layout>
    </n-layout>
  </n-space>
  <SettingDrawer />
</template>

<script setup lang="ts">
import HeaderLeft from './components/Header/headerLeft.vue';
import HeaderRight from './components/Header/headerRight.vue';
import FileManagement from './components/FileManagement/index.vue';
import SettingDrawer from './components/SettingDrawer/index.vue';

import { ref } from 'vue';
import { useLoadingStore } from '@/stores/modules/loading.ts';

const languageLoaded = ref(false);

const useLoading = useLoadingStore();
if (!useLoading.isLoading) {
  // updateTranslations 是一个异步的，而子组件的渲染是同步的，因此在子组件中直接使用 t 函数将会曝出警告
  setTimeout(() => {
    languageLoaded.value = true;
  }, 100);
}
</script>

<style scoped lang="scss">
@import 'index';
</style>
