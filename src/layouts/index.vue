<template>
  <n-space vertical size="large">
    <n-layout>
      <n-layout-header>
        <n-flex class="header-content" align="center" justify="space-between">
          <header-left></header-left>
          <header-right></header-right>
        </n-flex>
      </n-layout-header>
      <n-layout-content content-style="padding: 24px;"> 平山道 </n-layout-content>
      <n-layout-footer></n-layout-footer>
    </n-layout>
  </n-space>
</template>

<script setup lang="ts">
import HeaderLeft from './components/Header/headerLeft.vue';
import HeaderRight from './components/Header/headerRight.vue';
</script>

<style scoped lang="scss">
@import 'index.scss';
</style>
