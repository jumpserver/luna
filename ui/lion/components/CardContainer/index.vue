<script setup lang="ts">
defineProps<{
  title?: string
}>();

const expanded = ref(true);
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 text-left"
      @click="expanded = !expanded"
    >
      <slot v-if="!title" name="custom-header" />
      <span v-else class="text-sm font-medium">{{ title }}</span>
      <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-left'" class="size-4" />
    </button>

    <div v-show="expanded" class="mt-3">
      <slot />
    </div>
  </UCard>
</template>
