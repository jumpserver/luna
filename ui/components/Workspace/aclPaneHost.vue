<script setup lang="ts">
import AclDialogContent from "~/components/Modal/aclDialogContent.vue";

const props = defineProps<{ scopeId: string }>();
const { t } = useI18n();
const { groupForScope, submit, close, closeScope } = useAclDialog();
const { closePane } = useWorkspaceTabs();
const group = groupForScope(props.scopeId);
const { description, hasPending, isActionable, isBusy, isReview, title } = useAclDialogPresentation(group);

const handleClose = async () => {
  if (!group.value) return;
  await close(group.value);
  await closePane(props.scopeId);
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
    :portal="false"
    :ui="{
      overlay: '!absolute z-20 !bg-[var(--workspace-surface-background)] backdrop-blur-none',
      content:
        '!absolute z-20 w-[calc(100%-3rem)] max-w-[640px] bg-[var(--workspace-surface-panel)] divide-[var(--app-border)] ring-[var(--app-border)]',
      header: 'h-11 min-h-11 bg-[var(--workspace-surface-header)] px-4 py-0 sm:px-4 sm:py-0',
      title: 'text-sm leading-5',
      body: 'bg-[var(--app-surface-panel-strong)] px-6 py-4 sm:px-6 sm:py-4',
      footer: 'justify-end gap-2 bg-[var(--workspace-surface-footer)] px-5 py-3 sm:px-5 sm:py-3'
    }"
  >
    <template #body>
      <UAlert
        v-if="isReview && !group.submitted"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="description"
        class="mb-4"
      />
      <p v-else class="mb-4 text-sm text-[var(--app-text-secondary)]">{{ description }}</p>
      <AclDialogContent :group="group" embedded :chrome="false" />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :disabled="isBusy" @click="handleClose">
        {{ isActionable && (!group.submitted || hasPending) ? t("Common.Cancel") : t("ToolTips.Close") }}
      </UButton>
      <UButton v-if="isActionable && !group.submitted" :loading="isBusy" @click="handleSubmit">
        {{ t("Common.Confirm") }}
      </UButton>
    </template>
  </UModal>
</template>
