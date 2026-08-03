<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    placeholder?: string;
    error?: string;
    loading?: boolean;
    confirmLabel?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: "",
    error: "",
    loading: false,
    confirmLabel: "",
    disabled: false
  }
);

const emit = defineEmits<{
  confirm: [value: string];
}>();

const open = defineModel<boolean>("open", { required: true });
const modelValue = defineModel<string>({ default: "" });
const { t } = useI18n();
const inputContainer = ref<HTMLElement | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  nextTick(() => inputContainer.value?.querySelector<HTMLInputElement>("input")?.focus());
});

function submit() {
  if (props.disabled || props.loading) return;
  emit("confirm", modelValue.value);
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }">
    <template #body>
      <div ref="inputContainer" class="space-y-2">
        <UInput
          v-model="modelValue"
          :aria-label="title"
          :placeholder="placeholder"
          :disabled="loading"
          @keydown.enter.prevent="submit"
        />
        <p v-if="error" class="text-sm text-error" role="alert">
          {{ error }}
        </p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="loading" @click="open = false">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton :label="confirmLabel || t('Common.Confirm')" :disabled="disabled" :loading="loading" @click="submit" />
    </template>
  </UModal>
</template>
