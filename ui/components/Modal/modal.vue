<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    overlay?: boolean;
  }>(),
  {
    title: "",
    description: "",
    overlay: false
  }
);

const emits = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "clipboard", value: string): void;
  (e: "confirm"): void;
}>();

const { t } = useI18n();

const updateOpen = () => {
  emits("update:open", false);
};

const handleConfirm = () => {
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
        <div @contextmenu.stop.prevent="handleContextMenu" @keydown.enter="handleConfirm">
          <slot />
        </div>
      </template>

      <template #footer="{ close }">
        <UButton :label="t('Common.Cancel')" color="neutral" variant="outline" @click="close" />
        <UButton :label="t('Common.Confirm')" color="neutral" @click="handleConfirm" />
      </template>
    </UModal>
  </template>
</template>
