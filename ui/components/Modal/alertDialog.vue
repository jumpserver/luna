<script setup lang="ts">
type ConfirmColor = "primary" | "neutral" | "error" | "warning" | "success" | "info";

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    confirmColor?: ConfirmColor
    loading?: boolean
  }>(),
  {
    description: "",
    confirmLabel: "",
    confirmColor: "primary",
    loading: false
  }
);

const emit = defineEmits<{
  confirm: []
}>();

const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();

function submit() {
  if (props.loading) return;
  emit("confirm");
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
  >
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="loading" @click="open = false">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton :label="confirmLabel || t('Common.Confirm')" :color="confirmColor" :loading="loading" @click="submit" />
    </template>
  </UModal>
</template>
