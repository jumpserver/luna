<script setup lang="ts"></script>

<template>
  <UCard
    variant="soft"
    class="w-full"
    :style="{
      borderTopRightRadius: '0px',
      borderTopLeftRadius: '0px',
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
