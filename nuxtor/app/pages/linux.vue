<script setup lang="ts">
const page = ref(1);
</script>

<template>
  <UCard variant="subtle" class="w-full h-fit mt-4 space-y-4">
    <div
      class="grid grid-cols-2 gap-x-2 gap-y-2 h-[calc(100vh-270px)] overflow-y-auto p-2"
    >
      <template v-for="i in 10" :key="i">
        <UCard class="h-36" variant="outline" />
      </template>
    </div>

    <div class="flex justify-end mt-4">
      <UPagination v-model:page="page" :total="100" :page-count="10" />
    </div>
  </UCard>
</template>
