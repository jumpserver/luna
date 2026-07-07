<script setup lang="ts">
defineProps<{
  error?: string
  loading?: boolean
  loadingText: string
  ready: boolean
}>();
</script>

<template>
  <div class="h-full min-h-0 bg-default">
    <slot v-if="ready" />
    <div v-else class="grid h-full min-h-0 place-items-center text-sm text-muted">
      <div class="flex flex-col items-center gap-2">
        <UIcon
          :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
          class="size-5"
          :class="error ? 'text-amber-500' : 'animate-spin'"
        />
        <div>{{ loading ? loadingText : error || loadingText }}</div>
      </div>
    </div>
  </div>
</template>
