<script setup lang="ts">
import type { ChenTreeNode } from "~/chen/types";

import { resolveAssetIconFromFields } from "~/utils/assetIcon";

defineOptions({
  name: "ChenResourceTreeNode"
});

const props = defineProps<{
  node: ChenTreeNode;
  depth?: number;
  selectedKey: string;
  expandedKeys: string[];
  childrenMap: Record<string, ChenTreeNode[]>;
  loadingChildren: Record<string, boolean>;
  dbType?: string;
}>();

const emit = defineEmits<{
  select: [node: ChenTreeNode];
  toggle: [node: ChenTreeNode];
  activate: [node: ChenTreeNode];
  menu: [payload: { node: ChenTreeNode; event: MouseEvent }];
  clearRecent: [];
}>();

const isExpanded = computed(() => props.expandedKeys.includes(props.node.key));
const children = computed(() => props.node.children || []);

const datasourceIconSrc = computed(() => {
  if (props.node.type !== "datasource") return "";

  const dbType = `${props.dbType || ""}`.toLowerCase();
  const supportedVendors = [
    "mysql",
    "mariadb",
    "oracle",
    "postgres",
    "sqlserver",
    "redis",
    "mongodb",
    "dameng",
    "clickhouse"
  ];

  return supportedVendors.some((vendor) => dbType.includes(vendor))
    ? resolveAssetIconFromFields({ platform: dbType }).src
    : "";
});

const iconName = computed(() => {
  switch (props.node.type) {
    case "datasource":
      return "i-lucide-database-zap";
    case "database":
      return "i-lucide-database";
    case "schema":
      return "i-lucide-library-big";
    case "table":
      return "i-lucide-table-properties";
    case "view":
      return "i-lucide-eye";
    case "recent-group":
      return "i-lucide-history";
    case "recent-table":
      return "i-lucide-table-2";
    case "field":
    case "column":
      return "i-lucide-columns-3";
    default:
      return isExpanded.value ? "i-lucide-folder-open" : "i-lucide-folder";
  }
});

function handleRowClick() {
  emit("select", props.node);
  if (!props.node.leaf) emit("toggle", props.node);
}

function handleRowDoubleClick() {
  if (
    props.node.type === "database" ||
    props.node.type === "table" ||
    props.node.type === "view" ||
    props.node.type === "recent-table"
  ) {
    emit("activate", props.node);
  }
}

function handleContextMenu(event: MouseEvent) {
  if (props.node.type === "recent-group" || props.node.type === "recent-table") return;
  emit("menu", { node: props.node, event });
}
</script>

<template>
  <li>
    <div
      class="sidebar-row group flex h-7 w-full cursor-default items-center gap-1 rounded-lg pr-1 text-left text-xs"
      :class="selectedKey === node.key ? 'bg-[var(--app-selected-soft)] text-[var(--app-fg)]' : ''"
      :data-active="selectedKey === node.key ? '' : undefined"
      :style="{ paddingLeft: `${(depth || 0) * 12 + 6}px` }"
      @click="handleRowClick"
      @dblclick="handleRowDoubleClick"
      @contextmenu.prevent="handleContextMenu"
    >
      <button
        v-if="!node.leaf"
        type="button"
        class="grid size-4 shrink-0 place-items-center rounded-sm text-muted"
        :aria-label="isExpanded ? 'Collapse' : 'Expand'"
        @click.stop="emit('toggle', node)"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="sidebar-icon-sm transition-transform"
          :class="isExpanded ? 'rotate-90' : ''"
        />
      </button>
      <span v-else class="size-4" />
      <img v-if="datasourceIconSrc" :src="datasourceIconSrc" alt="" class="sidebar-icon-img" />
      <UIcon v-else :name="iconName" class="sidebar-icon" />
      <span class="min-w-0 flex-1 truncate" :title="node.type === 'recent-table' ? node.fullLabel : undefined">
        {{ node.label || node.name || node.key }}
      </span>
      <button
        v-if="node.type === 'recent-group' && node.clearable"
        type="button"
        class="grid size-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 hover:bg-[var(--app-hover-strong)] hover:text-highlighted focus-visible:opacity-100"
        aria-label="Clear recent tables"
        title="Clear recent tables"
        @click.stop="emit('clearRecent')"
      >
        <UIcon name="i-lucide-trash-2" class="size-3.5" />
      </button>
    </div>

    <ul v-if="isExpanded">
      <li
        v-if="loadingChildren[node.key]"
        class="px-1.5 py-0.5 text-[11px] text-muted"
        :style="{ paddingLeft: `${((depth || 0) + 1) * 12 + 20}px` }"
      >
        Loading...
      </li>
      <li
        v-else-if="!children.length"
        class="px-1.5 py-0.5 text-[11px] text-muted"
        :style="{ paddingLeft: `${((depth || 0) + 1) * 12 + 20}px` }"
      >
        No items
      </li>
      <ChenResourceTreeNode
        v-for="child in children"
        :key="child.key"
        :node="child"
        :depth="(depth || 0) + 1"
        :selected-key="selectedKey"
        :expanded-keys="expandedKeys"
        :children-map="childrenMap"
        :loading-children="loadingChildren"
        :db-type="dbType"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @activate="emit('activate', $event)"
        @menu="emit('menu', $event)"
        @clear-recent="emit('clearRecent')"
      />
    </ul>
  </li>
</template>
