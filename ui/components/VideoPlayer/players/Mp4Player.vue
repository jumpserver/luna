<script setup lang="ts">
defineProps<{
  source: string
}>();
</script>

<template>
  <video class="h-full w-full bg-black object-contain" controls autoplay playsinline>
    <source :src="source" type="video/mp4">
  </video>
</template>
