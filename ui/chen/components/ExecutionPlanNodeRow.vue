<script setup lang="ts">
import type { ChenPlanNode } from "~/chen/types/plan";
import {
  chenPlanFormatEstimated,
  chenPlanNodeIcon,
  chenPlanNodeKeyFacts
} from "~/chen/utils/executionPlanPresentation";

defineOptions({ name: "ExecutionPlanNodeRow" });

const props = defineProps<{
  node: ChenPlanNode;
  depth: number;
  selectedId: string | null;
  collapsedIds: Set<string>;
}>();
const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string];
}>();

const { t } = useI18n();
const hasChildren = computed(() => props.node.children.length > 0);
const expanded = computed(() => !props.collapsedIds.has(props.node.id));
const objectName = computed(() => props.node.relation || props.node.table);
const keyFacts = computed(() => chenPlanNodeKeyFacts(props.node));
const estimatedRows = computed(() => chenPlanFormatEstimated(props.node.rows) ?? "—");
const estimatedCost = computed(() => chenPlanFormatEstimated(props.node.cost) ?? "—");
</script>

<template>
  <div>
    <div class="flex min-w-0 items-start gap-1 rounded-md py-0.5" :style="{ paddingLeft: `${depth * 18}px` }">
      <button
        v-if="hasChildren"
        type="button"
        class="mt-2 grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-elevated hover:text-highlighted"
        :aria-label="expanded ? t('Chen.CollapsePlanNode') : t('Chen.ExpandPlanNode')"
        @click="emit('toggle', node.id)"
      >
        <UIcon :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
      </button>
      <span v-else class="mt-2 inline-block size-5 shrink-0" />
      <button
        type="button"
        class="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-elevated"
        :class="selectedId === node.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''"
        :aria-pressed="selectedId === node.id"
        @click="emit('select', node.id)"
      >
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UIcon :name="chenPlanNodeIcon(node.nodeType)" class="size-4 shrink-0 text-primary" />
          <span class="shrink-0 text-[10px] font-medium tracking-wide text-muted">
            {{ node.nodeType.replaceAll("_", " ") }}
          </span>
          <span class="font-semibold text-highlighted">{{ node.nativeOperator || node.nodeType }}</span>
          <span v-if="objectName" class="min-w-0 truncate font-ui-mono text-[11px] text-muted" :title="objectName">
            {{ objectName }}
          </span>
          <span class="tabular-nums text-muted" :title="node.rowsMeaning || t('ExecutionPlan.estimatedRows')">
            {{ t("ExecutionPlan.rows") }} {{ estimatedRows }}
          </span>
          <span class="tabular-nums text-muted" :title="node.costMeaning || t('ExecutionPlan.estimatedCost')">
            {{ t("ExecutionPlan.cost") }} {{ estimatedCost }}
          </span>
        </span>
        <span
          v-if="keyFacts.length"
          class="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 font-ui-mono text-[11px] text-muted"
        >
          <span
            v-for="fact in keyFacts"
            :key="fact.key"
            class="max-w-full truncate"
            :title="`${fact.key}: ${fact.value}`"
          >
            {{ fact.key }}: {{ fact.value }}
          </span>
        </span>
      </button>
    </div>
    <ExecutionPlanNodeRow
      v-for="child in expanded ? node.children : []"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      :selected-id="selectedId"
      :collapsed-ids="collapsedIds"
      @select="emit('select', $event)"
      @toggle="emit('toggle', $event)"
    />
  </div>
</template>
