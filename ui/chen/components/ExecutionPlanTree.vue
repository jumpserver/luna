<script setup lang="ts">
import type { ChenExecutionPlan } from "~/chen/types/plan";

import ExecutionPlanNodeRow from "~/chen/components/ExecutionPlanNodeRow.vue";

const props = defineProps<{
  plan: ChenExecutionPlan | null;
  loading?: boolean;
}>();

const { t } = useI18n();
const showRaw = ref(false);

const statusLabel = computed(() => {
  const status = props.plan?.status;
  if (!status) return "";
  return t(`ExecutionPlan.status.${status}`, status);
});

const rawDisplay = computed(() => {
  const plan = props.plan;
  if (!plan?.rawText) return "";
  if (plan.rawFormat === "JSON") {
    try {
      return JSON.stringify(JSON.parse(plan.rawText), null, 2);
    } catch {
      return plan.rawText;
    }
  }
  return plan.rawText;
});
const visiblePrerequisites = computed(() =>
  (props.plan?.prerequisites || []).filter((item) => item.status === "UNMET" || item.status === "UNKNOWN")
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div v-if="loading" class="grid min-h-0 flex-1 place-items-center text-sm text-muted">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t("ExecutionPlan.loading") }}
      </div>
    </div>
    <div v-else-if="!plan" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
      <div class="text-center">
        <UIcon name="i-lucide-git-fork" class="mx-auto mb-2 size-5" />
        <p>{{ t("ExecutionPlan.empty") }}</p>
      </div>
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-3 py-2 text-xs">
        <div class="min-w-0 truncate">
          <span class="font-medium text-highlighted">{{ t("ExecutionPlan.modeEstimated") }}</span>
          <span class="mx-2 text-muted">{{ statusLabel }}</span>
          <span v-if="plan.database" class="text-muted">{{ plan.database }}</span>
        </div>
        <UButton size="xs" color="neutral" variant="soft" @click="showRaw = !showRaw">
          {{ showRaw ? t("ExecutionPlan.tree") : t("ExecutionPlan.raw") }}
        </UButton>
      </div>
      <div v-if="plan.error" class="border-b border-error/20 bg-error/10 px-3 py-2 text-xs text-error">
        {{ plan.error.message }}
      </div>
      <div
        v-for="item in visiblePrerequisites"
        :key="item.code + item.status + item.message"
        class="border-b border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        {{ item.message }}
      </div>
      <div
        v-for="warning in plan.warnings"
        :key="warning.code + warning.message"
        class="border-b border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        {{ warning.message }}
      </div>
      <div
        v-if="plan.effects.connectionDisposition === 'DISCARD'"
        class="border-b border-error/20 bg-error/10 px-3 py-2 text-xs text-error"
      >
        {{ t("ExecutionPlan.connectionDiscarded") }}
      </div>
      <div
        v-if="plan.effects.auxiliaryStorage === 'RESIDUAL'"
        class="border-b border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        {{ t("ExecutionPlan.auxiliaryResidual") }}
      </div>
      <div v-if="showRaw || plan.status === 'RAW_ONLY'" class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <pre class="whitespace-pre-wrap break-words font-ui-mono text-[12px] text-highlighted">{{
          rawDisplay || t("ExecutionPlan.emptyRaw")
        }}</pre>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <ExecutionPlanNodeRow
          v-for="root in plan.roots"
          :key="root.id"
          :node="root"
          :depth="0"
          :show-cost="plan.capabilities.cost"
          :show-rows="plan.capabilities.estimatedRows"
        />
        <p v-if="!plan.roots.length" class="text-xs text-muted">{{ t("ExecutionPlan.emptyTree") }}</p>
      </div>
    </div>
  </div>
</template>
