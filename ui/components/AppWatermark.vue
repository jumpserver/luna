<script setup lang="ts">
const { enabled, options } = useAppWatermark();
</script>

<template>
  <Watermark v-if="enabled" class="pointer-events-none" :options="options" :model-value="enabled" :is-body="true" />
</template>
