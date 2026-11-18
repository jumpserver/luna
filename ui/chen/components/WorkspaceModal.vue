<script setup lang="ts">
import type { ModalProps } from "@nuxt/ui";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  portal?: boolean;
  ui?: ModalProps["ui"];
}>();

const workspaceUi = computed(
  () =>
    ({
      ...props.ui,
      overlay: [props.portal ? "z-50" : "!absolute z-40 bg-elevated/75", "backdrop-blur-none", props.ui?.overlay],
      content: [
        props.portal ? "z-50" : "!absolute z-40 !w-[calc(100%-2rem)] !max-h-[calc(100%-2rem)]",
        props.ui?.content
      ]
    }) as ModalProps["ui"]
);
</script>

<template>
  <UModal v-bind="$attrs" :portal="props.portal" :modal="props.portal" :ui="workspaceUi">
    <template v-if="$slots.body" #body="slotProps">
      <slot name="body" v-bind="slotProps" />
    </template>

    <template v-if="$slots.footer" #footer="slotProps">
      <slot name="footer" v-bind="slotProps" />
    </template>
  </UModal>
</template>
