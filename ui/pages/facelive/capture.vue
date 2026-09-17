<script setup lang="ts">
import FaceTokenCapture from "~/components/Face/FaceTokenCapture.vue";

definePageMeta({ layout: false });

const route = useRoute();
const token = computed(() => {
  const value = route.query.token;
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
});
const siteUrl = computed(() => {
  const value = route.query.site;
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
});
</script>

<template>
  <main class="h-dvh min-h-[420px] overflow-hidden bg-default">
    <FaceTokenCapture :token="token" :site-url="siteUrl" mode="capture" />
  </main>
</template>
