<script setup lang="ts">
const props = defineProps<{
  title: string;
  description?: string;
}>();

const headingId = useId();
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <h2 :id="headingId" class="text-sm font-semibold text-highlighted">{{ props.title }}</h2>
        <p v-if="props.description" class="mt-1 text-xs text-muted">{{ props.description }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
