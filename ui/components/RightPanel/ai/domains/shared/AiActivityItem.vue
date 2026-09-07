<script setup lang="ts">
defineProps<{
  assistantName: string;
  label: string;
}>();
</script>

<template>
  <article
    role="status"
    aria-live="polite"
    class="flex items-center gap-2 py-1 text-xs text-muted"
    :aria-label="assistantName"
  >
    <UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin text-primary" />
    <span>{{ label }}</span>
  </article>
</template>
