<script setup lang="ts">
defineOptions({ name: "ExecutionPlanNodeRow" });
import type { ChenPlanNode } from "~/chen/types/plan";

const props = defineProps<{
  node: ChenPlanNode;
  depth: number;
  showCost: boolean;
  showRows: boolean;
}>();

const expanded = ref(true);
const hasChildren = computed(() => props.node.children.length > 0);

function displayMetric(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return "raw";
  return String(value);
}
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
          <span class="font-medium text-highlighted">{{ node.nativeOperator || node.nodeType }}</span>
          <span v-if="node.relation" class="text-muted">{{ node.relation }}</span>
          <span v-if="showRows" class="tabular-nums text-muted">rows {{ displayMetric(node.rows) }}</span>
          <span v-if="showCost" class="tabular-nums text-muted">cost {{ displayMetric(node.cost) }}</span>
        </div>
        <div v-if="node.detail" class="mt-0.5 font-ui-mono text-[11px] text-muted">{{ node.detail }}</div>
        <div v-if="Object.keys(node.predicates).length" class="mt-1 space-y-0.5 font-ui-mono text-[11px] text-muted">
          <div v-for="(value, key) in node.predicates" :key="key">{{ key }}: {{ value }}</div>
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
