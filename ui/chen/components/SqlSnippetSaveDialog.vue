<script setup lang="ts">
const props = defineProps<{
  open: boolean
  saving: boolean
}>();

const emit = defineEmits<{
  "update:open": [open: boolean]
  confirm: [name: string]
}>();

const name = ref("");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});

function submit() {
  emit("confirm", name.value);
}

function close() {
  visible.value = false;
}
</script>

<template>
  <UModal v-model:open="visible" title="Save SQL">
    <template #body>
      <UFormField label="Name">
        <UInput
          v-model="name"
          autofocus
          class="w-full"
          @keydown.enter.prevent="submit"
        />
      </UFormField>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">
          Cancel
        </UButton>
        <UButton :loading="saving" @click="submit">
          Confirm
        </UButton>
      </div>
    </template>
  </UModal>
</template>
