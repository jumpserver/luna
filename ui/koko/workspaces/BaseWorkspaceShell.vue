<script setup lang="ts">
defineProps<{
  error?: string;
  loading?: boolean;
  loadingText: string;
  ready: boolean;
}>();
</script>

<template>
  <div class="h-full min-h-0 bg-default">
    <slot v-if="ready" />
    <div v-else-if="error" class="grid h-full min-h-0 place-items-center text-sm text-muted">
      <div class="flex flex-col items-center gap-2">
        <UIcon name="i-lucide-circle-alert" class="size-5 text-amber-500" />
        <div>{{ error }}</div>
        <slot name="error-actions" />
      </div>
    </div>
  </div>
</template>
