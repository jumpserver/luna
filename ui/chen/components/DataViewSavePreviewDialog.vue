<script setup lang="ts">
import type { ChenSaveChangesPreviewResult } from "~/chen/types";

const props = defineProps<{
  open: boolean
  result: ChenSaveChangesPreviewResult | null
}>();

const emit = defineEmits<{
  "update:open": [open: boolean]
  confirm: []
}>();

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
  <UModal v-model:open="visible" title="Save changes">
    <template #body>
      <div class="space-y-3 text-sm">
        <p class="text-muted">
          Review the prepared operations before saving.
        </p>
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">
              Updates
            </div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.updateCount || 0 }}
            </div>
          </div>
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">
              Inserts
            </div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.insertCount || 0 }}
            </div>
          </div>
          <div class="rounded-md border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2">
            <div class="text-xs text-muted">
              Deletes
            </div>
            <div class="mt-1 text-lg font-semibold">
              {{ result?.deleteCount || 0 }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">
          Cancel
        </UButton>
        <UButton icon="i-lucide-save" @click="confirm">
          Save
        </UButton>
      </div>
    </template>
  </UModal>
</template>
