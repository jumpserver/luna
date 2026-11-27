<script setup lang="ts">
import type {
  ChenGoApi,
  GoCatalogRelation,
  GoCatalogPage,
  GoCatalogCapabilities,
  GoCatalogEntry,
  GoProgramSummary,
  GoProgramIntent,
  GoProgramKind
} from "./api";
import type { ObjectWorkspaceSection, QueryContext } from "./workspace";
import { ChenGoError } from "./api";
import { catalogRef, isProgram } from "./catalogIdentity";
import { programActions, isProgramKind } from "./programActions";
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
  schema?: string;
  asset: string;
  ready: boolean;
  canPaste: boolean;
  canCopy: boolean;
  canInsert: boolean;
  revision?: number;
  recentObjects?: GoCatalogEntry[];
  activeObject?: GoCatalogEntry;
  activeScope?: QueryContext;
}>();
const emit = defineEmits<{
  object: [object: GoCatalogRelation, section?: ObjectWorkspaceSection];
  overview: [context: QueryContext, section?: "diagram"];
  query: [context: QueryContext, object?: GoCatalogRelation];
  insert: [text: string];
  createTable: [context: QueryContext];
  program: [object: GoProgramSummary];
  objectAction: [intent: GoProgramIntent];
  capabilities: [database: string, capabilities: GoCatalogCapabilities];
  clearRecent: [];
  removeRecent: [object: GoCatalogEntry];
  defaultContext: [context: QueryContext];
}>();
const { t } = useI18n();
const toast = useToast();
const preferences = useChenWorkspacePreferences();
const databaseNamespace = computed(() => chenSqlDialect(props.dialect).databaseNamespace);
const connectionContext = ref<QueryContext>({ database: props.database, schema: props.schema || "" });
interface Node {
  id: string;
  label: string;
  type: "connection" | "database" | "schema" | "group" | "object" | "recent";
  schema: string;
  database: string;
  kind?: GoCatalogRelation["kind"] | GoProgramKind;
  collection?: string;
  object?: GoCatalogEntry;
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
  const database = extra.database || "";
  return {
    id: `node:${JSON.stringify([type, database, schema, label])}`,
    label,
    type,
    schema,
    database,
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
// Inserting a recent item above a clicked row can put the second click of a
// double click on its neighbour. Keep the visible rows steady while pointing.
let holdingRecent = false;
function syncRecent() {
  recent.value.children = (props.recentObjects || []).map((object) => ({
    ...entry(object),
    id: `recent:${objectKey(object, props.sessionId)}`
  }));
}
watch(
  () => props.recentObjects,
  (items, previous) => {
    if (!holdingRecent || (items?.length || 0) < (previous?.length || 0)) syncRecent();
  },
  { immediate: true }
);
function releaseRecent() {
  if (!holdingRecent) return;
  holdingRecent = false;
  syncRecent();
}
const selected = ref("");
const tree = ref<HTMLElement>();
const searchOpen = ref(false);
const search = ref("");
const searchKind = ref("all");
const searchButton = useTemplateRef("searchButton");
const searchInput = useTemplateRef("searchInput");
const searchNode = ref<Node>(node("group", "search"));
const searchScope = ref<QueryContext>({ database: "", schema: "" });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | undefined;
const controllers = new Set<AbortController>();
const searching = computed(() => !!search.value.trim());
let browsingSelection = "";
let browsingScroll = 0;
async function toggleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false;
    search.value = "";
    selected.value = browsingSelection;
    await nextTick();
    if (tree.value) tree.value.scrollTop = browsingScroll;
    searchButton.value?.$el.focus();
  } else {
    let current: Node | undefined;
    function visit(candidate: Node) {
      if (candidate.id === selected.value) current = candidate;
      for (const child of candidate.children) visit(child);
    }
    visit(root.value);
    visit(recent.value);
    searchScope.value = current?.database
      ? context(current)
      : props.activeScope?.database
        ? { ...props.activeScope }
        : { ...connectionContext.value };
    searchKind.value = "all";
    browsingSelection = selected.value;
    browsingScroll = tree.value?.scrollTop || 0;
    searchOpen.value = true;
    await nextTick();
    searchInput.value?.focus();
  }
}
function escapeSearch(event: KeyboardEvent) {
  if (!searchOpen.value || event.isComposing || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  void toggleSearch();
}
function syncSelection() {
  const scope = props.activeScope;
  if (!scope || searchOpen.value) return;
  const { database, schema } = scope;
  let match: Node | undefined;
  function visit(current: Node) {
    if (
      props.activeObject &&
      current.object &&
      objectKey(current.object, props.sessionId) === objectKey(props.activeObject, props.sessionId)
    )
      match = current;
    else if (
      !props.activeObject &&
      current.type === (schema && !databaseNamespace.value ? "schema" : "database") &&
      current.database === database &&
      (databaseNamespace.value || current.schema === schema)
    )
      match = current;
    for (const child of current.children) visit(child);
  }
  visit(root.value);
  if (!match && props.activeObject) visit(recent.value);
  if (match) selected.value = match.id;
}
watch(() => [props.activeObject, props.activeScope], syncSelection, { flush: "post" });
const rows = computed(() => {
  const result: Row[] = [];
  function walk(current: Node, depth: number) {
    result.push({ node: current, depth, type: "node" });
    if (expandable(current) && current.expanded) children(current, depth + 1);
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
const capabilities = ref(new Map<string, GoCatalogCapabilities>());
const searchKinds = computed(() =>
  groups("", searchScope.value.database).map((group) => ({
    label: label(group),
    value: group.kind!
  }))
);
async function negotiate(database: string, signal: AbortSignal) {
  if (!["postgresql", "mysql", "mariadb", "oceanbase-mysql"].includes(props.dialect)) return;
  let result: GoCatalogCapabilities;
  try {
    result = await props.api.catalogCapabilities(props.sessionId, database, signal);
  } catch (error) {
    // Older servers expose only the relation catalog.
    if (!(error instanceof ChenGoError && [404, 405].includes(error.status))) throw error;
    result = { version: 1, collections: {} };
  }
  if (signal.aborted) return;
  capabilities.value.set(database, result);
  emit("capabilities", database, result);
}
function groups(schema: string, database: string) {
  const groups = (["table", "view"] as const).map((kind) => node("group", kind, schema, { kind, database }));
  const caps = capabilities.value.get(database);
  if (caps?.version === 2) {
    for (const [collection, descriptor] of Object.entries(caps.collections)) {
      if (collection === "all" || !descriptor.actions.includes("list") || !descriptor.actions.includes("inspect"))
        continue;
      for (const kind of descriptor.kinds.filter(isProgramKind)) {
        groups.push(node("group", kind, schema, { kind, database, collection }));
      }
    }
  }
  return groups;
}
function context(current: Node): QueryContext {
  if (current.type === "connection") return { ...connectionContext.value };
  return { database: current.database, schema: current.schema };
}
function databaseNode(database: string) {
  return node("database", database, databaseNamespace.value ? database : "", {
    database,
    expanded: database === connectionContext.value.database
  });
}
function entry(object: GoCatalogEntry): Node {
  const ref = catalogRef(object);
  return node("object", ref.name, ref.schema, {
    id: objectKey(object, props.sessionId),
    database: ref.database,
    object,
    kind: ref.kind,
    loaded: true,
    detail: isProgram(object) ? object.signature || object.ref.table : object.comment
  });
}
async function load(current: Node, append = false) {
  if (!props.ready || current.loading || !expandable(current)) return;
  if (current.type === "schema") return;

  const generation = ++current.generation;
  const controller = new AbortController();
  controllers.add(controller);
  current.loading = true;
  current.error = "";
  try {
    let page: GoCatalogPage<unknown>;
    let items: Node[];
    if (current.type === "connection") {
      const databases = await props.api.catalogDatabases(
        props.sessionId,
        append ? current.cursor : undefined,
        controller.signal
      );
      if (generation !== current.generation || controller.signal.aborted) return;
      page = databases;
      connectionContext.value = { database: databases.database || "", schema: databases.schema || "" };
      emit("defaultContext", { ...connectionContext.value });
      items = databases.items.map((database) => databaseNode(database.name));
    } else if (current.type === "database") {
      if (!append) await negotiate(current.database, controller.signal);
      if (controller.signal.aborted) return;
      if (databaseNamespace.value) {
        items = groups(current.database, current.database);
        page = { items: [], has_more: false };
      } else {
        const schemas = await props.api.catalogSchemas(
          props.sessionId,
          append ? current.cursor : undefined,
          controller.signal,
          current.database
        );
        page = schemas;
        items = schemas.items.map((schema) =>
          node("schema", schema.name, schema.name, {
            database: current.database,
            expanded:
              current.database === connectionContext.value.database && schema.name === connectionContext.value.schema,
            loaded: true,
            children: groups(schema.name, current.database)
          })
        );
      }
    } else if (current.collection) {
      const objects = await props.api.catalogPrograms(
        props.sessionId,
        {
          database: current.database,
          schema: current.schema || undefined,
          collection: current.collection,
          kind: isProgramKind(current.kind) ? current.kind : undefined,
          cursor: append ? current.cursor : undefined
        },
        controller.signal
      );
      page = objects;
      items = objects.items.map(entry);
    } else {
      const objects = await props.api.catalogRelations(
        props.sessionId,
        {
          database: current.database,
          schema: current.schema || undefined,
          kind: current.kind === "table" || current.kind === "view" ? current.kind : undefined,
          cursor: append ? current.cursor : undefined
        },
        controller.signal
      );
      page = objects;
      items = objects.items.map(entry);
    }
    if (generation !== current.generation || controller.signal.aborted) return;
    const defaultDatabase = connectionContext.value.database;
    if (current.type === "connection" && defaultDatabase && !items.some((item) => item.database === defaultDatabase))
      items.unshift(
        current.children.find((item) => item.database === defaultDatabase) || databaseNode(defaultDatabase)
      );
    current.children = mergeCatalogNodes(current.children, items, append);
    if (current.type === "database" && !databaseNamespace.value) {
      for (const schema of current.children)
        schema.children = mergeCatalogNodes(schema.children, groups(schema.schema, current.database), false);
    }
    current.cursor = page.next_cursor;
    current.more = page.has_more;
    current.loaded = true;
    if (current.type === "connection") selectDefaultDatabase();
    syncSelection();
  } catch (cause) {
    if (!controller.signal.aborted && generation === current.generation) current.error = chenErrorText(cause, t);
  } finally {
    controllers.delete(controller);
    if (generation === current.generation) current.loading = false;
  }
}
function expandable(current: Node) {
  return current.type !== "object" && (current.type !== "recent" || current.children.length > 0);
}
async function toggle(current: Node) {
  if (!expandable(current)) return;
  current.expanded = !current.expanded;
  if (current.expanded) await resumeExpanded(current);
}
function select(current: Node, event: MouseEvent) {
  selected.value = current.id;
  if (searchOpen.value && !searchScope.value.database && current.database) searchScope.value = context(current);
  // A native double click produces two clicks. Expand once, never run a query here.
  if (event.detail <= 1 && current.object && isProgram(current.object)) {
    holdingRecent = true;
    emit("program", current.object);
  }
  if (event.detail <= 1 && expandable(current)) void toggle(current);
}
function activate(current: Node) {
  if (current.object && isProgram(current.object)) emit("program", current.object);
  else if (current.object) emit("object", current.object, "data");
  else if (current.type === "schema") emit("overview", context(current));
}
function icon(current: Node) {
  return {
    connection: "i-lucide-database-zap",
    recent: "i-lucide-history",
    database: "i-lucide-database",
    schema: "i-lucide-library-big",
    group: current.expanded ? "i-lucide-folder-open" : "i-lucide-folder",
    object:
      current.kind === "view"
        ? "i-lucide-eye"
        : current.kind === "trigger"
          ? "i-lucide-zap"
          : current.kind === "event"
            ? "i-lucide-clock"
            : isProgramKind(current.kind)
              ? "i-lucide-braces"
              : "i-lucide-table-properties"
  }[current.type];
}
function label(current: Node) {
  if (current.type === "recent") return t("Chen.ProgramRecent");
  if (current.type === "group" && isProgramKind(current.kind)) return t(`Chen.ProgramKind.${current.kind}`);
  if (current.object && isProgram(current.object)) return current.object.signature || current.object.label;
  return current.type === "group" ? t(current.kind === "view" ? "Chen.GoV1Views" : "Chen.GoV1Tables") : current.label;
}
function sqlName(current: Node, qualified = false) {
  if (current.object && qualified) {
    return qualifiedObjectName(catalogRef(current.object), props.dialect);
  }
  return quoteIdentifier(current.object ? catalogRef(current.object).name : current.label, props.dialect);
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
function invalidate(current: Node) {
  if (current.type !== "schema") current.loaded = false;
  for (const child of current.children) if (expandable(child)) invalidate(child);
}
async function resumeExpanded(current: Node) {
  if (!props.ready || !current.expanded || !expandable(current)) return;
  if (!current.loaded) await load(current);
  if (current.error) return;
  for (const child of current.children) if (child.expanded) await resumeExpanded(child);
}
async function refresh(current = root.value) {
  if (!current) return;
  if (!expandable(current)) {
    if (searching.value) return runSearch();
    const parent = focusable.value.find(({ node }) => node.children.some((child) => child.id === current.id));
    if (parent?.node.type === "recent") await refresh();
    else if (parent) await refresh(parent.node);
    return;
  }
  if (current.type !== "schema") {
    current.expanded = true;
    await load(current);
    if (current.error) return;
  }
  for (const child of current.children) {
    if (!expandable(child)) continue;
    if (child.expanded) await refresh(child);
    else invalidate(child);
  }
}
function clearRecent() {
  emit("clearRecent");
  void focusNode(0);
}
const menuActions = ref<string[]>([]);
let contextController: AbortController | undefined;
async function contextMenu(current: Node) {
  selected.value = current.id;
  contextController?.abort();
  menuActions.value = [];
  if (!current.object || !isProgram(current.object) || !props.ready) return;
  const controller = new AbortController();
  contextController = controller;
  try {
    const detail = await props.api.catalogObjectDetail(props.sessionId, current.object, controller.signal);
    if (!controller.signal.aborted) menuActions.value = detail.actions;
  } catch (cause) {
    if (!controller.signal.aborted) toast.add({ title: chenErrorText(cause, t), color: "error" });
  }
}
function createActions(current: Node) {
  if (current.type !== "group" || !current.collection || !isProgramKind(current.kind)) return [];
  const actions = capabilities.value.get(current.database)?.collections[current.collection]?.actions || [];
  if (!actions.includes("create"))
    return [
      {
        label: t("Chen.ProgramAction.create"),
        icon: "i-lucide-plus",
        disabled: !props.ready,
        onSelect: () => toast.add({ title: t("Chen.ProgramUnsupported"), color: "neutral" })
      }
    ];
  return programActions(
    { ref: { ...context(current), kind: current.kind, name: "" } },
    actions.filter((action) => action === "create"),
    props.ready,
    t,
    (intent) => emit("objectAction", intent)
  );
}
const selectedGroupActions = computed(() => {
  const current = focusable.value.find(({ node }) => node.id === selected.value)?.node;
  return current ? createActions(current) : [];
});
function menu(current: Node) {
  if (current.type === "recent")
    return [
      {
        label: t("Chen.ClearRecentTables"),
        icon: "i-lucide-trash-2",
        disabled: !current.children.length,
        onSelect: clearRecent
      }
    ];
  const scope = context(current);
  const relation = current.object && !isProgram(current.object) ? current.object : undefined;
  return [
    ...createActions(current),
    ...(current.object && isProgram(current.object)
      ? [
          { label: t("Chen.BasicInfo"), icon: "i-lucide-braces", onSelect: () => activate(current) },
          ...programActions(
            current.object,
            selected.value === current.id ? menuActions.value : [],
            props.ready,
            t,
            (intent) => emit("objectAction", intent)
          )
        ]
      : []),
    ...(current.id.startsWith("recent:") && current.object
      ? [
          {
            label: t("Chen.RemoveFromRecent"),
            icon: "i-lucide-trash-2",
            onSelect: () => emit("removeRecent", current.object!)
          }
        ]
      : []),
    ...(["connection", "database", "schema"].includes(current.type)
      ? [
          {
            label: t("Chen.GoDiagramTitle"),
            icon: "i-lucide-network",
            disabled:
              !props.ready ||
              !scope.database ||
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
              if (props.ready && scope.database) emit("overview", scope, "diagram");
            }
          }
        ]
      : []),
    ...(current.type === "schema" || current.type === "database"
      ? [
          {
            label: t("Chen.GoOverviewOpen"),
            icon: "i-lucide-list-tree",
            disabled: !props.ready,
            onSelect: () => {
              if (props.ready) emit("overview", scope);
            }
          }
        ]
      : []),
    ...(["database", "schema", "object"].includes(current.type)
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
    ...(relation
      ? [
          {
            label: t("Chen.GoV1Structure"),
            icon: "i-lucide-panel-top",
            onSelect: () => emit("object", relation, "structure")
          },
          {
            label: t("Chen.GoTableWorkspaceData"),
            icon: "i-lucide-table",
            disabled: !props.ready,
            onSelect: () => emit("object", relation, "data")
          },
          {
            label: t("Chen.GoV1GenerateSelect"),
            icon: "i-lucide-file-code-2",
            disabled: !props.ready || !props.canPaste,
            onSelect: () => emit("query", scope, relation)
          }
        ]
      : []),
    ...(relation
      ? [
          { label: "DDL", icon: "i-lucide-file-code-2", onSelect: () => emit("object", relation, "ddl") },
          {
            label: t("Chen.GoDiagramTitle"),
            icon: "i-lucide-git-fork",
            disabled: relation.kind !== "table",
            onSelect: () => emit("object", relation, "diagram")
          }
        ]
      : []),
    {
      label: t("Chen.CreateTable"),
      icon: "i-lucide-table-2",
      disabled: !props.ready || !scope.database,
      onSelect: () => emit("createTable", scope)
    },
    {
      label: t("Chen.GoV1NewQueryHere"),
      icon: "i-lucide-plus",
      disabled: !props.ready,
      onSelect: () => emit("query", scope)
    },
    {
      label: t("Chen.GoV1Refresh"),
      icon: "i-lucide-refresh-cw",
      disabled: !props.ready || current.loading,
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
function focusSearchResults(event: KeyboardEvent) {
  if (event.isComposing || !searching.value || !focusable.value.length) return;
  event.preventDefault();
  void focusNode(0);
}
async function keydown(event: KeyboardEvent, current: Node) {
  releaseRecent();
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
    if (current.object || current.type === "schema") activate(current);
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
  if (!searchScope.value.database) return;
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
    const database = searchScope.value.database;
    if (!capabilities.value.has(database)) await negotiate(database, controller.signal);
    if (controller.signal.aborted) return;
    const options = { database, q: search.value.trim(), cursor: append ? current.cursor : undefined };
    const kind = searchKind.value;
    const group = groups("", database).find((group) => group.kind === kind);
    let page: GoCatalogPage<GoCatalogEntry>;
    if (kind === "all" && capabilities.value.get(database)?.collections.all?.actions.includes("list")) {
      page = await props.api.catalogSearch(props.sessionId, options, controller.signal);
    } else if (isProgramKind(kind) && group?.collection) {
      page = await props.api.catalogPrograms(
        props.sessionId,
        { ...options, kind, collection: group.collection },
        controller.signal
      );
    } else {
      page = await props.api.catalogRelations(
        props.sessionId,
        {
          ...options,
          schema: searchKinds.value.length > 2 ? undefined : searchScope.value.schema || undefined,
          kind: kind === "table" || kind === "view" ? kind : undefined
        },
        controller.signal
      );
    }
    if (controller.signal.aborted) return;
    current.children = mergeCatalogNodes(current.children, page.items.map(entry), append);
    current.cursor = page.next_cursor;
    current.more = page.has_more;
    current.loaded = true;
  } catch (cause) {
    if (!controller.signal.aborted) current.error = chenErrorText(cause, t);
  } finally {
    if (!controller.signal.aborted) current.loading = false;
  }
}
watch([search, searchKind], () => {
  clearTimeout(searchTimer);
  searchController?.abort();
  searchNode.value.children = [];
  searchNode.value.loaded = false;
  searchNode.value.more = false;
  searchNode.value.loading = false;
  searchNode.value.error = "";
  if (searching.value && props.ready && searchScope.value.database) {
    searchNode.value.loading = true;
    searchTimer = setTimeout(runSearch, 250);
  }
});
function initialize() {
  const children = connectionContext.value.database ? [databaseNode(connectionContext.value.database)] : [];
  root.value = node("connection", props.asset, "", {
    expanded: true,
    children
  });
  selected.value = children[0]?.id || root.value.id;
  void load(root.value);
}
function selectDefaultDatabase() {
  const defaultDatabase = connectionContext.value.database;
  if (!defaultDatabase) return;
  let database = root.value.children.find((child) => child.database === defaultDatabase);
  if (!database) {
    database = databaseNode(defaultDatabase);
    root.value.children.unshift(database);
  }
  if (selected.value === root.value.id) {
    database.expanded = true;
    selected.value = database.id;
  }
  if (database.expanded && !database.loaded) void resumeExpanded(database);
}
onMounted(() => {
  initialize();
  syncSelection();
});
watch(
  () => props.ready,
  (ready) => {
    clearTimeout(searchTimer);
    if (!ready) {
      searchController?.abort();
      searchNode.value.loading = false;
      for (const controller of controllers) controller.abort();
      function cancel(current: Node) {
        if (current.loading) current.loaded = false;
        current.generation++;
        current.loading = false;
        for (const child of current.children) cancel(child);
      }
      cancel(root.value);
    } else if (searching.value) void runSearch();
    else void resumeExpanded(root.value);
  }
);
watch(
  () => props.revision,
  () => {
    if (props.ready) {
      void refresh();
      if (searching.value) void runSearch();
    }
  }
);
onBeforeUnmount(() => {
  contextController?.abort();
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
    @keydown.esc="escapeSearch"
    @copy="
      (event) => {
        if (!canCopy) event.preventDefault();
      }
    "
  >
    <div class="flex h-[var(--workspace-toolbar-height)] shrink-0 items-center gap-1 border-b border-default px-2.5">
      <span class="flex-1 text-xs font-medium text-muted">{{ t("Chen.GoV1Objects") }}</span>
      <UButton
        v-for="item in selectedGroupActions"
        :key="item.label"
        :icon="item.icon"
        :aria-label="item.label"
        :title="item.label"
        :disabled="item.disabled"
        size="xs"
        color="neutral"
        variant="ghost"
        class="sidebar-icon-button"
        @click="item.onSelect"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        :ui="{ leadingIcon: 'size-3.5' }"
        :aria-label="t('Chen.GoV1Refresh')"
        :title="t('Chen.GoV1Refresh')"
        class="sidebar-icon-button"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!ready"
        @click="searching ? runSearch() : refresh()"
      />
      <UTooltip :text="t('Chen.ProgramFind')" :delay-duration="150">
        <UButton
          ref="searchButton"
          icon="i-lucide-search"
          :ui="{ leadingIcon: 'size-3.5' }"
          :aria-label="t('Chen.ProgramFind')"
          :aria-pressed="searchOpen"
          size="xs"
          color="neutral"
          variant="ghost"
          class="sidebar-icon-button"
          :class="{ 'sidebar-icon-button-active': searchOpen }"
          @click="toggleSearch"
        />
      </UTooltip>
      <UPopover :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-settings-2"
          :ui="{ leadingIcon: 'size-3.5' }"
          :aria-label="t('Chen.WorkspaceSettings')"
          :title="t('Chen.WorkspaceSettings')"
          class="sidebar-icon-button"
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
    </div>
    <p v-if="!ready" class="shrink-0 border-b border-default px-3 py-1 text-[11px] text-warning">
      {{ t("Chen.GoV1CatalogStale") }}
    </p>
    <div v-if="searchOpen" class="shrink-0 border-b border-default px-2.5 py-1.5">
      <USelect
        v-if="searchKinds.length > 2"
        v-model="searchKind"
        class="mb-1 w-full"
        size="xs"
        :aria-label="t('Chen.Type')"
        :items="[{ label: t('Chen.ProgramAllKinds'), value: 'all' }, ...searchKinds]"
      />
      <SideBarSearchInput
        ref="searchInput"
        v-model="search"
        :placeholder="t('Chen.ProgramFind')"
        :clear-label="t('Chen.GoV1ClearSearch')"
        :disabled="!searchScope.database"
        @keydown.down="focusSearchResults"
      />
    </div>
    <p v-if="searchOpen && !searchScope.database" class="shrink-0 px-4 py-3 text-center text-xs text-muted">
      {{ t("Chen.SelectDatabaseAction") }}
    </p>
    <p
      v-if="searchOpen && !searching && searchScope.database"
      class="grid min-h-0 flex-1 place-items-center px-4 text-center text-xs text-muted"
    >
      {{ t("Chen.ProgramFind") }}
    </p>
    <div
      v-else
      ref="tree"
      role="tree"
      @pointerleave="releaseRecent"
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
                row.node.object ? qualifiedObjectName(catalogRef(row.node.object), dialect) : '',
                row.node.object ? '' : label(row.node),
                row.node.detail
              ]
                .filter(Boolean)
                .join(' · ')
            "
            @pointerenter="row.node.type === 'recent' && releaseRecent()"
            @click="select(row.node, $event)"
            @contextmenu="contextMenu(row.node)"
            @dblclick="activate(row.node)"
            @keydown.self="keydown($event, row.node)"
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
              <span
                v-if="row.node.object && isProgram(row.node.object) && row.node.object.ref.table"
                class="min-w-0 truncate text-muted"
              >
                {{ row.node.object.ref.table }}
              </span>
              <span v-if="searching && row.node.object" class="min-w-0 truncate text-muted">
                {{ catalogRef(row.node.object).schema }}
              </span>
            </span>
            <UButton
              v-if="row.node.type === 'recent' && row.node.children.length"
              icon="i-lucide-trash-2"
              :aria-label="t('Chen.ClearRecentTables')"
              :title="t('Chen.ClearRecentTables')"
              size="xs"
              color="neutral"
              variant="ghost"
              :ui="{ leadingIcon: 'size-3.5' }"
              class="size-5 shrink-0 justify-center p-0 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-(--app-hover-strong) hover:text-highlighted [@media(hover:none)]:opacity-100"
              @click.stop="clearRecent"
              @dblclick.stop
            />
          </div>
        </UContextMenu>
        <div v-else :style="{ paddingLeft: `${row.depth * 12 + 14}px` }" class="pr-2 py-1.5 text-[11px] text-muted">
          <span v-if="row.type === 'loading'" role="status">{{ t("Chen.GoV1Loading") }}</span>
          <span v-else-if="row.type === 'empty'">
            {{ t("Chen.GoV1EmptyCatalog") }}
          </span>
          <div v-else-if="row.type === 'error'" role="alert" class="space-y-1">
            <p class="break-words text-error">{{ row.node.error }}</p>
            <UButton
              :label="t('Chen.GoV1Retry')"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!ready"
              @click="row.node === searchNode ? runSearch() : load(row.node)"
            />
          </div>
          <UButton
            v-else-if="row.type === 'more'"
            :label="t('Chen.GoV1LoadMore')"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="!ready"
            @click="row.node === searchNode ? runSearch(true) : load(row.node, true)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
