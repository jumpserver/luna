<script setup lang="ts">
defineProps({
  iconName: {
    type: String,
    required: true,
  },
});
</script>

<template>
  <svg aria-hidden="true" class="w-4 h-4" :style="{ color: '#fff', fill: '#fff' }">
    <use :xlink:href="`#${iconName}`" />
  </svg>
</template>
