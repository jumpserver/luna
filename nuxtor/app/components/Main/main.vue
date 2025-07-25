<script setup lang="ts"></script>

<template>
  <div class="flex flex-col items-center w-full px-4 py-2">
    <MainHeader />

    <UCard class="w-full h-[calc(100vh-80px)] mt-2">
      <Operation />

      <slot />
    </UCard>
  </div>
</template>
