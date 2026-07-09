<script setup lang="ts">
defineProps<{
  icon?: string
  loading?: boolean
  message: string
}>();
</script>

<template>
  <div class="grid h-full place-items-center text-sm text-muted">
    <div class="flex max-w-md flex-col items-center gap-3 text-center">
      <UIcon
        :name="icon || (loading ? 'i-lucide-loader-circle' : 'i-lucide-database-zap')"
        class="size-6"
        :class="loading ? 'animate-spin' : ''"
      />
      <p>{{ message }}</p>
    </div>
  </div>
</template>
