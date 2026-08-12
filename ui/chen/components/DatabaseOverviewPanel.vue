<script setup lang="ts">
import type { ChenDatabaseSection, ChenDatabaseWorkspaceTab, ChenTreeNode } from "~/chen/types";

const props = defineProps<{
  tab: ChenDatabaseWorkspaceTab;
  dbType?: string;
}>();

const emit = defineEmits<{
  selectSection: [section: ChenDatabaseSection];
  loadCatalog: [];
}>();

const sections: Array<{ id: ChenDatabaseSection; label: string }> = [
  { id: "basic", label: "Basic Info" },
  { id: "tables", label: "Tables" },
  { id: "views", label: "Views" },
  { id: "indexes", label: "Indexes" },
  { id: "ddl", label: "DDL" },
  { id: "diagram", label: "Diagram" }
];

interface CatalogItem {
  key: string;
  name: string;
  schema: string;
  type: string;
  table: string;
  columns: string;
  unique: string;
  method: string;
}

function nodeName(node: ChenTreeNode) {
  return String(node.label || node.name || node.key);
}

function collectCatalog(nodes: ChenTreeNode[], schema = "", result: CatalogItem[] = []) {
  for (const node of nodes) {
    const nextSchema = node.type === "schema" ? nodeName(node) : schema;
    if (node.type === "table" || node.type === "view" || node.type === "index") {
      result.push({
        key: node.key,
        name: nodeName(node),
        schema: nextSchema,
        type: node.type,
        table: String(node.table || node.tableName || ""),
        columns: Array.isArray(node.columns) ? node.columns.join(", ") : String(node.columns || ""),
        unique: node.unique == null ? "" : node.unique ? "Yes" : "No",
        method: String(node.method || node.indexType || "")
      });
    }
    collectCatalog(node.children || [], nextSchema, result);
  }
  return result;
}

const catalog = computed(() => collectCatalog(props.tab.node.children || []));
const visibleCatalog = computed(() => {
  const type = props.tab.activeSection === "tables" ? "table" : props.tab.activeSection === "views" ? "view" : "index";
  return catalog.value.filter((item) => item.type === type);
});
const databaseName = computed(() => nodeName(props.tab.node));
const ddl = computed(() => {
  const node = props.tab.node;
  return String(node.ddl || node.createSql || node.createSQL || node.definition || "").trim();
});
const basicInfo = computed(() => [
  { label: "Name", value: databaseName.value },
  { label: "Database type", value: props.dbType || "-" },
  { label: "Node type", value: props.tab.node.type || "database" },
  {
    label: "Tables",
    value: props.tab.catalogLoaded ? String(catalog.value.filter((item) => item.type === "table").length) : "Not loaded"
  },
  {
    label: "Views",
    value: props.tab.catalogLoaded ? String(catalog.value.filter((item) => item.type === "view").length) : "Not loaded"
  },
  {
    label: "Indexes",
    value: catalog.value.some((item) => item.type === "index")
      ? String(catalog.value.filter((item) => item.type === "index").length)
      : "Requires backend metadata"
  }
]);

function selectSection(section: ChenDatabaseSection) {
  emit("selectSection", section);
  if (section === "tables" || section === "views" || section === "indexes") emit("loadCatalog");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-default px-2 py-1">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-xs"
        :class="tab.activeSection === section.id ? 'bg-accented' : 'text-muted'"
        @click="selectSection(section.id)"
      >
        {{ section.label }}
      </button>
    </div>

    <div v-if="tab.activeSection === 'basic'" class="grid min-h-0 flex-1 gap-3 overflow-auto p-4 md:grid-cols-2">
      <div
        v-for="item in basicInfo"
        :key="item.label"
        class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
      >
        <div class="mb-1 text-[11px] uppercase tracking-wide text-muted">{{ item.label }}</div>
        <div class="text-sm">{{ item.value }}</div>
      </div>
    </div>

    <div
      v-else-if="tab.activeSection === 'tables' || tab.activeSection === 'views' || tab.activeSection === 'indexes'"
      class="min-h-0 flex-1 overflow-auto p-3"
    >
      <div v-if="tab.catalogLoading" class="grid h-full place-items-center text-sm text-muted">
        <span class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading catalog...
        </span>
      </div>
      <div v-else-if="tab.catalogError" class="grid h-full place-items-center gap-3 text-sm text-error">
        <span>{{ tab.catalogError }}</span>
        <UButton size="xs" color="neutral" variant="soft" @click="emit('loadCatalog')">Retry</UButton>
      </div>
      <div v-else-if="visibleCatalog.length" class="overflow-hidden rounded-lg border border-default">
        <table class="w-full text-left text-sm">
          <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
            <tr v-if="tab.activeSection === 'indexes'">
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Schema</th>
              <th class="px-3 py-2 font-medium">Table</th>
              <th class="px-3 py-2 font-medium">Columns</th>
              <th class="px-3 py-2 font-medium">Unique</th>
              <th class="px-3 py-2 font-medium">Method</th>
            </tr>
            <tr v-else>
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Schema</th>
              <th class="px-3 py-2 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="tab.activeSection === 'indexes'">
              <tr v-for="item in visibleCatalog" :key="item.key" class="border-t border-default">
                <td class="px-3 py-2">{{ item.name }}</td>
                <td class="px-3 py-2 text-muted">{{ item.schema || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.table || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.columns || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.unique || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.method || "-" }}</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="item in visibleCatalog" :key="item.key" class="border-t border-default">
                <td class="px-3 py-2">{{ item.name }}</td>
                <td class="px-3 py-2 text-muted">{{ item.schema || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.type }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div
        v-else-if="tab.activeSection === 'indexes'"
        class="grid h-full place-items-center p-6 text-center text-sm text-muted"
      >
        <div class="max-w-lg">
          <UIcon name="i-lucide-list-tree" class="mx-auto mb-3 size-8" />
          <div class="font-medium text-[var(--app-fg)]">Index metadata is not available yet</div>
          <p class="mt-2 text-xs leading-5">
            The page is ready and will display database-level indexes when the server provides index name, schema,
            table, columns, uniqueness, and method metadata.
          </p>
        </div>
      </div>
      <div v-else class="grid h-full place-items-center text-sm text-muted">
        No {{ tab.activeSection }} found in the loaded catalog.
      </div>
    </div>

    <div v-else-if="tab.activeSection === 'ddl'" class="min-h-0 flex-1 overflow-auto p-3">
      <pre
        v-if="ddl"
        class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]"
        >{{ ddl }}</pre>
      <div v-else class="grid h-full place-items-center p-6 text-center text-sm text-muted">
        <div class="max-w-lg">
          <UIcon name="i-lucide-file-code-2" class="mx-auto mb-3 size-8" />
          <div class="font-medium text-[var(--app-fg)]">Database DDL is not available yet</div>
          <p class="mt-2 text-xs leading-5">
            This page will render the database DDL when it is included in the server metadata response.
          </p>
        </div>
      </div>
    </div>

    <div v-else class="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
      <div class="max-w-lg rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-5 text-center">
        <UIcon name="i-lucide-workflow" class="mx-auto mb-3 size-8 text-muted" />
        <h3 class="text-sm font-medium">Database diagram is waiting for schema metadata</h3>
        <p class="mt-2 text-xs leading-5 text-muted">
          The page is ready, but a database-level diagram needs table columns and relationships from the server. It will
          be loaded explicitly by selected schema instead of fetching an entire large database when this tab opens.
        </p>
      </div>
    </div>
  </div>
</template>
