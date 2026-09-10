<script setup lang="ts">
import SessionMonitor from "~/components/Monitor/SessionMonitor.vue";

definePageMeta({
  layout: "connect"
});
const route = useRoute();
</script>

<template>
  <SessionMonitor
    :key="String(route.query.session)"
    :session-id="String(route.query.session || '')"
    :ticket-id="String(route.query.ticket_id || '')"
    :org-id="String(route.query.oid || route.query.org || '') || undefined"
  />
</template>
