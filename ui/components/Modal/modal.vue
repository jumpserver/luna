<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    overlay?: boolean
    disabled?: boolean
    confirmLabel?: string
    confirmColor?: "primary" | "neutral" | "error" | "warning" | "success" | "info"
    confirmFullWidth?: boolean
    hideCancel?: boolean
    hideFooter?: boolean
    compact?: boolean
  }>(),
  {
    title: "",
    description: "",
    overlay: false,
    disabled: false,
    confirmLabel: "",
    confirmColor: "neutral",
    confirmFullWidth: false,
    hideCancel: false,
    hideFooter: false,
    compact: false
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
    :ui="{
      content: compact ? 'w-[calc(100vw-3rem)] max-w-xl' : undefined,
      header: compact ? '!min-h-12 h-12 py-1 sm:py-1' : undefined,
      title: compact ? 'text-sm leading-4 font-medium' : undefined,
      close: compact ? 'size-7 p-1' : undefined,
      body: compact ? 'pt-3 pb-6 sm:pt-3 sm:pb-6' : undefined,
      footer: [confirmFullWidth ? 'block' : 'justify-end', compact ? 'pt-2 sm:pt-2' : ''].filter(Boolean).join(' '),
      description: 'text-sm leading-5'
    }"
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

    <template v-if="!hideFooter" #footer="{ close }">
      <UButton v-if="!hideCancel" :label="t('Common.Cancel')" color="neutral" variant="outline" @click="close" />
      <UButton
        :label="confirmLabel || t('Common.Confirm')"
        :disabled="disabled"
        :color="confirmColor"
        :class="confirmFullWidth ? 'w-full justify-center' : ''"
        @click="handleConfirm(disabled)"
      />
    </template>
  </UModal>
</template>
