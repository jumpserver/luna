<template>
  <n-flex class="h-[35px] search-part" justify="start" align="center">
    <n-image
      lazy
      :src="globalStore.interface.logo_logout"
      alt="Logo 图片"
      class="h-8 w-8 ml-[5px] justify-center object-fill hover: cursor-pointer"
    >
    </n-image>
  </n-flex>
</template>

<script setup lang="ts">
import { useGlobalStore } from '@/stores/modules/global';

const globalStore = useGlobalStore();
</script>

<style scoped lang="scss">
.search-part {
  background-color: var(--el-main-nav-bg-color);
}
</style>
