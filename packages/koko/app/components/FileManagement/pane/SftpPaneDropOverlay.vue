<script setup lang="ts">
defineProps<{
  active: boolean;
  blocked: boolean;
  icon: string;
  endpointLabel: string;
  path?: string;
  releaseHint?: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <div v-if="active" class="sftp-transfer-drop-target" aria-hidden="true">
    <div class="sftp-transfer-drop-target__label">
      <UIcon :name="icon" class="sftp-transfer-drop-target__icon" />
      <span>
        {{ t("koko.fileManagement.copyTo") }}
        <strong>{{ endpointLabel }}</strong>
        <template v-if="path">
          ·
          <span class="sftp-transfer-drop-target__path">{{ path }}</span>
        </template>
      </span>
    </div>
    <p v-if="releaseHint" class="sftp-transfer-drop-target__hint">
      {{ t("koko.fileManagement.releaseToCurrentDirectory") }}
    </p>
    <p v-else-if="path" class="sftp-transfer-drop-target__hint sftp-transfer-drop-target__path">{{ path }}</p>
  </div>
  <div v-else-if="blocked" class="sftp-transfer-drop-target sftp-transfer-drop-target--blocked" aria-hidden="true">
    <div class="sftp-transfer-drop-target__label">
      <UIcon name="i-lucide-ban" class="sftp-transfer-drop-target__icon" />
      <span>{{ t("koko.fileManagement.dropSameEndpoint") }}</span>
    </div>
  </div>
</template>
