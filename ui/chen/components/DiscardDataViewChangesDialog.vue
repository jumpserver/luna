<script setup lang="ts">
const props = defineProps<{
  open: boolean;
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
  <UModal v-model:open="visible" title="Discard unsaved changes?">
    <template #body>
      <p class="text-sm text-muted">This data view has unsaved edits. Discard them and continue?</p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">Cancel</UButton>
        <UButton color="error" icon="i-lucide-trash-2" @click="confirmDiscard">Discard</UButton>
      </div>
    </template>
  </UModal>
</template>
