<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const speed = defineModel<number>({ default: 1 });

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

const items = computed<DropdownMenuItem[][]>(() => [
  SPEEDS.map((item) => ({
    label: `${item.toFixed(1)}×`,
    icon: item === speed.value ? "i-lucide-check" : undefined,
    onSelect() {
      speed.value = item;
    }
  }))
]);
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      class="min-w-[46px] justify-center font-mono text-[11.5px] font-normal tabular"
      :label="`${speed.toFixed(1)}×`"
    />
  </UDropdownMenu>
</template>
