<script setup lang="ts"></script>

<template>
  <div class="flex flex-col items-center w-full py-2">
    <MainHeader />

    <UCard
      variant="soft"
      class="w-full h-[calc(100vh-40px)] mt-2"
      :style="{
        borderTopRightRadius: '0px',
        borderTopLeftRadius: '0px',
      }"
    >
      <Operation />

      <slot />
    </UCard>
  </div>
</template>
