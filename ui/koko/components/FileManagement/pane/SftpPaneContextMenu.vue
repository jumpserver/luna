<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

defineProps<{
  open: boolean;
  items: DropdownMenuItem[];
  position: { x: number; y: number };
}>();

const emit = defineEmits<{ updateOpen: [open: boolean] }>();
</script>

<template>
  <UDropdownMenu
    :open="open"
    :items="items"
    size="sm"
    :content="{ align: 'start', side: 'bottom' }"
    @update:open="emit('updateOpen', $event)"
  >
    <div class="pointer-events-none fixed size-px" :style="{ left: `${position.x}px`, top: `${position.y}px` }" />
  </UDropdownMenu>
</template>
