<template>
  <n-flex class="search-part" justify="center" align="center">
    <n-input
      round
      placeholder="搜索"
      size="small"
      clearable
      autosize
      style="min-width: 50%; height: 24px; border-radius: 5px"
    >
      <template #prefix>
        <n-icon size="16px" :component="SearchOutline"></n-icon>
      </template>
    </n-input>
  </n-flex>
</template>

<script setup lang="ts">
import { SearchOutline } from '@vicons/ionicons5';
</script>

<style scoped lang="scss">
.search-part {
  height: 35px;
  background-color: var(--el-main-nav-bg-color);
}
</style>
