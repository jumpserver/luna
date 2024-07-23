<template>
  <n-flex class="h-[35px] search-part" justify="start" align="center">
    <n-image
      lazy
      :src="globalStore.interface.logo_logout"
      alt="Logo 图片"
      class="h-8 w-8 ml-[5px] justify-center object-fill hover: cursor-pointer"
    >
    </n-image>
    <n-button-group size="small">
      <n-button
        text
        type="default"
        round
        class="button-item px-[10px] py-[5px] hover:border-[5px] justify-center"
      >
        文件
      </n-button>
      <n-button
        text
        type="default"
        round
        class="button-item px-[10px] py-[5px] hover:border-[5px] justify-center"
      >
        编辑
      </n-button>
      <n-button
        text
        type="default"
        round
        class="button-item px-[10px] py-[5px] hover:border-[5px] justify-center"
      >
        选择
      </n-button>
    </n-button-group>
  </n-flex>
</template>

<script setup lang="ts">
import { useGlobalStore } from '@/stores/modules/global';

const globalStore = useGlobalStore();
</script>

<style scoped lang="scss">
.search-part {
  background-color: var(--el-main-nav-bg-color);

  :deep(.button-item) {
    color: var(--el-main-tab-icon-color);

    &:hover {
      background-color: var(--el-main-tab-icon-hover-color);
      border-radius: 5px;
    }
  }
}
</style>
