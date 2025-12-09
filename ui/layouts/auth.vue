<script setup lang="ts">
const { userTheme } = useThemeAdapter();

const rootBgClass = computed(() => (userTheme.value === "dark" ? "bg-[#1c1c1e]" : "bg-gray-50"));
</script>

<template>
  <div class="flex flex-col w-full h-full" :class="rootBgClass">
    <header data-tauri-drag-region class="flex items-center w-full h-8" />
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
