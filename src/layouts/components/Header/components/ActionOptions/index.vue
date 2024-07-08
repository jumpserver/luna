<template>
  <n-flex align="center">
    <n-flex
      align="center"
      justify="center"
      class="action-item"
      v-for="(option, index) of options"
      :key="index"
    >
      <n-dropdown trigger="hover" :options="option.children" :show-arrow="true">
        {{ option.label }}
      </n-dropdown>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import type { IActionOptions } from '../../types/index.ts';

const props = defineProps<{
  options: IActionOptions[];
}>();

console.log(props);
</script>

<style scoped lang="scss">
.n-flex {
  height: 35px;
  .action-item {
    height: 100%;
    cursor: pointer;
    &:hover {
      background-color: #1ab394;
    }
  }
}
:lang(en) {
  .action-item {
    min-width: 100px;
  }
}
</style>
