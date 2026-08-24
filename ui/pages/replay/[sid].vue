<script setup lang="ts">
import { ReplayView } from "@jumpserver/online-player";

definePageMeta({
  layout: "connect"
});

const route = useRoute();
const blocked = computed(() => route.meta.replayBlocked === true);
</script>

<template>
  <ReplayView :blocked="blocked" />
</template>
