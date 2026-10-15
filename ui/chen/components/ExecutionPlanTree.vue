<script setup lang="ts">
import type { ChenExecutionPlan, ChenPlanNode, PlanDatabase } from "~/chen/types/plan";

import ExecutionPlanNodeRow from "~/chen/components/ExecutionPlanNodeRow.vue";
import {
  chenPlanFormatEstimated,
  chenPlanFormatRaw,
  chenPlanNodeDetail,
  chenPlanNodeFacts,
  chenPlanNodeIcon,
  chenPlanNodeKeyFacts,
  chenPlanSteps
} from "~/chen/utils/executionPlanPresentation";

const props = defineProps<{
  plan: ChenExecutionPlan | null;
  loading?: boolean;
}>();

type PlanView = "tree" | "summary" | "raw";
const { t, locale } = useI18n();
const view = ref<PlanView>("tree");
const selectedId = ref<string | null>(null);
const showDetails = ref(false);
const collapsedIds = ref<Set<string>>(new Set());
const labels = computed(() =>
  locale.value.startsWith("zh")
    ? {
        summary: "概要表",
        database: "数据库",
        version: "版本",
        nodes: "节点",
        format: "原始格式",
        truncated: "原始计划已截断",
        step: "层级 / 步骤",
        operation: "操作",
        object: "对象",
        keyDetail: "关键属性",
        noDetails: "没有其他节点详情",
        costMeaning: "成本含义",
        mixedCostMeaning: "各节点的成本含义不同"
      }
    : {
        summary: "Summary",
        database: "Database",
        version: "Version",
        nodes: "Nodes",
        format: "Raw format",
        truncated: "Raw plan truncated",
        step: "Step",
        operation: "Operation",
        object: "Object",
        keyDetail: "Key detail",
        noDetails: "No additional node details",
        costMeaning: "Cost meaning",
        mixedCostMeaning: "Cost meaning varies by node"
      }
);
const databaseNames: Record<PlanDatabase, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  oracle: "Oracle",
  sqlserver: "SQL Server",
  db2: "DB2",
  dm: "Dameng",
  clickhouse: "ClickHouse"
};

const steps = computed(() => chenPlanSteps(props.plan?.roots || []));
const selectedNode = computed<ChenPlanNode | null>(
  () => steps.value.find((step) => step.node.id === selectedId.value)?.node || null
);
const selectedFacts = computed(() => (selectedNode.value ? chenPlanNodeFacts(selectedNode.value) : []));
const selectedDetail = computed(() => (selectedNode.value ? chenPlanNodeDetail(selectedNode.value) : null));
const costMeanings = computed(() => [
  ...new Set(steps.value.map((step) => step.node.costMeaning).filter((value): value is string => !!value))
]);
const costMeaningTitle = computed(() => costMeanings.value.join("\n"));
const statusLabel = computed(() => {
  const status = props.plan?.status;
  return status ? t(`ExecutionPlan.status.${status}`, status) : "";
});
const rawDisplay = computed(() =>
  props.plan?.rawText ? chenPlanFormatRaw(props.plan.rawText, props.plan.rawFormat) : ""
);
const visiblePrerequisites = computed(() =>
  (props.plan?.prerequisites || []).filter((item) => item.status === "UNMET" || item.status === "UNKNOWN")
);

watch(
  () => props.plan,
  (plan) => {
    selectedId.value = plan?.roots[0]?.id || null;
    showDetails.value = false;
    collapsedIds.value = new Set();
    view.value = plan?.status === "RAW_ONLY" ? "raw" : "tree";
  },
  { immediate: true }
);

