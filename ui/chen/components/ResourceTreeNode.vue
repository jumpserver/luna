<script setup lang="ts">
import type { ChenTreeNode } from "~/chen/types";

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

function dbVendorIcon(dbType?: string) {
  const normalized = `${dbType || ""}`.toLowerCase();
  if (normalized.includes("postgres")) return "i-si-postgresql-fill";
  if (normalized.includes("mysql") || normalized.includes("mariadb")) return "i-si-mysql-fill";
  if (normalized.includes("mongo")) return "i-si-mongodb-fill";
  if (normalized.includes("redis")) return "i-si-redis-fill";
  if (normalized.includes("oracle")) return "i-si-oracle-fill";
  if (normalized.includes("sqlserver")) return "i-lucide-database-zap";
  if (normalized.includes("clickhouse")) return "i-lucide-cylinder";
  return "i-lucide-database-backup";
}

const iconName = computed(() => {
  switch (props.node.type) {
    case "datasource":
      return dbVendorIcon(props.dbType);
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
</script>

<template>
  <li>
    <div
      class="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[13px] transition hover:bg-accented"
      :class="selectedKey === node.key ? 'bg-accented' : ''"
      :style="{ paddingLeft: `${(depth || 0) * 12 + 6}px` }"
      @click="emit('select', node)"
      @dblclick="emit('activate', node)"
      @contextmenu.prevent="emit('menu', { node, event: $event })"
    >
      <button
        v-if="!node.leaf"
        type="button"
        class="flex size-4 items-center justify-center rounded-sm text-muted hover:bg-accented"
        @click.stop="emit('toggle', node)"
      >
        <UIcon :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
      </button>
      <span v-else class="size-4" />
      <UIcon :name="iconName" class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 truncate">{{ node.label || node.name || node.key }}</span>
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
