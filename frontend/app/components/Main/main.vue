<script setup lang="ts"></script>

<template>
  <UCard
    variant="soft"
    class="w-full"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
    }"
  >
    <Operation />

    <slot />
  </UCard>
</template>
