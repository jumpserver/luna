<script setup lang="ts">
const { t } = useI18n();
const { pending, dismiss } = useClientCompatibility();
const certificateDetailsOpen = ref(false);
const open = computed({
  get: () => pending.value?.reason === "tls",
  set: (value) => {
    if (!value) dismiss();
  }
});
watch(pending, () => {
  certificateDetailsOpen.value = false;
});
</script>

<template>
  <ModalMessageDialog
    v-model:open="open"
    :title="t('SiteCertificate.ConnectionFailedTitle')"
    :ui="{
      description: 'flex flex-wrap items-center gap-x-2 gap-y-1'
    }"
  >
    <template #description>
      <span class="break-all">{{ pending?.site }}</span>
      <UButton color="neutral" variant="link" size="sm" class="shrink-0 p-0" @click="certificateDetailsOpen = true">
        {{ t("SiteCertificate.ViewCertificate") }}
      </UButton>
    </template>
    <template #body>
      <p class="text-sm leading-6 text-muted">{{ t("SiteCertificate.ConnectionFailed") }}</p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="dismiss">{{ t("Common.Close") }}</UButton>
    </template>
  </ModalMessageDialog>
  <SiteCertificateDetails v-model:open="certificateDetailsOpen" :site="pending?.site || ''" />
</template>
