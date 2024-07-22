<template>
  <n-flex class="h-[35px] search-part" justify="center" align="center">
    <n-icon color="#CCCCCC" size="16px" :component="ArrowBack" />
    <n-icon color="#CCCCCC" size="16px" :component="ArrowForward" />
    <n-input
      round
      placeholder="搜索"
      size="small"
      clearable
      autosize
      class="h-[24px] min-w-[50%] rounded-[5px] min-w-1/2"
    >
      <template #prefix>
        <n-icon size="16px" :component="SearchOutline"></n-icon>
      </template>
    </n-input>
  </n-flex>
</template>

<script setup lang="ts">
import { SearchOutline, ArrowBack, ArrowForward } from '@vicons/ionicons5';
</script>

<style scoped lang="scss">
.search-part {
  background-color: var(--el-main-nav-bg-color);
}
</style>
