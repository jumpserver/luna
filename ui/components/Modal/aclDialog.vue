<script setup lang="ts">
import AclDialogContent from "~/components/Modal/aclDialogContent.vue";

const { globalGroup, isOpen } = useAclDialog();
const { t } = useI18n();
const minimized = ref(false);
const canMinimize = computed(() => globalGroup.value?.code === "acl_review");
const activeCount = computed(
  () =>
    globalGroup.value?.items.filter((item) => ["ready", "submitting", "pending", "verifying"].includes(item.status))
      .length || 0
);
const minimizedDescription = computed(() => {
  const group = globalGroup.value;
  if (!group) return "";
  if (activeCount.value > 0) {
    return t(group.submitted ? "AclDialog.MinimizedPending" : "AclDialog.MinimizedReady", {
      count: activeCount.value
    });
  }
  return t("AclDialog.MinimizedFinished", { count: group.items.length });
});

watch(
  () => globalGroup.value?.id,
  (id, previousId) => {
    if (!id || (previousId && id !== previousId)) minimized.value = false;
  }
);
</script>

<template>
  <UModal :open="isOpen && !minimized" :dismissible="false" :close="false" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <AclDialogContent
        v-if="globalGroup"
        :group="globalGroup"
        :minimizable="canMinimize"
        @minimize="minimized = true"
      />
    </template>
  </UModal>

  <UButton
    v-if="isOpen && minimized && globalGroup"
    color="neutral"
    variant="outline"
    class="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] cursor-pointer items-center justify-start gap-3 rounded-lg border-[var(--app-border)] bg-[var(--app-panel-bg)] px-3 py-3 text-left shadow-lg transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-[var(--app-card-bg-soft)] hover:shadow-xl active:translate-y-0"
    :title="t('AclDialog.Restore')"
    :aria-label="t('AclDialog.Restore')"
    @click="minimized = false"
  >
    <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
      <UIcon name="i-lucide-clipboard-clock" class="size-4.5" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-[var(--app-fg)]">{{ t("AclDialog.LoginReview") }}</span>
      <span class="mt-0.5 block truncate text-xs text-[var(--app-muted)]">{{ minimizedDescription }}</span>
    </span>
    <UBadge v-if="activeCount" :label="String(activeCount)" color="primary" variant="soft" size="sm" />
    <UIcon name="i-lucide-maximize-2" class="size-4 shrink-0 text-[var(--app-muted)]" />
  </UButton>
</template>
