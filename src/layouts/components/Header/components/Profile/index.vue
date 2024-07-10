<template>
  <svg-icon :name="name" :icon-style="iconStyle"></svg-icon>
</template>

<script setup lang="ts">
import { CSSProperties } from 'vue';
import SvgIcon from '@/components/SvgIcon/index.vue';

defineProps<{
  name: string;
  iconStyle: CSSProperties;
}>();
</script>
