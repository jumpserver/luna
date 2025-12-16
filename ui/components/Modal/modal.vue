<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    overlay?: boolean
    disabled?: boolean
  }>(),
  {
    title: "",
    description: "",
    overlay: false,
    disabled: false
  }
);

const emits = defineEmits<{
  (e: "update:open", value: boolean): void
  (e: "clipboard", value: string): void
  (e: "confirm"): void
}>();

const { t } = useI18n();

const updateOpen = () => {
  emits("update:open", false);
};

const handleConfirm = (isDisabled = false) => {
  if (isDisabled) return;
  emits("confirm");
};

const handleContextMenu = async (e: Event) => {
  e.stopPropagation();
  e.preventDefault();

  try {
    const clipboardText = await useTauriClipboardManagerReadText();

    if (clipboardText) {
      emits("clipboard", clipboardText);
    } else {
      emits("clipboard", "");
    }
  } catch (error) {
    console.error(error);
  }
};
</script>

<template>
  <UModal
    :open="open"
    :ui="{ footer: 'justify-end', description: 'text-xs-plus' }"
    :description="description"
    :title="title"
    :overlay="overlay"
    @update:open="updateOpen"
  >
    <template #body>
      <div @contextmenu.stop.prevent="handleContextMenu" @keydown.enter="handleConfirm(disabled)">
        <slot />
      </div>
    </template>

    <template #footer="{ close }">
      <UButton :label="t('Common.Cancel')" color="neutral" variant="outline" @click="close" />
      <UButton :label="t('Common.Confirm')" :disabled="disabled" color="neutral" @click="handleConfirm(disabled)" />
    </template>
  </UModal>
</template>
