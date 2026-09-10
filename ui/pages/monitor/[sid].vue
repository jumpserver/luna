<script setup lang="ts">
import SessionMonitor from "~/components/Monitor/SessionMonitor.vue";

definePageMeta({ layout: "connect" });
const route = useRoute();
</script>

<template>
  <SessionMonitor
    :key="String(route.params.sid)"
    :session-id="String(route.params.sid || '')"
    :ticket-id="String(route.query.ticket_id || '')"
    :org-id="String(route.query.oid || route.query.org || '') || undefined"
  />
</template>
