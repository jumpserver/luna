<script setup lang="ts">
definePageMeta({
  layout: "setting",
  redirect: "/setting/application/ssh"
});

const { t } = useI18n();
</script>

<template>
  <div class="h-full flex items-center justify-center text-sm text-gray-500">
    {{ t("Common.SelectFromMenu") }}
  </div>
</template>
