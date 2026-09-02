<script setup lang="ts">
import { createKokoTerminalContext, kokoTerminalContextKey } from "#koko/context/terminalContext";

const terminalContext = createKokoTerminalContext();

provide(kokoTerminalContextKey, terminalContext);
terminalContext.initialize();

onUnmounted(() => {
  terminalContext.cleanup();
});
</script>

<template>
  <div class="h-full w-full min-h-0">
    <slot name="terminal" />
    <slot name="drawer" />
  </div>
</template>
