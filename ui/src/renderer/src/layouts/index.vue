<script setup lang="ts">
import mittBus from '@renderer/eventBus';
import { useColor } from '@renderer/hooks/useColor';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Drawer from '@renderer/components/Drawer/index.vue';

import SideMenu from './components/SideMenu/index.vue';
import CustomHeader from './components/Header/index.vue';

const { lighten } = useColor();

const active = ref(false);
const collapsed = ref(false);

const handleCreateDrawer = () => {
  active.value = !active.value;
};

onMounted(() => {
  mittBus.on('createDrawer', handleCreateDrawer);
});

onBeforeUnmount(() => {
  mittBus.off('createDrawer', handleCreateDrawer);
});
</script>

<template>
  <n-layout>
    <n-layout-header>
      <CustomHeader />
    </n-layout-header>

    <n-layout has-sider>
      <n-layout-sider
        bordered
        show-trigger
        collapse-mode="width"
        :width="240"
        :collapsed="collapsed"
        :collapsed-width="64"
        class="h-full"
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <SideMenu :collapsed="collapsed" />
      </n-layout-sider>

      <n-layout>
        <n-layout-content :content-style="{ backgroundColor: lighten(1) }">
          <!-- <HeaderSection :active="active" />
          <n-loading-bar-provider>
            <router-view :active="active" />
            <div id="drawer-target"></div>
          </n-loading-bar-provider> -->
        </n-layout-content>
      </n-layout>
    </n-layout>
  </n-layout>
  <Drawer :active="active" />
</template>

<style scoped lang="scss">
@use './index.scss';
</style>
