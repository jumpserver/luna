<script setup lang="ts">
import type { PlanItem } from "./types";
import { renderAiMarkdown } from "./presentation";

const props = defineProps<{
  plan: PlanItem;
}>();

const { t } = useI18n();
const hasSummary = computed(() => props.plan.summary && props.plan.summary !== t("RightPanel.AIExecutionPlan"));
</script>

<template>
  <UCollapsible v-if="hasSummary" class="min-w-0">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      block
      class="group justify-start px-1 py-1.5 text-muted"
      icon="i-lucide-list-checks"
      trailing-icon="i-lucide-chevron-right"
      :ui="{ trailingIcon: 'ml-auto size-3 group-data-[state=open]:rotate-90 transition-transform' }"
      :label="t('RightPanel.AIExecutionPlan')"
    />
    <template #content>
      <div
        class="markdown-body mt-1 border-l border-default py-1 pl-3 text-xs text-muted"
        v-html="renderAiMarkdown(plan.summary)"
      />
    </template>
  </UCollapsible>
</template>

<style scoped>
.markdown-body {
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.markdown-body :deep(p + p) {
  margin-top: 0.5rem;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.25rem;
  list-style: revert;
}
</style>
