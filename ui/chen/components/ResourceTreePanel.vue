<script setup lang="ts">
import type { ChenTreeNode } from "~/chen/types";

import ChenResourceTreeNode from "~/chen/components/ResourceTreeNode.vue";
import WorkspaceAddSessionPopover from "~/components/Workspace/addSessionPopover.vue";

defineProps<{
  rootNodes: ChenTreeNode[]
  selectedKey: string
  expandedKeys: string[]
  childrenMap: Record<string, ChenTreeNode[]>
  loadingChildren: Record<string, boolean>
  dbType?: string
  width: number
}>();

const emit = defineEmits<{
  refresh: []
  select: [node: ChenTreeNode]
  activate: [node: ChenTreeNode]
  toggle: [node: ChenTreeNode]
  menu: [payload: { node: ChenTreeNode, event: MouseEvent }]
}>();
</script>

<template>
  <aside
    class="flex min-h-0 shrink-0 flex-col border-r border-default bg-[var(--workspace-surface-sidebar)]"
    :style="{ width: `${width}px` }"
  >
    <div class="flex items-center justify-between border-b border-default px-2.5 py-1">
      <p class="text-xs font-medium text-muted">
        Database Explorer
      </p>
      <div class="flex h-7 items-center gap-1">
        <WorkspaceAddSessionPopover />
        <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" @click="emit('refresh')" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
      <ul class="space-y-0.5">
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
        />
      </ul>
    </div>
  </aside>
</template>
