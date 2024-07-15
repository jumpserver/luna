<template>
  <n-layout-content class="main-content" content-style="padding: 24px;">
    <n-list class="tips" :show-divider="false">
      <n-list-item v-for="(tip, index) of systemTips" :key="index">
        <n-tag type="success" size="large" round>{{ tip.action }}</n-tag>
        {{ tip.content }}
      </n-list-item>
    </n-list>
  </n-layout-content>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const systemTips = reactive([
  {
    content: 'Reselect connection method',
    action: 'Right click asset'
  },
  {
    content: 'Expand all asset',
    action: 'Right click node'
  },
  {
    content: 'Asset tree loading method',
    action: 'Settings or basic settings'
  },
  {
    content: 'Download the latest client',
    action: 'Help or download'
  },
  {
    content: 'Keyboard keys',
    action: 'Keyboard switch session'
  }
]);
</script>

<style scoped lang="scss">
.main-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100% - 40px);
  :deep(.n-layout-scroll-container) {
    display: flex;
    align-items: center;
  }
}
</style>
