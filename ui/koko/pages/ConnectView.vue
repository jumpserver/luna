<script setup lang="ts">
import KokoDrawer from "~/koko/components/Drawer/index.vue";
import KokoTerminal from "~/koko/components/Terminal/index.vue";
import KokoTerminalProvider from "~/koko/components/TerminalProvider/index.vue";
import "@xterm/xterm/css/xterm.css";
</script>

<template>
  <div class="relative h-full w-full min-h-0">
    <KokoTerminalProvider>
      <template #terminal>
        <KokoTerminal />
      </template>
      <template #drawer>
        <KokoDrawer />
      </template>
    </KokoTerminalProvider>
  </div>
</template>
