<script setup lang="ts">
defineProps<{
  sidebarWidth?: string
}>();
</script>

<template>
  <div class="workspace-shell flex h-screen w-full min-w-0 flex-col overflow-hidden border-none">
    <div class="workspace-shell__header shrink-0">
      <slot name="header" />
    </div>

    <div class="workspace-shell__body flex min-h-0 flex-1">
      <aside
        v-if="$slots.sidebar"
        class="workspace-shell__sidebar min-h-0 shrink-0"
        :style="{ width: sidebarWidth }"
      >
        <slot name="sidebar" />
      </aside>

      <main class="workspace-shell__main min-w-0 flex-1 min-h-0">
        <slot />
      </main>
    </div>

    <div v-if="$slots.footer" class="workspace-shell__footer shrink-0">
      <slot name="footer" />
    </div>
  </div>
</template>
