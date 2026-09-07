<script lang="ts" setup>
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
</script>

<template>
  <div class="h-dvh w-full overflow-hidden" :style="{ backgroundColor: 'var(--app-main-bg)' }">
    <slot />
    <KokoSftpTransferCenter />
  </div>
</template>
