<script setup lang="ts">
import AclDialogContent from "~/components/Modal/aclDialogContent.vue";

const { globalGroup, isOpen, submit, close } = useAclDialog();
const { t } = useI18n();
const {
  canSubmit,
  description,
  isActionable,
  isBusy,
  isPushFailed,
  isUnavailable,
  isReviewApproved,
  isReviewDeclined,
  reviewContinueLabel,
  submitLabel,
  title
} = useAclDialogPresentation(globalGroup);
const handleClose = () => {
  if (globalGroup.value) void close(globalGroup.value);
};
const handleSubmit = () => {
  if (globalGroup.value) void submit(globalGroup.value);
};
</script>

<template>
  <UModal
    v-if="globalGroup"
    :open="isOpen"
    :title="title"
    :dismissible="false"
    :close="false"
    :ui="{
      content:
        'w-[calc(100vw-3rem)] max-w-[640px] max-h-[calc(100dvh-2rem)] bg-(--workspace-surface-panel) divide-(--app-border) ring-(--app-border)',
      header: 'h-11 min-h-11 bg-(--workspace-surface-header) px-4 py-0 sm:px-4 sm:py-0',
      title: 'text-sm leading-5',
      body: 'min-h-0 max-h-[min(65dvh,36rem)] overflow-y-auto bg-(--app-surface-panel-strong) px-6 py-4 sm:px-6 sm:py-4',
      footer: 'flex-wrap justify-end gap-2 bg-(--workspace-surface-footer) px-5 py-3 sm:px-5 sm:py-3'
    }"
  >
    <template #body>
      <p v-if="!isActionable && description" class="mb-4 text-sm text-(--app-text-secondary)">{{ description }}</p>
      <AclDialogContent v-if="globalGroup" :group="globalGroup" />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="handleClose">
        {{ t(isActionable && !isUnavailable && !isReviewDeclined ? "Common.Cancel" : "ToolTips.Close") }}
      </UButton>
      <UButton v-if="isReviewApproved" class="shrink-0 tabular-nums" disabled aria-live="polite">
        {{ reviewContinueLabel }} ({{ globalGroup.reviewApprovedCountdown }})
      </UButton>
      <UButton
        v-if="isActionable && !isPushFailed && !isUnavailable && !isReviewApproved && !isReviewDeclined"
        :loading="isBusy"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ submitLabel }}
      </UButton>
    </template>
  </UModal>
</template>
