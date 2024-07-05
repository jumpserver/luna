<template>
  <n-flex>
    <div class="action-item" v-for="(option, index) of options" :key="index">
      <n-dropdown trigger="hover" :options="option.children" :show-arrow="true">
        {{ option.label }}
      </n-dropdown>
    </div>
  </n-flex>
</template>

<script setup lang="ts">
import type { IActionOptions } from '../../types/index.ts';

const props = defineProps<{
  options: IActionOptions[];
}>();

console.log(props);
</script>

<style scoped lang="scss"></style>
