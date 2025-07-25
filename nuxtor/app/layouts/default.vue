<script lang="ts" setup></script>

<template>
  <div class="flex flex-col">
    <div class="flex gap-8 w-full">
      <SideBar
        class="flex-shrink-0 w-80 min-w-64 max-w-96 lg:w-80 md:w-72 sm:w-64"
      />

      <Main class="flex-1 min-w-0">
        <slot />
      </Main>
    </div>

    <Version />
  </div>
</template>
