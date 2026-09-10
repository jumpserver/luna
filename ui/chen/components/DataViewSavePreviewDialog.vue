<script setup lang="ts">
import type { ChenSaveChangesPreviewResult } from "~/chen/types";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
  result: ChenSaveChangesPreviewResult | null;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [];
}>();

const { t } = useI18n();

const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});

function close() {
  visible.value = false;
}

function confirm() {
  emit("confirm");
  close();
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" :title="t('Chen.SaveChanges')">
    <template #body>
      <div class="space-y-3 text-sm">
        <p class="text-muted">{{ t("Chen.ReviewOperationsBeforeSaving") }}</p>
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">{{ t("Chen.Updates") }}</div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.updateCount || 0 }}
            </div>
          </div>
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">{{ t("Chen.Inserts") }}</div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.insertCount || 0 }}
            </div>
          </div>
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">{{ t("Chen.Deletes") }}</div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.deleteCount || 0 }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">{{ t("Common.Cancel") }}</UButton>
        <UButton icon="i-lucide-save" @click="confirm">{{ t("Common.Save") }}</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
