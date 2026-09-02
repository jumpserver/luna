<script setup lang="ts">
import type { PlanItem } from "./types";
import { renderAiMarkdown } from "./presentation";

defineProps<{
  plan: PlanItem;
}>();

const { t } = useI18n();
</script>

<template>
  <section class="run-plan">
    <span class="run-plan-icon">
      <UIcon name="i-lucide-workflow" class="size-4" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
        {{ t("RightPanel.AIExecutionPlan") }}
      </div>
      <div class="markdown-body text-xs" v-html="renderAiMarkdown(plan.summary)" />
    </div>
  </section>
</template>

<style scoped>
.run-plan {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--app-card-bg) 82%, transparent);
}

.run-plan-icon {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  place-items: center;
  border-radius: 0.5rem;
  color: var(--ui-color-primary-500);
  background: color-mix(in srgb, var(--ui-color-primary-500) 12%, transparent);
}

.markdown-body {
  overflow-wrap: anywhere;
  font-weight: 600;
  line-height: 1.45;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.4rem;
}

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}
</style>
