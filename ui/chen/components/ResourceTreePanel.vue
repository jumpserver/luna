<script setup lang="ts">
import type { ChenSqlKeywordCase, ChenTabTitleFormat } from "~/chen/composables/useChenWorkspacePreferences";
import type { ChenTreeNode } from "~/chen/types";

import ChenResourceTreeNode from "~/chen/components/ResourceTreeNode.vue";

const props = defineProps<{
  rootNodes: ChenTreeNode[];
  selectedKey: string;
  expandedKeys: string[];
  childrenMap: Record<string, ChenTreeNode[]>;
  loadingChildren: Record<string, boolean>;
  dbType?: string;
  width: number | string;
  tabTitleFormat: ChenTabTitleFormat;
  sqlKeywordCase: ChenSqlKeywordCase;
}>();

const emit = defineEmits<{
  close: [];
  refresh: [];
  select: [node: ChenTreeNode];
  activate: [node: ChenTreeNode];
  toggle: [node: ChenTreeNode];
  menu: [payload: { node: ChenTreeNode; event: MouseEvent }];
  clearRecent: [];
  "update:tabTitleFormat": [format: ChenTabTitleFormat];
  "update:sqlKeywordCase": [keywordCase: ChenSqlKeywordCase];
}>();

const tabTitleFormatOptions = [
  { label: "仅表名", value: "table" },
  { label: "表名.Schema", value: "table-schema" }
];
const tabTitleFormatModel = computed({
  get: () => props.tabTitleFormat,
  set: (format: ChenTabTitleFormat) => emit("update:tabTitleFormat", format)
});
const sqlKeywordCaseOptions = [
  { label: "小写", value: "lower" },
  { label: "大写", value: "upper" }
];
const sqlKeywordCaseModel = computed({
  get: () => props.sqlKeywordCase,
  set: (keywordCase: ChenSqlKeywordCase) => emit("update:sqlKeywordCase", keywordCase)
});
</script>

<template>
  <aside
    class="flex min-h-0 shrink-0 flex-col border-r border-default bg-[var(--workspace-surface-sidebar)]"
    :style="{ width: typeof width === 'number' ? `${width}px` : width }"
  >
    <div class="flex h-9 shrink-0 items-center justify-between border-b border-default px-2.5">
      <p class="text-xs font-medium text-muted">Database Explorer</p>
      <div class="flex h-7 items-center gap-1">
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="md:hidden"
          aria-label="Close database explorer"
          @click="emit('close')"
        />
        <UTooltip text="刷新" :delay-duration="150">
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
            aria-label="刷新"
            @click="emit('refresh')"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
          </button>
        </UTooltip>
        <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 6 }" :ui="{ content: 'p-0' }">
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
            aria-label="工作台设置"
            title="工作台设置"
          >
            <UIcon name="i-lucide-settings-2" class="size-3.5" />
          </button>

          <template #content>
            <div class="w-64 space-y-3 p-3">
              <div>
                <p class="text-xs font-medium text-highlighted">Chen 工作台设置</p>
                <p class="mt-0.5 text-[11px] text-muted">设置会自动保存并应用到数据库工作台。</p>
              </div>
              <label class="flex items-center justify-between gap-3 text-xs">
                <span>数据表 Tab 名称</span>
                <USelect
                  v-model="tabTitleFormatModel"
                  class="w-28"
                  size="xs"
                  :items="tabTitleFormatOptions"
                  value-key="value"
                />
              </label>
              <label class="flex items-center justify-between gap-3 text-xs">
                <span>SQL 关键字补全</span>
                <USelect
                  v-model="sqlKeywordCaseModel"
                  class="w-28"
                  size="xs"
                  :items="sqlKeywordCaseOptions"
                  value-key="value"
                />
              </label>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
      <ul>
        <ChenResourceTreeNode
          v-for="node in rootNodes"
          :key="node.key"
          :node="node"
          :selected-key="selectedKey"
          :expanded-keys="expandedKeys"
          :children-map="childrenMap"
          :loading-children="loadingChildren"
          :db-type="dbType"
          @select="emit('select', $event)"
          @activate="emit('activate', $event)"
          @toggle="emit('toggle', $event)"
          @menu="emit('menu', $event)"
          @clear-recent="emit('clearRecent')"
        />
      </ul>
    </div>
  </aside>
</template>
