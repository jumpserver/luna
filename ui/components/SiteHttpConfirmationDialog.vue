<script setup lang="ts">
import { finishHttpConnectionConfirmation, pendingHttpConnection } from "~/shared/desktop/httpConfirmation";

const { t } = useI18n();
const open = computed({
  get: () => pendingHttpConnection.value !== null,
  set: (value) => {
    if (!value) finishHttpConnectionConfirmation();
  }
});

onBeforeUnmount(() => finishHttpConnectionConfirmation());
</script>

<template>
  <ModalMessageDialog v-if="open" v-model:open="open" :title="t('SiteCertificate.HttpTitle')">
    <template #body>
      <p class="break-words text-sm leading-5 text-muted">
        {{ t("SiteCertificate.HttpDescription", { site: pendingHttpConnection?.origin || "" }) }}
      </p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="finishHttpConnectionConfirmation()">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton color="warning" @click="finishHttpConnectionConfirmation(true)">
        {{ t("SiteCertificate.HttpContinue") }}
      </UButton>
    </template>
  </ModalMessageDialog>
</template>
