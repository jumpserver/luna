<script setup lang="ts">
defineOptions({ name: "ExecutionPlanNodeRow" });
import type { ChenPlanNode } from "~/chen/types/plan";

import {
  chenPlanFormatEstimated,
  chenPlanNodeDetail,
  chenPlanNodePrimaryFacts,
  chenPlanNodeSecondaryFacts,
  chenPlanNodeTitle
} from "~/chen/utils/executionPlanPresentation";

const props = defineProps<{
  node: ChenPlanNode;
  depth: number;
  showCost: boolean;
  showRows: boolean;
}>();

const { t } = useI18n();
const expanded = ref(true);
const showDetails = ref(false);
const hasChildren = computed(() => props.node.children.length > 0);
const title = computed(() => chenPlanNodeTitle(props.node));
const primaryFacts = computed(() => chenPlanNodePrimaryFacts(props.node));
const secondaryFacts = computed(() => {
  const facts = chenPlanNodeSecondaryFacts(props.node);
  const startup = chenPlanFormatEstimated(props.node.startupCost);
  if (startup != null && !facts.some((fact) => fact.key === "Startup Cost")) {
    facts.push({ key: "Startup Cost", value: startup });
  }
  return facts;
});
const detail = computed(() => chenPlanNodeDetail(props.node));
const estimatedRows = computed(() => (props.showRows ? chenPlanFormatEstimated(props.node.rows) : null));
const estimatedCost = computed(() => (props.showCost ? chenPlanFormatEstimated(props.node.cost) : null));
</script>

<template>
  <div>
    <div class="flex items-start gap-2 py-1 text-xs" :style="{ paddingLeft: `${depth * 16}px` }">
      <button
        v-if="hasChildren"
        class="mt-0.5 shrink-0 text-muted"
        :aria-label="expanded ? 'Collapse plan node' : 'Expand plan node'"
        @click="expanded = !expanded"
      >
        <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
      </button>
      <span v-else class="mt-0.5 inline-block size-3.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span class="font-medium text-highlighted">{{ title }}</span>
          <span v-if="node.relation" class="text-muted">{{ node.relation }}</span>
          <span
            v-if="estimatedRows != null"
            class="tabular-nums text-muted"
            :title="node.rowsMeaning || t('ExecutionPlan.estimatedRows')"
          >
            {{ t("ExecutionPlan.estimatedRows") }} {{ estimatedRows }}
          </span>
          <span
            v-if="estimatedCost != null"
            class="tabular-nums text-muted"
            :title="node.costMeaning || t('ExecutionPlan.estimatedCost')"
          >
            {{ t("ExecutionPlan.estimatedCost") }} {{ estimatedCost }}
          </span>
        </div>
        <div v-if="detail" class="mt-0.5 font-ui-mono text-[11px] text-muted">{{ detail }}</div>
        <div v-if="primaryFacts.length" class="mt-1 space-y-0.5 font-ui-mono text-[11px] text-muted">
          <div v-for="fact in primaryFacts" :key="fact.key">{{ fact.key }}: {{ fact.value }}</div>
        </div>
        <button
          v-if="secondaryFacts.length"
          class="mt-1 text-[11px] text-muted hover:text-highlighted"
          @click="showDetails = !showDetails"
        >
          {{ showDetails ? t("ExecutionPlan.hideDetails") : t("ExecutionPlan.details") }}
        </button>
        <div v-if="showDetails && secondaryFacts.length" class="mt-1 space-y-0.5 font-ui-mono text-[11px] text-muted">
          <div v-for="fact in secondaryFacts" :key="fact.key">{{ fact.key }}: {{ fact.value }}</div>
        </div>
      </div>
    </div>
    <ExecutionPlanNodeRow
      v-for="child in expanded ? node.children : []"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      :show-cost="showCost"
      :show-rows="showRows"
    />
  </div>
</template>
