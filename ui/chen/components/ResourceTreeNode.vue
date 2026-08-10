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
  if (props.node.type === "table" || props.node.type === "view") emit("activate", props.node);
}
</script>

<template>
  <li>
    <div
      class="sidebar-row flex h-7 w-full cursor-default items-center gap-1 rounded-lg pr-1 text-left text-xs"
      :class="selectedKey === node.key ? 'bg-[var(--app-selected-soft)] text-[var(--app-fg)]' : ''"
      :data-active="selectedKey === node.key ? '' : undefined"
      :style="{ paddingLeft: `${(depth || 0) * 12 + 6}px` }"
      @click="handleRowClick"
      @dblclick="handleRowDoubleClick"
      @contextmenu.prevent="emit('menu', { node, event: $event })"
    >
      <button
        v-if="!node.leaf"
        type="button"
        class="grid size-4 shrink-0 place-items-center rounded-sm text-muted hover:bg-[var(--app-hover-strong)]"
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
      <span class="min-w-0 flex-1 truncate">{{ node.label || node.name || node.key }}</span>
    </div>

    <ul v-if="isExpanded" class="space-y-0.5">
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
      />
    </ul>
  </li>
</template>
