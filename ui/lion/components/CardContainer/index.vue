<script setup lang="ts">
defineProps<{
  title?: string;
}>();

const expanded = ref(true);
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <UButton block color="neutral" variant="ghost" class="justify-between px-0 text-left" @click="expanded = !expanded">
      <slot v-if="!title" name="custom-header" />
      <span v-else class="text-sm font-medium">{{ title }}</span>
      <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-left'" class="size-4" />
    </UButton>

    <div v-show="expanded" class="mt-3">
      <slot />
    </div>
  </UCard>
</template>
