<script lang="ts" setup>
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
</script>

<template>
  <div class="flex h-dvh w-full flex-col overflow-hidden" :style="{ backgroundColor: 'var(--app-main-bg)' }">
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
    </div>
    <KokoSftpTransferCenter />
  </div>
</template>
