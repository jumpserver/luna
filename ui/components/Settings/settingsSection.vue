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
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 :id="headingId" class="text-sm font-semibold text-highlighted">
            <slot name="title">{{ props.title }}</slot>
          </h2>
          <slot name="title-suffix" />
        </div>
        <p v-if="props.description" class="mt-1 max-w-[70%] text-xs text-muted">{{ props.description }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
