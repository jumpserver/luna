<script setup lang="ts">
definePageMeta({
  layout: "setting"
});

const route = useRoute();
</script>

<template>
  <Transition name="settings-section" mode="out-in">
    <NuxtPage :page-key="route.path" />
  </Transition>
</template>
