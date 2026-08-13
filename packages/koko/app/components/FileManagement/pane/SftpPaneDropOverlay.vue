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
      <UIcon :name="icon" />
      <span>
        {{ t("koko.fileManagement.copyTo") }}
        <strong>{{ endpointLabel }}</strong>
        <span v-if="path && releaseHint">
          ·
          <span class="font-ui-mono">{{ path }}</span>
        </span>
      </span>
    </div>
    <p v-if="releaseHint" class="font-ui-mono">{{ t("koko.fileManagement.releaseToCurrentDirectory") }}</p>
    <p v-else-if="path" class="font-ui-mono">{{ path }}</p>
  </div>
  <div v-else-if="blocked" class="sftp-transfer-drop-target sftp-transfer-drop-target--blocked" aria-hidden="true">
    <div class="sftp-transfer-drop-target__label">
      <UIcon name="i-lucide-ban" />
      <span>{{ t("koko.fileManagement.dropSameEndpoint") }}</span>
    </div>
  </div>
</template>
