<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex items-center justify-between gap-6 px-4 py-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5">
    <div class="min-w-0">
      <p class="text-sm font-medium text-highlighted">{{ title }}</p>
      <p v-if="description" class="mt-0.5 text-xs leading-5 text-muted">{{ description }}</p>
    </div>
    <div class="flex shrink-0 items-center max-sm:w-full">
      <slot />
    </div>
  </div>
</template>
