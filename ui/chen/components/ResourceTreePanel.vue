<script setup lang="ts">
import type { ChenTreeNode } from "~/chen/types";

import ChenResourceTreeNode from "~/chen/components/ResourceTreeNode.vue";
import WorkspaceAddSessionPopover from "~/components/Workspace/addSessionPopover.vue";

defineProps<{
  rootNodes: ChenTreeNode[];
  selectedKey: string;
  expandedKeys: string[];
  childrenMap: Record<string, ChenTreeNode[]>;
  loadingChildren: Record<string, boolean>;
  dbType?: string;
  width: number;
}>();

const emit = defineEmits<{
  refresh: [];
  select: [node: ChenTreeNode];
  activate: [node: ChenTreeNode];
  toggle: [node: ChenTreeNode];
  menu: [payload: { node: ChenTreeNode; event: MouseEvent }];
  clearRecent: [];
}>();
</script>

<template>
  <aside
    class="flex min-h-0 shrink-0 flex-col border-r border-default bg-[var(--workspace-surface-sidebar)]"
    :style="{ width: `${width}px` }"
  >
    <div class="flex h-9 shrink-0 items-center justify-between border-b border-default px-2.5">
      <p class="text-xs font-medium text-muted">Database Explorer</p>
      <div class="flex h-7 items-center gap-1">
        <WorkspaceAddSessionPopover />
        <UTooltip text="刷新" :delay-duration="150">
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
            aria-label="刷新"
            @click="emit('refresh')"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </button>
        </UTooltip>
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
