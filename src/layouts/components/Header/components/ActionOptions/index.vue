<template>
  <n-flex align="center">
    <n-flex
      align="center"
      justify="center"
      class="action-item"
      v-for="(option, index) of options"
      :key="index"
    >
      <n-dropdown
        trigger="hover"
        :options="option.children"
        :show-arrow="true"
        @select="handleSelect"
      >
        <n-button quaternary>{{ option.label }}</n-button>
      </n-dropdown>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import type { IActionOptions } from '../../types/index.ts';

defineProps<{
  options: IActionOptions[];
}>();

const handleSelect = (...args: any) => {
  const { click } = args[1];
  click();
};
</script>

<style scoped lang="scss">
:lang(en) {
  .action-item {
    min-width: 115px;
  }
}
</style>
