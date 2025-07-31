<script setup lang="ts">
const page = ref(1);
</script>

<template>
  <!-- <UCard variant="subtle" class="w-full h-fit space-y-4">
    <div class="grid grid-cols-2 gap-x-2 gap-y-2 overflow-y-auto p-2">
      <template v-for="i in 10" :key="i">
        <GridCard />
      </template>
    </div>
  </UCard> -->

  <div class="grid grid-cols-2 gap-x-2 gap-y-2 overflow-y-auto p-2">
    <template v-for="i in 10" :key="i">
      <GridCard />
    </template>
  </div>
</template>
