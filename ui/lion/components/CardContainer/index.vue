<script setup lang="ts">
import { ChevronDown, ChevronLeft } from "lucide-vue-next";

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
      <ChevronLeft v-if="!expanded" :size="16" />
      <ChevronDown v-else :size="16" />
    </button>

    <div v-show="expanded" class="mt-3">
      <slot />
    </div>
  </UCard>
</template>
