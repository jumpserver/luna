<script setup lang="ts">
const colorMode = useColorMode();
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
    }"
  >
    <template #header>
      <Operation />
    </template>

    <slot />
  </UCard>
</template>
