<script setup lang="ts">
const clearSelectionCallback = ref<(() => void) | null>(null);

const clearSelection = () => {
  if (clearSelectionCallback.value) {
    clearSelectionCallback.value();
  }
};

const providerClearSelection = (callback: () => void) => {
  clearSelectionCallback.value = callback;
};

const cardUi = computed(() => ({
  body: "p-0 sm:p-0 flex-1 min-h-0 overflow-hidden flex flex-col",
  root: "rounded-none h-full flex flex-col min-h-0"
}));

provide("providerClearSelection", providerClearSelection);
</script>

<template>
  <UCard
    variant="soft"
    class="flex h-full w-full min-h-0 flex-col"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      backgroundColor: 'var(--app-main-bg)',
      color: 'var(--app-fg)'
    }"
    :ui="cardUi"
    @click="clearSelection"
  >
    <slot />
  </UCard>
</template>
