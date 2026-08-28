<script setup lang="ts">
const { enabled, options } = useAppWatermark();
const hostRef = useTemplateRef<HTMLElement>("host");
useDomWatermark(hostRef, enabled, options);
</script>

<template>
  <div v-show="enabled" ref="host" class="pointer-events-none fixed inset-0 z-[1000]" />
</template>
