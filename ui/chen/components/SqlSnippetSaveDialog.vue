<script setup lang="ts">
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
  saving: boolean;
  hint?: string;
  error?: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [name: string];
}>();

const { t } = useI18n();

const name = ref("");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});

function submit() {
  if (!props.saving) emit("confirm", name.value);
}

function close() {
  visible.value = false;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" :title="t('Chen.SaveSql')" :dismissible="false">
    <template #body>
      <p v-if="hint" class="mb-3 text-sm text-muted">{{ hint }}</p>
      <p v-if="error" role="alert" class="mb-3 text-sm text-error">{{ error }}</p>
      <UFormField :label="t('Chen.Name')">
        <UInput
          v-model="name"
          :disabled="saving"
          :maxlength="128"
          autofocus
          class="w-full"
          @keydown.enter.prevent="submit"
        />
      </UFormField>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" :disabled="saving" @click="close">{{ t("Common.Cancel") }}</UButton>
        <UButton :loading="saving" :disabled="saving" @click="submit">{{ t("Common.Confirm") }}</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
