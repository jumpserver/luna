<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject, GoCatalogPage } from "./api";
import type { ObjectWorkspaceSection, QueryContext } from "./workspace";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useChenWorkspacePreferences } from "~/chen/composables/useChenWorkspacePreferences";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { chenSqlDialect } from "~/chen/utils/sqlDialect";
import { writeClipboardText } from "~/utils/clipboard";
import { mergeCatalogNodes, objectKey, qualifiedObjectName, quoteIdentifier } from "./workspace";

const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  dialect: string;
  database: string;
  asset: string;
  ready: boolean;
  canPaste: boolean;
  canCopy: boolean;
  canInsert: boolean;
  recentObjects?: GoCatalogObject[];
}>();
const emit = defineEmits<{
  object: [object: GoCatalogObject, section?: ObjectWorkspaceSection];
  overview: [context: QueryContext, section?: "diagram"];
  query: [context: QueryContext, object?: GoCatalogObject];
  preview: [object: GoCatalogObject];
  insert: [text: string];
  browse: [object: GoCatalogObject];
  createTable: [context: QueryContext];
  clearRecent: [];
  close: [];
}>();
const { t } = useI18n();
const toast = useToast();
const preferences = useChenWorkspacePreferences();
const databaseNamespace = computed(() => chenSqlDialect(props.dialect).databaseNamespace);
interface Node {
  id: string;
  label: string;
  type: "connection" | "database" | "schema" | "group" | "object" | "column" | "recent";
  schema: string;
  kind?: "table" | "view";
  object?: GoCatalogObject;
  detail?: string;
  children: Node[];
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string;
  cursor?: string;
  more: boolean;
  generation: number;
}
interface Row {
  node: Node;
  depth: number;
  type: "node" | "loading" | "error" | "empty" | "more";
}
function node(type: Node["type"], label: string, schema = "", extra: Partial<Node> = {}): Node {
  return {
    id: JSON.stringify([type, schema, label]),
    label,
    type,
    schema,
    children: [],
    expanded: false,
    loaded: false,
    loading: false,
    error: "",
    more: false,
    generation: 0,
    ...extra
  };
}
const root = ref<Node>(node("connection", props.asset));
const recent = ref<Node>(node("recent", "recent", "", { loaded: true, expanded: true }));
watch(
  () => props.recentObjects,
  (objects) => {
    recent.value.children = (objects || []).map((object) => ({
      ...relation(object),
      id: `recent:${objectKey(object)}`,
      loaded: true
    }));
  },
  { immediate: true }
);
const selected = ref("");
const tree = ref<HTMLElement>();
const search = ref("");
const searchNode = ref<Node>(node("group", "search"));
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | undefined;
const controllers = new Set<AbortController>();
const searching = computed(() => !!search.value.trim());
let browsingSelection = "";
let browsingScroll = 0;
const rows = computed(() => {
  const result: Row[] = [];
  function walk(current: Node, depth: number) {
    result.push({ node: current, depth, type: "node" });
    if (current.expanded) children(current, depth + 1);
  }
  function children(current: Node, depth: number) {
    for (const child of current.children) walk(child, depth);
    if (current.loading) result.push({ node: current, depth, type: "loading" });
    else if (current.error) result.push({ node: current, depth, type: "error" });
    else if (current.more) result.push({ node: current, depth, type: "more" });
    else if (current.loaded && !current.children.length) result.push({ node: current, depth, type: "empty" });
  }
  if (searching.value) children(searchNode.value, 0);
  else {
    walk(recent.value, 0);
    walk(root.value, 0);
  }
  return result;
});
const focusable = computed(() => rows.value.filter((row) => row.type === "node"));
function groups(schema: string) {
  return (["table", "view"] as const).map((kind) => node("group", kind, schema, { kind }));
}
function relation(object: GoCatalogObject): Node {
  return node("object", object.name, object.schema, {
    id: objectKey(object),
    object,
    kind: object.kind,
    detail: object.comment
  });
}
async function load(current: Node, append = false) {
  if (!props.ready || current.loading) return;
  if (current.type === "connection" || current.type === "schema") return;
  if (current.type === "database" && databaseNamespace.value) return;
  const generation = ++current.generation;
  const controller = new AbortController();
  controllers.add(controller);
  current.loading = true;
  current.error = "";
  try {
    let page: GoCatalogPage<unknown>;
    let items: Node[];
    if (current.type === "database") {
      const schemas = await props.api.catalogSchemas(
        props.sessionId,
        append ? current.cursor : undefined,
        controller.signal
      );
      page = schemas;
      items = schemas.items.map((schema) =>
        node("schema", schema.name, schema.name, { loaded: true, children: groups(schema.name) })
      );
    } else if (current.type === "object" && current.object) {
      const columns = await props.api.catalogColumns(
        props.sessionId,
        current.schema,
        current.object.name,
        append ? current.cursor : undefined,
        controller.signal
      );
      page = columns;
      items = columns.items.map((column) =>
        node("column", column.name, current.schema, {
          id: JSON.stringify([current.id, column.name]),
          object: current.object,
          loaded: true,
          detail: `${column.data_type} · ${t(column.nullable ? "Chen.GoV1Nullable" : "Chen.GoV1NotNull")}${column.comment ? ` · ${column.comment}` : ""}`
        })
      );
    } else {
      const objects = await props.api.catalogObjects(
        props.sessionId,
        { schema: current.schema, kind: current.kind, cursor: append ? current.cursor : undefined },
        controller.signal
      );
      page = objects;
      items = objects.items.map(relation);
    }
    if (generation !== current.generation || controller.signal.aborted) return;
    current.children = mergeCatalogNodes(current.children, items, append);
    current.cursor = page.next_cursor;
    current.more = page.has_more;
    current.loaded = true;
  } catch (cause) {
    if (!controller.signal.aborted && generation === current.generation) current.error = chenErrorText(cause, t);
  } finally {
    controllers.delete(controller);
    if (generation === current.generation) current.loading = false;
  }
}
function expandable(current: Node) {
  return current.type !== "column" && !current.id.startsWith("recent:");
}
async function toggle(current: Node) {
  if (!expandable(current)) return;
  current.expanded = !current.expanded;
  if (current.expanded && !current.loaded) await load(current);
}
function select(current: Node, event: MouseEvent) {
  selected.value = current.id;
  // A native double click produces two clicks. Expand once, never run a query here.
  if (event.detail <= 1 && expandable(current)) void toggle(current);
}
function activate(current: Node) {
  if (current.object) emit("object", current.object, current.type === "column" ? "structure" : "data");
  else if (current.type === "database" || current.type === "schema")
    emit("overview", { database: props.database, schema: current.schema });
}
function icon(current: Node) {
  return {
    connection: "i-lucide-database-zap",
    recent: "i-lucide-history",
    database: "i-lucide-database",
    schema: "i-lucide-library-big",
    group: current.expanded ? "i-lucide-folder-open" : "i-lucide-folder",
    object: current.kind === "view" ? "i-lucide-eye" : "i-lucide-table-properties",
    column: "i-lucide-columns-3"
  }[current.type];
}
function label(current: Node) {
  if (current.type === "recent") return t("Chen.RecentlyTables");
  return current.type === "group" ? t(current.kind === "view" ? "Chen.GoV1Views" : "Chen.GoV1Tables") : current.label;
}
function collapseAll() {
  function collapse(current: Node) {
    current.expanded = false;
    current.children.forEach(collapse);
  }
  root.value.children.forEach(collapse);
  root.value.expanded = true;
  searchNode.value.children.forEach(collapse);
  selected.value = searching.value ? searchNode.value.children[0]?.id || "" : root.value.id;
}
function sqlName(current: Node, qualified = false) {
  if (current.object && qualified) {
    const object = qualifiedObjectName(current.object, props.dialect);
    return current.type === "column" ? `${object}.${quoteIdentifier(current.label, props.dialect)}` : object;
  }
  return quoteIdentifier(current.label, props.dialect);
}
async function copyName(current: Node, qualified = false) {
  if (!props.canCopy) return;
  try {
    await writeClipboardText(sqlName(current, qualified));
    toast.add({ title: t("Common.CopySuccess"), color: "success" });
  } catch {
    toast.add({ title: t("Common.CopyFailed"), color: "error" });
  }
}
async function refresh(current = root.value.children[0]!) {
  if (!current) return;
  if (current.type === "connection") return refresh(current.children[0]);
  if (current.type !== "schema" && !(current.type === "database" && databaseNamespace.value)) {
    current.expanded = true;
    await load(current);
    if (current.error) return;
  }
  for (const child of current.children) {
    if (child.expanded) await refresh(child);
    else if (child.type !== "schema" && child.type !== "column") child.loaded = false;
  }
}
function menu(current: Node) {
  if (current.type === "recent")
    return [
      {
        label: t("Chen.ClearRecentTables"),
        icon: "i-lucide-trash-2",
        disabled: !current.children.length,
        onSelect: () => emit("clearRecent")
      }
    ];
  const context = { database: props.database, schema: current.schema };
  return [
    ...(["connection", "database", "schema"].includes(current.type)
      ? [
          {
            label: t("Chen.GoDiagramTitle"),
            icon: "i-lucide-network",
            disabled:
              !props.ready ||
              ![
                "postgresql",
                "mysql",
                "mariadb",
                "oceanbase-mysql",
                "sqlserver",
                "oracle",
                "dameng",
                "oceanbase-oracle",
                "db2",
                "clickhouse"
              ].includes(props.dialect),
            onSelect: () => {
              if (props.ready)
                emit(
                  "overview",
                  {
                    database: props.database,
                    schema: current.type === "schema" ? current.schema : databaseNamespace.value ? props.database : ""
                  },
                  "diagram"
                );
            }
          },
          {
            label: t("Chen.GoOverviewOpen"),
            icon: "i-lucide-list-tree",
            disabled: !props.ready,
            onSelect: () => {
              if (props.ready)
                emit("overview", {
                  database: props.database,
                  schema: current.type === "schema" ? current.schema : databaseNamespace.value ? props.database : ""
                });
            }
          }
        ]
      : []),
    ...(["database", "schema", "object", "column"].includes(current.type)
      ? [
          {
            label: t("Chen.GoV1CopyName"),
            icon: "i-lucide-copy",
            disabled: !props.canCopy,
            onSelect: () => copyName(current)
          },
          ...(current.object
            ? [
                {
                  label: t("Chen.GoV1CopyQualifiedName"),
                  icon: "i-lucide-copy",
                  disabled: !props.canCopy,
                  onSelect: () => copyName(current, true)
                }
              ]
            : []),
          {
            label: t("Chen.GoV1InsertName"),
            icon: "i-lucide-text-cursor-input",
            disabled: !props.canPaste || !props.canInsert,
            onSelect: () => {
              if (props.canPaste && props.canInsert) emit("insert", sqlName(current, current.type === "object"));
            }
          }
        ]
      : []),
    ...(current.object
      ? [
          {
            label: t("Chen.GoV1Structure"),
            icon: "i-lucide-panel-top",
            onSelect: () => emit("object", current.object!, "structure")
          },
          {
            label: t("Chen.GoTableWorkspaceData"),
            icon: "i-lucide-table",
            disabled: !props.ready,
            onSelect: () => emit("preview", current.object!)
          },
          {
            label: t("Chen.GoV1GenerateSelect"),
            icon: "i-lucide-file-code-2",
            disabled: !props.ready || !props.canPaste,
            onSelect: () => emit("query", context, current.object!)
          }
        ]
      : []),
    ...(current.object
      ? [
          { label: "DDL", icon: "i-lucide-file-code-2", onSelect: () => emit("object", current.object!, "ddl") },
          {
            label: t("Chen.GoDiagramTitle"),
            icon: "i-lucide-git-fork",
            disabled: current.object.kind !== "table",
            onSelect: () => emit("object", current.object!, "diagram")
          }
        ]
      : []),
    {
      label: t("Chen.CreateTable"),
      icon: "i-lucide-table-2",
      disabled: !props.ready,
      onSelect: () => emit("createTable", context)
    },
    {
      label: t("Chen.GoV1NewQueryHere"),
      icon: "i-lucide-plus",
      disabled: !props.ready,
      onSelect: () => emit("query", context)
    },
    {
      label: t("Chen.GoV1Refresh"),
      icon: "i-lucide-refresh-cw",
      disabled: !props.ready || current.loading || current.type === "column",
      onSelect: () => refresh(current)
    }
  ];
}
async function focusNode(index: number) {
  const target = focusable.value[index];
  if (!target) return;
  selected.value = target.node.id;
  await nextTick();
  tree.value?.querySelectorAll<HTMLElement>("[data-tree-node]")[index]?.focus();
}
async function keydown(event: KeyboardEvent, current: Node) {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + 24, clientY: rect.bottom })
    );
    return;
  }
  const index = focusable.value.findIndex((row) => row.node.id === current.id);
  if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key))
    event.preventDefault();
  if (event.key === "ArrowDown") void focusNode(Math.min(index + 1, focusable.value.length - 1));
  if (event.key === "ArrowUp") void focusNode(Math.max(0, index - 1));
  if (event.key === "Home") void focusNode(0);
  if (event.key === "End") void focusNode(focusable.value.length - 1);
  if (event.key === "Enter") {
    if (current.object || current.type === "database" || current.type === "schema") activate(current);
    else void toggle(current);
  }
  if (event.key === " ") selected.value = current.id;
  if (event.key === "ArrowRight") {
    if (!current.expanded) await toggle(current);
    else if (current.children.length) void focusNode(index + 1);
  }
  if (event.key === "ArrowLeft") {
    if (current.expanded) current.expanded = false;
    else {
      const depth = focusable.value[index]?.depth || 0;
      for (let i = index - 1; i >= 0; i--)
        if (focusable.value[i]!.depth < depth) {
          void focusNode(i);
          break;
        }
    }
  }
}
async function runSearch(append = false) {
  if (!props.ready || !searching.value) return;
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  const current = searchNode.value;
  current.loading = true;
  current.error = "";
  if (!append) {
    current.children = [];
    current.more = false;
  }
  try {
    const page = await props.api.catalogObjects(
      props.sessionId,
      { q: search.value.trim(), cursor: append ? current.cursor : undefined },
      controller.signal
    );
    if (controller.signal.aborted) return;
    current.children = append ? [...current.children, ...page.items.map(relation)] : page.items.map(relation);
    current.cursor = page.next_cursor;
    current.more = page.has_more;
    current.loaded = true;
  } catch (cause) {
    if (!controller.signal.aborted) current.error = chenErrorText(cause, t);
  } finally {
    if (!controller.signal.aborted) current.loading = false;
  }
}
watch(search, (value, previous) => {
  if (value.trim() && !previous.trim()) {
    browsingSelection = selected.value;
    browsingScroll = tree.value?.scrollTop || 0;
  }
  clearTimeout(searchTimer);
  searchController?.abort();
  searchNode.value.children = [];
  searchNode.value.loaded = false;
  searchNode.value.more = false;
  searchNode.value.loading = false;
  searchNode.value.error = "";
  if (searching.value && props.ready) {
    searchNode.value.loading = true;
    searchTimer = setTimeout(runSearch, 250);
  } else if (!searching.value) {
    selected.value = browsingSelection;
    void nextTick(() => {
      if (tree.value) tree.value.scrollTop = browsingScroll;
    });
  }
});
function initialize() {
  const database = node("database", props.database, databaseNamespace.value ? props.database : "", {
    expanded: true
  });
  if (databaseNamespace.value) {
    database.children = groups(props.database);
    database.loaded = true;
  }
  root.value = node("connection", props.asset, "", { expanded: true, loaded: true, children: [database] });
  selected.value = database.id;
  if (!databaseNamespace.value) void load(root.value.children[0]!);
}
onMounted(initialize);
watch(
  () => props.ready,
  (ready) => {
    clearTimeout(searchTimer);
    if (!ready) {
      searchController?.abort();
      searchNode.value.loading = false;
    } else if (searching.value) void runSearch();
    else if (root.value.children[0] && !root.value.children[0].loaded) void load(root.value.children[0]);
  }
);
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  searchController?.abort();
  for (const controller of controllers) controller.abort();
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    :class="{ 'select-none': !canCopy }"
    data-chen-catalog
    @copy="
      (event) => {
        if (!canCopy) event.preventDefault();
      }
    "
  >
    <div class="flex h-[var(--workspace-toolbar-height)] shrink-0 items-center gap-1 border-b border-default px-2.5">
      <span class="flex-1 text-xs font-medium text-muted">{{ t("Chen.GoV1Objects") }}</span>
      <UButton
        icon="i-lucide-fold-vertical"
        :ui="{ leadingIcon: 'size-3.5' }"
        :aria-label="t('Chen.GoV1CollapseAll')"
        :title="t('Chen.GoV1CollapseAll')"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="collapseAll"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        :ui="{ leadingIcon: 'size-3.5' }"
        :aria-label="t('Chen.GoV1Refresh')"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!ready"
        @click="searching ? runSearch() : refresh()"
      />
      <UPopover :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-settings-2"
          :ui="{ leadingIcon: 'size-3.5' }"
          :aria-label="t('Chen.WorkspaceSettings')"
          :title="t('Chen.WorkspaceSettings')"
          size="xs"
          color="neutral"
          variant="ghost"
        />
        <template #content>
          <div class="w-64 space-y-3 p-3 text-xs">
            <p class="font-medium">{{ t("Chen.WorkspaceSettingsTitle") }}</p>
            <label class="flex items-center justify-between gap-3">
              <span>{{ t("Chen.TableTabName") }}</span>
              <USelect
                v-model="preferences.tabTitleFormat"
                size="xs"
                class="w-28"
                :items="[
                  { label: t('Chen.TabTitleOnly'), value: 'table' },
                  { label: t('Chen.TabTitleTableSchema'), value: 'table-schema' }
                ]"
              />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span>{{ t("Chen.SqlKeywordCompletion") }}</span>
              <USelect
                v-model="preferences.sqlKeywordCase"
                size="xs"
                class="w-28"
                :items="[
                  { label: t('Chen.SqlCaseLower'), value: 'lower' },
                  { label: t('Chen.SqlCaseUpper'), value: 'upper' }
                ]"
              />
            </label>
          </div>
        </template>
      </UPopover>
      <UButton
        icon="i-lucide-panel-left-close"
        :ui="{ leadingIcon: 'size-3.5' }"
        :aria-label="t('Chen.CloseDatabaseExplorer')"
        :title="t('Chen.CloseDatabaseExplorer')"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="emit('close')"
      />
    </div>
    <div class="flex h-[var(--workspace-action-bar-height)] shrink-0 items-center border-b border-default px-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('Chen.GoV1FindTable')"
        :aria-label="t('Chen.GoV1FindTable')"
        size="xs"
        class="w-full"
        @keydown.esc="search = ''"
        @keydown.down.prevent="focusNode(0)"
      >
        <template v-if="search" #trailing>
          <UButton
            icon="i-lucide-x"
            :aria-label="t('Chen.GoV1ClearSearch')"
            color="neutral"
            variant="link"
            size="xs"
            @click="search = ''"
          />
        </template>
      </UInput>
    </div>
    <p v-if="!ready" class="shrink-0 border-b border-default px-3 py-1 text-[11px] text-warning">
      {{ t("Chen.GoV1CatalogStale") }}
    </p>
    <div
      ref="tree"
      role="tree"
      :aria-label="t('Chen.GoV1Objects')"
      class="app-tree min-h-0 flex-1 overflow-auto px-2 py-1 text-xs"
    >
      <template v-for="row in rows" :key="`${row.node.id}-${row.type}`">
        <UContextMenu v-if="row.type === 'node'" :items="menu(row.node)">
          <div
            role="treeitem"
            data-tree-node
            :tabindex="
              selected === row.node.id ||
              (!focusable.some((item) => item.node.id === selected) && focusable[0]?.node.id === row.node.id)
                ? 0
                : -1
            "
            :aria-level="row.depth + 1"
            :aria-selected="selected === row.node.id"
            :aria-expanded="expandable(row.node) ? row.node.expanded : undefined"
            :aria-busy="row.node.loading"
            class="app-tree-row sidebar-row group flex cursor-default items-center gap-1 rounded-md pr-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            :class="{ 'bg-[var(--app-hover-soft)]': selected === row.node.id }"
            :data-active="selected === row.node.id ? '' : undefined"
            :style="{ paddingLeft: `${row.depth * 12 + 6}px` }"
            :title="
              [
                row.node.object ? qualifiedObjectName(row.node.object, dialect) : '',
                row.node.type === 'column' ? row.node.label : row.node.object ? '' : label(row.node),
                row.node.detail
              ]
                .filter(Boolean)
                .join(' · ')
            "
            @click="select(row.node, $event)"
            @contextmenu="selected = row.node.id"
            @dblclick="activate(row.node)"
            @keydown="keydown($event, row.node)"
          >
            <button
              v-if="expandable(row.node)"
              type="button"
              tabindex="-1"
              class="flex size-5 shrink-0 items-center justify-center"
              :aria-label="t(row.node.expanded ? 'Chen.GoV1Collapse' : 'Chen.GoV1Expand')"
              @click.stop="toggle(row.node)"
              @dblclick.stop
            >
              <UIcon
                :name="
                  row.node.loading
                    ? 'i-lucide-loader-circle'
                    : row.node.expanded
                      ? 'i-lucide-chevron-down'
                      : 'i-lucide-chevron-right'
                "
                class="size-3.5"
                :class="{ 'animate-spin': row.node.loading }"
              />
            </button>
            <span v-else class="w-5 shrink-0" />
            <UIcon
              :name="icon(row.node)"
              class="app-tree-icon sidebar-icon shrink-0"
              :class="{ 'tree-folder-icon': row.node.type === 'group' }"
            />
            <span class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <span class="max-w-full shrink-0 truncate">{{ label(row.node) }}</span>
              <span v-if="searching && row.node.object" class="min-w-0 truncate text-muted">
                {{ row.node.object.schema }}
              </span>
              <span v-if="row.node.type === 'column'" class="min-w-0 truncate text-muted">{{ row.node.detail }}</span>
            </span>
            <UButton
              v-if="row.node.type === 'recent' && row.node.children.length"
              icon="i-lucide-trash-2"
              :aria-label="t('Chen.ClearRecentTables')"
              size="xs"
              color="neutral"
              variant="ghost"
              @click.stop="emit('clearRecent')"
              @dblclick.stop
            />
          </div>
        </UContextMenu>
        <div v-else :style="{ paddingLeft: `${row.depth * 12 + 14}px` }" class="pr-2 py-1.5 text-[11px] text-muted">
          <span v-if="row.type === 'loading'" role="status">{{ t("Chen.GoV1Loading") }}</span>
          <span v-else-if="row.type === 'empty'">
            {{ t(searching ? "Chen.GoV1NoRelations" : "Chen.GoV1EmptyCatalog") }}
          </span>
          <div v-else-if="row.type === 'error'" role="alert" class="space-y-1">
            <p class="break-words text-error">{{ row.node.error }}</p>
            <UButton
              :label="t('Chen.GoV1Retry')"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!ready"
              @click="searching ? runSearch() : load(row.node)"
            />
          </div>
          <UButton
            v-else-if="row.type === 'more'"
            :label="t('Chen.GoV1LoadMore')"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="!ready"
            @click="searching ? runSearch(true) : load(row.node, true)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
