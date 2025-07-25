<script lang="ts" setup></script>

<template>
  <div class="flex flex-col">
    <div class="flex gap-0 w-full">
      <SideBar />

      <Main class="flex-1 min-w-0">
        <slot />
      </Main>
    </div>

    <!-- <Version /> -->
  </div>
</template>
