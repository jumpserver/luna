<script setup lang="ts">
defineProps<{
  sftpToken?: string
  showEmpty?: boolean
}>();

const emit = defineEmits<{ reconnect: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-8 text-sm text-muted">
    <UIcon :name="showEmpty ? 'i-lucide-circle-alert' : 'i-lucide-folder-open'" class="size-8" />
    <p v-if="showEmpty">
      {{ t("FileManagerExpired") || "File manager session expired" }}
    </p>
    <p v-else-if="!sftpToken">
      {{ t("PreparingFileManager") || "Preparing file manager..." }}
    </p>
    <p v-else>
      {{ t("FileManagerReady") || "File manager token ready" }} (stub)
    </p>
    <UButton v-if="showEmpty" color="primary" variant="soft" @click="emit('reconnect')">
      {{ t("Reconnect") || "Reconnect" }}
    </UButton>
  </div>
</template>
