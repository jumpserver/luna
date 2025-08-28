<script setup lang="ts">
definePageMeta({
  layout: 'setting',
});
</script>

<template>
  <div>
    <template v-for="i in 1" :key="i">
      <SettingItems class="mt-2" />
    </template>
  </div>
</template>
