<script setup lang="ts">
import type { ModalProps } from "@nuxt/ui";

defineProps<{
  title: string;
  description?: string;
  busy?: boolean;
  ui?: ModalProps["ui"];
}>();
const open = defineModel<boolean>("open", { required: true });

function focusContent(event: Event) {
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!busy"
    :close="!busy"
    :content="{ onOpenAutoFocus: focusContent }"
    :ui="{
      content: 'w-[448px] max-w-[calc(100vw-2rem)]',
      header: 'shrink-0 px-5 py-4 pe-12 sm:px-5 sm:pe-12',
      body: 'min-h-0 flex-1 p-5 sm:p-5',
      title: 'break-all',
      footer: 'shrink-0 justify-end gap-2 px-5 py-4 sm:px-5',
      ...ui
    }"
  >
    <template v-if="$slots.description" #description>
      <slot name="description" />
    </template>
    <template v-if="$slots.body" #body>
      <slot name="body" />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UModal>
</template>
