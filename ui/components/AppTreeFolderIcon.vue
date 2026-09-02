<script setup lang="ts">
withDefaults(
  defineProps<{
    open?: boolean;
  }>(),
  {
    open: false
  }
);
</script>

<template>
  <span class="theme-folder-icon" aria-hidden="true">
    <UIcon :name="open ? 'i-tabler-folder-open' : 'i-tabler-folder'" class="theme-folder-icon__outline" />
    <UIcon :name="open ? 'i-tabler-folder-open-filled' : 'i-tabler-folder-filled'" class="theme-folder-icon__filled" />
  </span>
</template>
