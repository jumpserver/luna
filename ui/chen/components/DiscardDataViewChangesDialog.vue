<script setup lang="ts">
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
  message?: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [];
}>();

const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});

function close() {
  visible.value = false;
}

function confirmDiscard() {
  emit("confirm");
  close();
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Discard unsaved changes?">
    <template #body>
      <p class="text-sm text-muted">{{ message || "This data view has unsaved edits. Discard them and continue?" }}</p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">Cancel</UButton>
        <UButton color="error" icon="i-lucide-trash-2" @click="confirmDiscard">Discard</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
