<script lang="ts" setup></script>

<template>
  <UCard
    variant="outline"
    class="rounded-none overflow-visible"
    :ui="{
      header: 'p-0 sm:px-0',
      body: 'p-0 sm:p-0',
      footer: 'p-0 sm:p-0',
    }"
    style="background-color: transparent"
  >
    <div class="flex gap-0 w-full h-screen">
      <SideBar />

      <Main class="flex-1 min-w-0">
        <slot />
      </Main>
    </div>
  </UCard>
</template>
