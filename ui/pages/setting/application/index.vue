<script setup lang="ts">
definePageMeta({
  redirect: "/setting/application/ssh"
});

const { t } = useI18n();
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <UEmpty icon="i-lucide-panels-top-left" size="sm" variant="naked" :title="t('Common.SelectFromMenu')" />
  </div>
</template>
