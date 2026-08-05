<script setup lang="ts">
import { normalizeErrorText } from "~/composables/useErrorToast";

const props = defineProps<{ detail: string }>();
const { t } = useI18n();
const open = ref(false);
const normalizedDetail = computed(() => normalizeErrorText(props.detail));
const summary = computed(() => normalizedDetail.value.replace(/\s+/g, " ").trim());
</script>

<template>
  <UCollapsible v-model:open="open" class="mt-2 min-w-0 w-full">
    <UButton
      color="error"
      variant="soft"
      size="sm"
      block
      class="min-w-0 cursor-pointer justify-between text-left"
      :title="open ? t('AclDialog.CollapseError') : t('AclDialog.ExpandError')"
    >
      <span class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
        <span class="truncate">{{ summary }}</span>
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </UButton>

    <template #content>
      <pre
        class="mt-2 max-h-48 overflow-auto rounded-md border border-error/25 bg-error/8 p-3 whitespace-pre-wrap text-xs leading-5 text-error [overflow-wrap:anywhere]"
        >{{ normalizedDetail }}</pre>
    </template>
  </UCollapsible>
</template>
