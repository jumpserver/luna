<script setup lang="ts">
import AclDialogContent from "~/components/Modal/aclDialogContent.vue";

const props = defineProps<{ scopeId: string }>();
const { t } = useI18n();
const { groupForScope, submit, close, closeScope } = useAclDialog();
const { closePane, tabs } = useWorkspaceTabs();
const group = groupForScope(props.scopeId);
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
} = useAclDialogPresentation(group);

const handleClose = async () => {
  const current = group.value;
  if (!current) return;
  const pane = tabs.value.flatMap((tab) => tab.panes).find((item) => item.id === props.scopeId);
  // Only an initial connection owns the pane. Reconnecting can create another
  // scoped ACL request while the existing session and its SQL drafts stay open.
  const ownsInitialPane = current.items.some((item) => item.scopeId === props.scopeId) && pane && !pane.payload;
  const cancelling = close(current);
  if (ownsInitialPane) await closePane(props.scopeId);
  await cancelling;
};
const handleSubmit = () => {
  if (group.value) void submit(group.value);
};

onBeforeUnmount(() => {
  void closeScope(props.scopeId);
});
</script>

<template>
  <UModal
    v-if="group"
    :open="true"
    :title="title"
    :dismissible="false"
    :close="false"
    :modal="false"
    :portal="false"
    :ui="{
      overlay: '!absolute z-20 !bg-[var(--workspace-surface-background)] backdrop-blur-none',
      content:
        '!absolute z-20 w-[calc(100%-3rem)] max-w-[640px] !max-h-[calc(100%-2rem)] bg-[var(--workspace-surface-panel)] divide-[var(--app-border)] ring-[var(--app-border)]',
      header: 'h-11 min-h-11 bg-[var(--workspace-surface-header)] px-4 py-0 sm:px-4 sm:py-0',
      title: 'text-sm leading-5',
      body: 'min-h-0 max-h-[min(65dvh,36rem)] overflow-y-auto bg-[var(--app-surface-panel-strong)] px-6 py-4 sm:px-6 sm:py-4',
      footer: 'flex-wrap justify-end gap-2 bg-[var(--workspace-surface-footer)] px-5 py-3 sm:px-5 sm:py-3'
    }"
  >
    <template #body>
      <p v-if="!isActionable && description" class="mb-4 text-sm text-(--app-text-secondary)">{{ description }}</p>
      <AclDialogContent :group="group" />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="handleClose">
        {{ t(isActionable && !isUnavailable && !isReviewDeclined ? "Common.Cancel" : "ToolTips.Close") }}
      </UButton>
      <UButton v-if="isReviewApproved" class="shrink-0 tabular-nums" disabled aria-live="polite">
        {{ reviewContinueLabel }} ({{ group.reviewApprovedCountdown }})
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