function toggleNode(id: string) {
  const next = new Set(collapsedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedIds.value = next;
}

function selectNode(id: string) {
  selectedId.value = id;
  showDetails.value = true;
  const ancestors = steps.value.find((step) => step.node.id === id)?.ancestors || [];
  if (ancestors.some((ancestor) => collapsedIds.value.has(ancestor))) {
    const next = new Set(collapsedIds.value);
    ancestors.forEach((ancestor) => next.delete(ancestor));
    collapsedIds.value = next;
  }
}

function expandAll() {
  collapsedIds.value = new Set();
}

function collapseAll() {
  collapsedIds.value = new Set(steps.value.filter((step) => step.node.children.length).map((step) => step.node.id));
  showDetails.value = false;
  const selectedStep = steps.value.find((step) => step.node.id === selectedId.value);
  if (selectedStep?.ancestors.length) selectedId.value = selectedStep.ancestors[0] || null;
}

function setView(next: PlanView) {
  view.value = next;
  showDetails.value = false;
}

function keyDetail(node: ChenPlanNode) {
  return chenPlanNodeKeyFacts(node)
    .map((fact) => `${fact.key}: ${fact.value}`)
    .join(" · ");
}
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
      <div class="shrink-0 space-y-2 border-b border-default px-3 py-2 text-xs">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <UBadge color="neutral" variant="soft" size="sm">{{ t("ExecutionPlan.modeEstimated") }}</UBadge>
          <span class="text-muted">{{ statusLabel }}</span>
          <span class="text-muted">
            {{ labels.database }}
            <span class="font-medium text-highlighted">{{ plan.database ? databaseNames[plan.database] : "—" }}</span>
          </span>
          <span class="text-muted">
            {{ labels.version }}
            <span class="text-highlighted">{{ plan.serverVersion || "—" }}</span>
          </span>
          <span class="text-muted">
            {{ labels.nodes }}
            <span class="tabular-nums text-highlighted">{{ steps.length }}</span>
          </span>
          <span class="text-muted">
            {{ labels.format }}
            <span class="font-ui-mono text-highlighted">{{ plan.rawFormat || "—" }}</span>
          </span>
          <span v-if="plan.rawTruncated" class="text-warning">{{ labels.truncated }}</span>
        </div>
        <div v-if="costMeanings.length" class="flex min-w-0 items-center gap-1 text-muted" :title="costMeaningTitle">
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
          <span class="shrink-0">{{ labels.costMeaning }}:</span>
          <span class="truncate">{{ costMeanings.length === 1 ? costMeanings[0] : labels.mixedCostMeaning }}</span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1" role="group" :aria-label="t('ExecutionPlan.title')">
            <UButton
              size="xs"
              color="neutral"
              :variant="view === 'tree' ? 'soft' : 'ghost'"
              :disabled="!plan.roots.length"
              @click="setView('tree')"
            >
              {{ t("ExecutionPlan.tree") }}
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              :variant="view === 'summary' ? 'soft' : 'ghost'"
              :disabled="!plan.roots.length"
              @click="setView('summary')"
            >
              {{ labels.summary }}
            </UButton>
            <UButton size="xs" color="neutral" :variant="view === 'raw' ? 'soft' : 'ghost'" @click="setView('raw')">
              {{ t("ExecutionPlan.raw") }}
            </UButton>
          </div>
          <div v-if="view === 'tree' && plan.roots.length" class="flex items-center gap-1">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevrons-down" @click="expandAll">
              {{ t("Tree.ExpandAll") }}
            </UButton>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevrons-up" @click="collapseAll">
              {{ t("Tree.CollapseAll") }}
            </UButton>
          </div>
        </div>
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
      <div v-if="view === 'raw'" class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <pre class="w-max min-w-full whitespace-pre font-ui-mono text-[12px] text-highlighted">{{
          rawDisplay || t("ExecutionPlan.emptyRaw")
        }}</pre>
      </div>
      <template v-else>
        <div v-if="view === 'tree'" class="min-h-0 flex-1 overflow-auto px-3 py-2">
          <ExecutionPlanNodeRow
            v-for="root in plan.roots"
            :key="root.id"
            :node="root"
            :depth="0"
            :selected-id="selectedId"
            :collapsed-ids="collapsedIds"
            @select="selectNode"
            @toggle="toggleNode"
          />
          <p v-if="!plan.roots.length" class="text-xs text-muted">{{ t("ExecutionPlan.emptyTree") }}</p>
        </div>
        <div v-else class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
            <thead class="sticky top-0 z-10 bg-default text-muted">
              <tr>
                <th class="border-b border-default px-3 py-2 font-medium">{{ labels.step }}</th>
                <th class="border-b border-default px-3 py-2 font-medium">{{ labels.operation }}</th>
                <th class="border-b border-default px-3 py-2 font-medium">{{ labels.object }}</th>
                <th class="border-b border-default px-3 py-2 text-right font-medium">
                  {{ t("ExecutionPlan.estimatedRows") }}
                </th>
                <th class="border-b border-default px-3 py-2 text-right font-medium">
                  {{ t("ExecutionPlan.estimatedCost") }}
                </th>
                <th class="border-b border-default px-3 py-2 font-medium">{{ labels.keyDetail }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="step in steps"
                :key="step.node.id"
                class="cursor-pointer hover:bg-elevated"
                :class="selectedId === step.node.id ? 'bg-primary/10' : ''"
                @click="selectNode(step.node.id)"
              >
                <td class="border-b border-default/50 px-3 py-2 font-ui-mono tabular-nums">
                  <button
                    type="button"
                    class="text-left text-highlighted"
                    :aria-label="`${labels.step} ${step.step}: ${step.node.nativeOperator}`"
                    @click.stop="selectNode(step.node.id)"
                  >
                    {{ step.step }}
                  </button>
                </td>
                <td class="border-b border-default/50 px-3 py-2">
                  <span class="flex items-center gap-2" :style="{ paddingLeft: `${step.depth * 12}px` }">
                    <UIcon :name="chenPlanNodeIcon(step.node.nodeType)" class="size-4 shrink-0 text-primary" />
                    <span class="min-w-0">
                      <span class="block font-medium text-highlighted">
                        {{ step.node.nativeOperator || step.node.nodeType }}
                      </span>
                      <span class="text-[10px] text-muted">{{ step.node.nodeType.replaceAll("_", " ") }}</span>
                    </span>
                  </span>
                </td>
                <td
                  class="max-w-48 truncate border-b border-default/50 px-3 py-2 font-ui-mono text-muted"
                  :title="step.node.relation || step.node.table || ''"
                >
                  {{ step.node.relation || step.node.table || "—" }}
                </td>
                <td
                  class="border-b border-default/50 px-3 py-2 text-right tabular-nums text-muted"
                  :title="step.node.rowsMeaning || ''"
                >
                  {{ chenPlanFormatEstimated(step.node.rows) ?? "—" }}
                </td>
                <td
                  class="border-b border-default/50 px-3 py-2 text-right tabular-nums text-muted"
                  :title="step.node.costMeaning || ''"
                >
                  {{ chenPlanFormatEstimated(step.node.cost) ?? "—" }}
                </td>
                <td
                  class="max-w-64 truncate border-b border-default/50 px-3 py-2 font-ui-mono text-muted"
                  :title="keyDetail(step.node)"
                >
                  {{ keyDetail(step.node) || "—" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="showDetails && selectedNode"
          class="max-h-36 shrink-0 overflow-auto border-t border-default bg-elevated/30 px-3 py-2 text-xs"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="font-medium text-highlighted">
              {{ t("ExecutionPlan.details") }} · {{ selectedNode.nativeOperator || selectedNode.nodeType }}
            </span>
            <span class="flex items-center gap-2">
              <span v-if="selectedNode.nativeId" class="font-ui-mono text-muted">#{{ selectedNode.nativeId }}</span>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="t('ExecutionPlan.hideDetails')"
                @click="showDetails = false"
              />
            </span>
          </div>
          <p v-if="selectedDetail" class="mb-1 font-ui-mono text-muted">{{ selectedDetail }}</p>
          <div v-if="selectedFacts.length" class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <div v-for="fact in selectedFacts" :key="fact.key" class="min-w-0">
              <span class="text-muted">{{ fact.key }}:</span>
              <span class="ml-1 break-all font-ui-mono text-highlighted">{{ fact.value }}</span>
            </div>
          </div>
          <p v-else-if="!selectedDetail" class="text-muted">{{ labels.noDetails }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
