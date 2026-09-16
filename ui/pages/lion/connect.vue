<script setup lang="ts">
import KokoSftpTransferCenter from "#koko/components/FileManagement/SftpTransferCenter.vue";
import ConnectView from "@/lion/views/ConnectView.vue";

definePageMeta({
  layout: "lion"
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1">
      <ConnectView />
    </div>
    <KokoSftpTransferCenter />
  </div>
</template>
