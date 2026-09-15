<script setup lang="ts">
const localePath = useLocalePath();

await navigateTo(localePath("videoplayer"), { replace: true });
</script>

<template>
  <div />
</template>
