<script setup lang="ts">
import { KokoFileManagement } from "@jumpserver/koko";

definePageMeta({
  layout: "default",
  keepalive: true
});
</script>

<template>
  <KokoFileManagement global class="h-full min-h-0" />
</template>
