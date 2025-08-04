<script setup lang="ts">
const colorMode = useColorMode();
const clearSelectionCallback = ref<(() => void) | null>(null);

const providerClearSelection = (callback: () => void) => {
  clearSelectionCallback.value = callback;
};

const clearSelection = () => {
  if (clearSelectionCallback.value) {
    clearSelectionCallback.value();
  }
};

provide('providerClearSelection', providerClearSelection);
</script>

<template>
  <UCard
    variant="soft"
    class="w-full"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
      backgroundColor: colorMode.value === 'dark' ? '#201f22' : '#FAFAFA',
    }"
    :ui="{
      header: 'p-2',
      body: 'p-2 sm:p-4 px-4 py-2',
    }"
    @click="clearSelection"
  >
    <template #header>
      <Operation />
    </template>

    <slot />
  </UCard>
</template>
