<script setup lang="ts">
import type { ChenDatabaseSection, ChenDatabaseWorkspaceTab, ChenTreeNode } from "~/chen/types";
import type { ChenSchemaOverview } from "~/chen/types/schemaOverview";
import SchemaDiagram from "./SchemaDiagram.vue";

const props = defineProps<{
  tab: ChenDatabaseWorkspaceTab;
  dbType?: string;
}>();

const emit = defineEmits<{
  selectSection: [section: ChenDatabaseSection];
  loadCatalog: [];
  openTable: [tableName: string];
}>();

const databaseSections: Array<{ id: ChenDatabaseSection; label: string }> = [
  { id: "basic", label: "Basic Info" },
  { id: "schemas", label: "Schemas" }
];
const schemaSections: Array<{ id: ChenDatabaseSection; label: string }> = [
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
  displayType: string;
  table: string;
  columns: string;
  unique: string;
  method: string;
  rowCount: string;
  size: string;
  engine: string;
  characterSet: string;
  collation: string;
  comment: string;
}

function collectSchemaOverview(overview: ChenSchemaOverview): CatalogItem[] {
  return [
    ...overview.tables.map((table) => ({
      key: `table:${table.schema}:${table.name}`,
      name: table.name,
      schema: table.schema,
      type: "table",
      displayType: "TABLE",
      table: table.name,
      columns: "",
      unique: "",
      method: "",
      rowCount: formatCount(table.estimatedRows),
      size: formatBytes(table.totalSizeBytes),
      engine: table.engine || "",
      characterSet: table.characterSet || "",
      collation: table.collation || "",
      comment: table.comment || ""
    })),
    ...overview.views.map((view) => ({
      key: `view:${view.schema}:${view.name}`,
      name: view.name,
      schema: view.schema,
      type: "view",
      displayType: view.type,
      table: "",
      columns: "",
      unique: "",
      method: "",
      rowCount: "",
      size: "",
      engine: "",
      characterSet: "",
      collation: "",
      comment: view.comment || ""
    })),
    ...overview.indexes.map((index) => ({
      key: `index:${index.schema}:${index.table}:${index.name}`,
      name: index.name,
      schema: index.schema,
      type: "index",
      displayType: "INDEX",
      table: index.table,
      columns: index.columns.join(", "),
      unique: index.unique == null ? "" : index.unique ? "Yes" : "No",
      method: index.method || "",
      rowCount: "",
      size: "",
      engine: "",
      characterSet: "",
      collation: "",
      comment: ""
    }))
  ];
}

function nodeName(node: ChenTreeNode) {
  return String(node.label || node.name || node.key);
}

