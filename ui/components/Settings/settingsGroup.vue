<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    icon?: string;
    divided?: boolean;
    padded?: boolean;
    bodyClass?: string;
  }>(),
  {
    divided: true,
    padded: false
  }
);
</script>

<template>
  <UCard
    variant="outline"
    :ui="{
      root: 'rounded-[length:var(--app-radius)] bg-[var(--app-surface-card)] ring-[var(--app-border)]',
      body: [padded ? 'p-4 sm:p-4' : 'p-0 sm:p-0', divided ? 'divide-y divide-[var(--app-border)]' : '', bodyClass]
        .filter(Boolean)
        .join(' ')
    }"
  >
    <div v-if="title" class="flex items-center gap-2 px-4 py-3">
      <UIcon v-if="icon" :name="icon" class="size-4 text-muted" />
      <span class="text-sm font-semibold text-highlighted">{{ title }}</span>
    </div>
    <slot />
  </UCard>
</template>
