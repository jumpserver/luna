<script setup lang="ts">
defineProps<{
  assistantName: string;
  label: string;
}>();
</script>

<template>
  <article role="status" aria-live="polite" class="flex gap-2">
    <span class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary">
      <UIcon name="i-lucide-sparkles" class="size-3.5" />
    </span>
    <div class="min-w-0 max-w-[88%]">
      <div class="text-[10px] text-muted">{{ assistantName }}</div>
      <div
        class="mt-1 flex items-center gap-2 rounded-xl rounded-tl-sm border border-default bg-elevated px-2.5 py-2 text-[11px] text-muted"
      >
        <UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin text-primary" />
        <span>{{ label }}</span>
      </div>
    </div>
  </article>
</template>