function metadataValue(node: ChenTreeNode, keys: string[]) {
  const sources = [node, node.meta, node.metadata, node.extra].filter((item): item is Record<string, any> =>
    Boolean(item && typeof item === "object")
  );
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function formatCount(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? new Intl.NumberFormat().format(number) : "";
}

function formatBytes(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const bytes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (unitIndex + 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function collectCatalog(nodes: ChenTreeNode[], schema = "", result: CatalogItem[] = []) {
  for (const node of nodes) {
    const nextSchema = node.type === "schema" ? nodeName(node) : schema;
    if (node.type === "schema" || node.type === "table" || node.type === "view" || node.type === "index") {
      result.push({
        key: node.key,
        name: nodeName(node),
        schema: nextSchema,
        type: node.type,
        displayType: node.type.toUpperCase(),
        table: String(node.table || node.tableName || ""),
        columns: Array.isArray(node.columns) ? node.columns.join(", ") : String(node.columns || ""),
        unique: node.unique == null ? "" : node.unique ? "Yes" : "No",
        method: String(node.method || node.indexType || ""),
        rowCount: formatCount(
          metadataValue(node, ["rowCount", "row_count", "rows", "tableRows", "table_rows", "estimatedRows"])
        ),
        size: formatBytes(
          metadataValue(node, ["totalSize", "total_size", "tableSize", "table_size", "size", "dataLength"])
        ),
        engine: String(metadataValue(node, ["engine", "storageEngine", "storage_engine"]) || ""),
        characterSet: String(
          metadataValue(node, ["characterSet", "character_set", "charset", "tableCharset", "table_charset"]) || ""
        ),
        collation: String(metadataValue(node, ["collation", "tableCollation", "table_collation"]) || ""),
        comment: String(metadataValue(node, ["comment", "description", "tableComment", "table_comment"]) || "")
      });
    }
    collectCatalog(node.children || [], nextSchema, result);
  }
  return result;
}

const isDatabase = computed(() => props.tab.node.type === "database");
const catalog = computed(() =>
  isDatabase.value
    ? collectCatalog(props.tab.node.children || [])
    : props.tab.schemaOverview
      ? collectSchemaOverview(props.tab.schemaOverview)
      : []
);
const sections = computed(() => (isDatabase.value ? databaseSections : schemaSections));
const visibleCatalog = computed(() => {
  const type =
    props.tab.activeSection === "schemas"
      ? "schema"
      : props.tab.activeSection === "tables"
        ? "table"
        : props.tab.activeSection === "views"
          ? "view"
          : "index";
  return catalog.value.filter((item) => item.type === type);
});
const databaseName = computed(() => nodeName(props.tab.node));
const ddl = computed(() => {
  if (!isDatabase.value && props.tab.schemaOverview) return props.tab.schemaOverview.ddl || "";
  const node = props.tab.node;
  return String(node.ddl || node.createSql || node.createSQL || node.definition || "").trim();
});
function catalogSummary(count: number) {
  if (props.tab.catalogLoading) return "Loading...";
  if (props.tab.catalogError) return "Load failed";
  return props.tab.catalogLoaded ? String(count) : "Not loaded";
}

const basicInfo = computed(() => {
  const common = [
    { label: "Name", value: databaseName.value },
    { label: "Database type", value: props.dbType || "-" },
    { label: "Object type", value: props.tab.node.type || "-" }
  ];
  if (isDatabase.value) {
    return [
      ...common,
      {
        label: "Schemas",
        value: catalogSummary(catalog.value.filter((item) => item.type === "schema").length)
      }
    ];
  }
  return [
    ...common,
    {
      label: "Tables",
      value: catalogSummary(catalog.value.filter((item) => item.type === "table").length)
    },
    {
      label: "Views",
      value: catalogSummary(catalog.value.filter((item) => item.type === "view").length)
    },
    {
      label: "Indexes",
      value: props.tab.schemaOverview?.capabilities.indexes
        ? String(catalog.value.filter((item) => item.type === "index").length)
        : "Not supported"
    }
  ];
});

function selectSection(section: ChenDatabaseSection) {
  emit("selectSection", section);
  if (
    section === "schemas" ||
    section === "tables" ||
    section === "views" ||
    section === "indexes" ||
    section === "ddl"
  ) {
    emit("loadCatalog");
  }
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
        v-if="tab.catalogLoading"
        class="flex items-center gap-2 rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2 text-sm text-muted md:col-span-2"
      >
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Loading schema metadata...
      </div>
      <div
        v-else-if="tab.catalogError"
        class="flex items-center justify-between gap-3 rounded-lg border border-error/40 bg-error/5 px-3 py-2 text-sm text-error md:col-span-2"
      >
        <span>{{ tab.catalogError }}</span>
        <UButton size="xs" color="neutral" variant="soft" @click="emit('loadCatalog')">Retry</UButton>
      </div>
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
      v-else-if="
        tab.activeSection === 'schemas' ||
        tab.activeSection === 'tables' ||
        tab.activeSection === 'views' ||
        tab.activeSection === 'indexes'
      "
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
      <div v-else-if="visibleCatalog.length" class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-max text-left text-sm">
          <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
            <tr v-if="tab.activeSection === 'indexes'">
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Schema</th>
              <th class="px-3 py-2 font-medium">Table</th>
              <th class="px-3 py-2 font-medium">Columns</th>
              <th class="px-3 py-2 font-medium">Unique</th>
              <th class="px-3 py-2 font-medium">Method</th>
            </tr>
            <tr v-else-if="tab.activeSection === 'schemas'">
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Type</th>
            </tr>
            <tr v-else-if="tab.activeSection === 'tables'">
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Schema</th>
              <th class="px-3 py-2 text-right font-medium" title="May be an estimate depending on the database">
                Rows
              </th>
              <th class="px-3 py-2 text-right font-medium">Size</th>
              <th class="px-3 py-2 font-medium">Engine</th>
              <th class="px-3 py-2 font-medium">Character Set</th>
              <th class="px-3 py-2 font-medium">Collation</th>
              <th class="px-3 py-2 font-medium">Comment</th>
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
            <template v-else-if="tab.activeSection === 'schemas'">
              <tr v-for="item in visibleCatalog" :key="item.key" class="border-t border-default">
                <td class="px-3 py-2">{{ item.name }}</td>
                <td class="px-3 py-2 text-muted">Schema</td>
              </tr>
            </template>
            <template v-else-if="tab.activeSection === 'tables'">
              <tr v-for="item in visibleCatalog" :key="item.key" class="border-t border-default">
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class="text-left text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    @click="emit('openTable', item.name)"
                  >
                    {{ item.name }}
                  </button>
                </td>
                <td class="px-3 py-2 text-muted">{{ item.schema || "-" }}</td>
                <td class="px-3 py-2 text-right tabular-nums text-muted">{{ item.rowCount || "-" }}</td>
                <td class="px-3 py-2 text-right tabular-nums text-muted">{{ item.size || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.engine || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.characterSet || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.collation || "-" }}</td>
                <td class="max-w-64 truncate px-3 py-2 text-muted" :title="item.comment">{{ item.comment || "-" }}</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="item in visibleCatalog" :key="item.key" class="border-t border-default">
                <td class="px-3 py-2">{{ item.name }}</td>
                <td class="px-3 py-2 text-muted">{{ item.schema || "-" }}</td>
                <td class="px-3 py-2 text-muted">{{ item.displayType }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="tab.activeSection === 'tables' && visibleCatalog.length" class="mt-2 px-1 text-[11px] text-muted">
        Row counts may be estimated by the database. Statistics, engine, character set, and collation require table
        metadata from the server; unavailable fields are shown as “-”.
      </p>
      <div
        v-else-if="
          !visibleCatalog.length && tab.activeSection === 'indexes' && !tab.schemaOverview?.capabilities.indexes
        "
        class="grid h-full place-items-center p-6 text-center text-sm text-muted"
      >
        <div class="max-w-lg">
          <UIcon name="i-lucide-list-tree" class="mx-auto mb-3 size-8" />
          <div class="font-medium text-[var(--app-fg)]">Index metadata is not supported</div>
          <p class="mt-2 text-xs leading-5">This database metadata provider does not expose schema-level indexes.</p>
        </div>
      </div>
      <div v-else-if="!visibleCatalog.length" class="grid h-full place-items-center text-sm text-muted">
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
          <div class="font-medium text-[var(--app-fg)]">
            {{ isDatabase ? "Database" : "Schema" }} DDL is not available yet
          </div>
          <p class="mt-2 text-xs leading-5">
            {{
              tab.schemaOverview?.capabilities.ddl === false
                ? "This database metadata provider does not expose schema DDL."
                : "The server returned no schema DDL."
            }}
          </p>
        </div>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <div v-if="tab.catalogLoading" class="grid h-full place-items-center text-sm text-muted">
        <span class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading schema diagram...
        </span>
      </div>
      <div v-else-if="tab.catalogError" class="grid h-full place-items-center gap-3 text-sm text-error">
        <span>{{ tab.catalogError }}</span>
        <UButton size="xs" color="neutral" variant="soft" @click="emit('selectSection', 'diagram')">Retry</UButton>
      </div>
      <div
        v-else-if="tab.schemaOverview?.capabilities.diagram === false"
        class="grid h-full place-items-center p-6 text-center text-sm text-muted"
      >
        <div class="max-w-lg">
          <UIcon name="i-lucide-workflow" class="mx-auto mb-3 size-8" />
          <div class="font-medium text-[var(--app-fg)]">Schema diagram is not supported</div>
          <p class="mt-2 text-xs leading-5">This provider does not expose table column metadata.</p>
        </div>
      </div>
      <SchemaDiagram
        v-else-if="tab.schemaOverview?.diagram.length"
        :tables="tab.schemaOverview.diagram"
        :relationships-supported="tab.schemaOverview.capabilities.diagramRelationships"
        @open-table="emit('openTable', $event)"
      />
      <div v-else class="grid h-full place-items-center text-sm text-muted">No tables found in this schema.</div>
    </div>
  </div>
</template>
