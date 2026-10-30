<script setup lang="ts">
import { isChenSingleRoute } from "~/chen/v1/standalone";

const route = useRoute();
const single = computed(() => isChenSingleRoute(route.path));
const SingleAppShell = defineAsyncComponent(() => import("~/chen/v1/SingleAppShell.vue"));
const ManagedApp = defineAsyncComponent(() => import("~/components/ManagedApp.vue"));
</script>

<template>
  <ClientLockGuard>
    <SingleAppShell v-if="single" />
    <ManagedApp v-else />
  </ClientLockGuard>
</template>
