<script setup lang="ts">
defineProps<{ placeholder: string; clearLabel?: string }>();
const query = defineModel<string>({ required: true });
const input = useTemplateRef("input");
const { t } = useI18n();

function focus() {
  input.value?.inputRef?.focus();
}
function clear() {
  query.value = "";
  focus();
}
defineExpose({ focus });
</script>

<template>
  <UInput
    ref="input"
    v-model="query"
    size="sm"
    autocapitalize="none"
    autocorrect="off"
    icon="i-lucide-search"
    variant="none"
    :placeholder="placeholder"
    :aria-label="placeholder"
    class="search-input w-full rounded-xl"
    :ui="{
      base: 'h-7 rounded-xl bg-[var(--app-surface-panel-strong)] text-[12px] text-[var(--app-fg)] ring-1 ring-inset ring-[var(--app-border)] focus-visible:ring-[var(--app-focus-ring)] placeholder:text-[var(--app-muted)]',
      leadingIcon: 'sidebar-icon',
      trailingIcon: 'sidebar-icon'
    }"
  >
    <template v-if="query" #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-circle-x"
        :aria-label="clearLabel || t('Common.ClearInput')"
        :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
        @click="clear"
      />
    </template>
  </UInput>
</template>
