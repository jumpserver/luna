<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject } from "./api";
import type { GoOverview, OverviewRow, OverviewSection, OverviewValue, OverviewViewSection } from "./overview";
import type { QueryContext } from "./workspace";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { workspaceButtonClass } from "~/shared/theme/workspaceButton";
import { writeClipboardText } from "~/utils/clipboard";
import { ChenGoError } from "./api";
import GoCatalogDiagram from "./GoCatalogDiagram.vue";
import { overviewBytes, overviewIndexRows, overviewNumber } from "./overview";

const props = defineProps<{
  section?: OverviewViewSection;
  api: ChenGoApi;
  sessionId: string;
  scope: QueryContext;
  dialect: string;
  ready: boolean;
  visible: boolean;
  canCopy: boolean;
}>();
const emit = defineEmits<{
  diagramObject: [object: GoCatalogObject];
  object: [object: GoCatalogObject];
  section: [section: OverviewViewSection];
}>();
const { t, locale } = useI18n();
const section = ref<OverviewViewSection>(props.section || "basic");
const diagramVisited = ref(section.value === "diagram");
const sectionCache = new Map<OverviewSection, GoOverview>();
watch(
  () => props.section,
  (value) => {
    if (value) section.value = value;
  }
);
watch(section, (value) => emit("section", value));
const data = ref<GoOverview | null>(null);
const loading = ref(false);
const stale = ref(false);
const errorKey = ref("");
const unavailable = ref(false);
let controller: AbortController | undefined;
let generation = 0;
const requestSection = computed<OverviewSection>(() =>
  section.value === "basic"
    ? "statistics"
    : section.value === "ddl" || section.value === "diagram"
      ? "properties"
      : section.value
);
const sections = computed(() => [
  { id: "basic" as const, label: t("Chen.BasicInfo") },
  { id: "tables" as const, label: t("Chen.Tables") },
  { id: "views" as const, label: t("Chen.Views") },
  { id: "indexes" as const, label: t("Chen.Indexes") },
  { id: "ddl" as const, label: "DDL" },
  { id: "diagram" as const, label: t("Chen.Diagram") }
]);
const basicInfo = computed(() => [
  { label: t("Chen.Name"), value: props.scope.schema || props.scope.database },
  { label: t("Chen.DatabaseType"), value: props.dialect },
  { label: t("Chen.ObjectType"), value: "schema" },
  ...["tables", "views", "indexes"].map((key) => ({
    label: label(key),
    value: display(data.value?.section === "statistics" ? data.value.fields[key] : undefined, key)
  }))
]);
const paged = computed(() => ["tables", "views", "indexes"].includes(section.value));
const catalogRows = computed(() =>
  section.value === "indexes"
    ? overviewIndexRows(data.value?.items || [], data.value?.has_more)
    : data.value?.items || []
);
const catalogColumns = computed(() =>
  section.value === "tables"
    ? ["name", "schema", "estimated_rows", "total_bytes", "engine", "character_set", "collation", "comment"]
    : section.value === "views"
      ? ["name", "schema", "type"]
      : ["name", "schema", "table", "column", "unique", "method"]
);
const catalogLabels: Record<string, string> = {
  name: "Name",
  schema: "Schema",
  estimated_rows: "Rows",
  total_bytes: "Size",
  engine: "Engine",
  character_set: "CharacterSet",
  collation: "Collation",
  comment: "Comment",
  type: "Type",
  table: "Table",
  column: "Columns",
  unique: "Unique",
  method: "Method"
};
function catalogValue(row: OverviewRow, key: string) {
  if (key === "name") return row.name;
  if (key === "schema") return row.object.schema || "-";
  if (key === "table") return row.object.name;
  if (key === "type") return (row.object.object_type || row.object.kind).toUpperCase();
  const value = row.fields[key]?.value;
  if (value === undefined || value === null || value === "") return "-";
  if (key === "total_bytes") return overviewBytes(value, locale.value);
  if (key === "unique") return t(value === "true" ? "Chen.Yes" : "Chen.No");
  return key === "estimated_rows" ? overviewNumber(value, locale.value) : value;
}
function catalogTitle(row: OverviewRow, key: string) {
  const field = row.fields[key];
  if (key === "estimated_rows") return t("Chen.RowCountEstimateHint");
  return field && field.state !== "supported"
    ? t(`Chen.GoOverview${field.state}`)
    : key === "comment"
      ? field?.value || ""
      : undefined;
}
const labels: Record<string, string> = {
  tables: "Tables",
  views: "Views",
  statistics: "Statistics",
  indexes: "Indexes",
  properties: "Properties",
  estimated_rows: "EstimatedRows",
  data_bytes: "DataBytes",
  index_bytes: "IndexBytes",
  total_bytes: "TotalBytes",
  last_analyzed: "LastAnalyzed",
  engine: "Engine",
  character_set: "CharacterSet",
  encoding: "Encoding",
  collation: "Collation",
  character_classification: "CharacterClassification",
  comment: "Comment",
  schema_ddl: "SchemaDDL",
  server_version: "ServerVersion",
  unique: "Unique",
  method: "Method",
  definition: "Definition",
  column: "Column",
  expression: "Expression",
  position: "Position",
  direction: "Direction",
  prefix_length: "PrefixLength",
  included: "Included",
  tablespace: "Tablespace",
  status: "Status",
  average_row_length: "AverageRowLength",
  sample_size: "SampleSize",
  created: "Created"
};
function label(key: string) {
  return t(`Chen.GoOverview${labels[key] || key}`);
}
function display(field: OverviewValue | undefined, key: string) {
  if (!field) return t("Chen.GoOverviewunknown");
  if (field.value === null) return t(`Chen.GoOverview${field.state}`);
  let text = overviewNumber(field.value, locale.value);
  if (key.endsWith("_bytes")) text += " B";
  if (key === "unique") text = t(field.value === "true" ? "Chen.Yes" : "Chen.No");
  if (field.state !== "supported") text += ` · ${t(`Chen.GoOverview${field.state}`)}`;
  return text;
}
const summary = computed(() =>
  Object.entries(data.value?.fields || {}).filter(([key]) => !key.endsWith("_unknown") && key !== "schema_ddl")
);
const ddl = computed(() => (data.value?.section === "properties" ? data.value.fields.schema_ddl : undefined));
const copyFailed = ref(false);
async function copyDDL() {
  if (
    !props.canCopy ||
    !props.ready ||
    !props.visible ||
    stale.value ||
    ddl.value?.state !== "supported" ||
    !ddl.value.value
  )
    return;
  const current = generation;
  copyFailed.value = false;
  try {
    await writeClipboardText(ddl.value.value);
  } catch {
    if (current === generation) copyFailed.value = true;
  }
}
function stop() {
  generation++;
  copyFailed.value = false;
  controller?.abort();
  loading.value = false;
  if (data.value) stale.value = true;
}
async function load(append = false) {
  stop();
  if (!props.ready || !props.visible || unavailable.value || section.value === "diagram") return;
  const current = generation;
  const abort = new AbortController();
  controller = abort;
  const scope = { ...props.scope };
  const requestedSection = requestSection.value;
  loading.value = true;
  errorKey.value = "";
  try {
    const items: OverviewRow[] = append && data.value?.section === requestedSection ? [...data.value.items] : [];
    let cursor = append ? data.value?.next_cursor : undefined;
    const seen = new Set<string>();
    let value: GoOverview;
    for (let batch = 0; ; batch++) {
      value = await props.api.catalogOverview(
        props.sessionId,
        {
          ...scope,
          section: requestedSection,
          sort: "name_asc",
          limit: 200,
          cursor
        },
        abort.signal
      );
      if (abort.signal.aborted || generation !== current) return;
      if (value.database !== scope.database || value.schema !== scope.schema || value.section !== requestedSection)
        throw new Error("Catalog scope changed");
      items.push(...value.items);
      if (!paged.value || !value.has_more || batch >= 9 || items.length >= 10000) break;
      if (!value.next_cursor || seen.has(value.next_cursor)) throw new Error("Catalog cursor did not advance");
      seen.add(value.next_cursor);
      cursor = value.next_cursor;
    }
    data.value = { ...value, items };
    sectionCache.set(requestedSection, data.value);
    stale.value = false;
  } catch (cause) {
    if (abort.signal.aborted || generation !== current) return;
    if (cause instanceof ChenGoError && [404, 405, 501].includes(cause.status) && cause.code !== "catalog_not_found") {
      unavailable.value = true;
      errorKey.value = "OldBackend";
    } else
      errorKey.value =
        cause instanceof ChenGoError && cause.status === 403
          ? "restricted"
          : cause instanceof ChenGoError && cause.code === "overview_contract_changed"
            ? "ContractChanged"
            : cause instanceof ChenGoError && cause.code === "catalog_timeout"
              ? "Timeout"
              : "query_error";
  } finally {
    if (generation === current) loading.value = false;
  }
}
function refresh() {
  void load();
}
function open(object: GoCatalogObject) {
  if (props.ready && props.visible && !stale.value) emit("object", { ...object });
}
watch(section, (value) => {
  if (value === "diagram") diagramVisited.value = true;
  const cached = sectionCache.get(requestSection.value);
  if (value !== "diagram" && cached && props.ready && props.visible) {
    stop();
    data.value = cached;
    stale.value = false;
    errorKey.value = "";
  } else refresh();
});
watch(
  () => [props.api, props.sessionId, props.scope.database, props.scope.schema],
  () => {
    stop();
    data.value = null;
    sectionCache.clear();
    unavailable.value = false;
    void load();
  }
);
watch(
  () => [props.ready, props.visible],
  () => {
    if (!props.ready) sectionCache.clear();
    if (!props.ready || !props.visible) stop();
    else void load();
  },
  { immediate: true }
);
onBeforeUnmount(stop);
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-main)] text-default"
    data-chen-overview
    :class="{ 'select-none': !canCopy }"
    @copy="
      (event) => {
        if (!canCopy) event.preventDefault();
      }
    "
    @cut="
      (event) => {
        if (!canCopy) event.preventDefault();
      }
    "
  >
    <header
      class="flex h-(--workspace-sub-tab-height) min-w-0 shrink-0 items-center gap-1 border-b border-default px-2"
    >
      <nav
        class="flex min-w-0 flex-1 items-center gap-px overflow-x-auto whitespace-nowrap"
        :aria-label="t('Chen.GoOverviewTitle')"
      >
        <UButton
          v-for="item in sections"
          :key="item.id"
          size="xs"
          variant="ghost"
          class="shrink-0 aria-pressed:bg-(--app-selected-soft)"
          :class="section === item.id ? undefined : workspaceButtonClass"
          :label="item.label"
          :aria-pressed="section === item.id"
          :color="section === item.id ? 'primary' : 'neutral'"
          @click="section = item.id"
        />
      </nav>
      <UButton
        v-if="section === 'ddl' && ddl?.value"
        icon="i-lucide-copy"
        size="xs"
        color="neutral"
        variant="ghost"
        :class="workspaceButtonClass"
        :aria-label="t('Common.Copy')"
        :disabled="!canCopy || !ready || stale || ddl.state !== 'supported'"
        @click="copyDDL"
      />
      <UButton
        v-if="section !== 'diagram'"
        icon="i-lucide-refresh-cw"
        :aria-label="t('Chen.GoV1Refresh')"
        :title="t('Chen.GoV1Refresh')"
        color="neutral"
        variant="ghost"
        size="xs"
        :class="workspaceButtonClass"
        :disabled="!ready || loading || unavailable"
        @click="refresh"
      />
      <UDropdownMenu
        :items="
          ['statistics', 'properties'].map((id) => ({
            label: label(id),
            onSelect: () => (section = id as OverviewSection)
          }))
        "
      >
        <UButton
          icon="i-lucide-ellipsis"
          size="xs"
          color="neutral"
          variant="ghost"
          class="aria-expanded:bg-(--app-selected-soft) aria-expanded:text-(--app-fg)"
          :class="workspaceButtonClass"
          :aria-label="t('Common.More')"
        />
      </UDropdownMenu>
    </header>
    <GoCatalogDiagram
      v-if="diagramVisited"
      v-show="section === 'diagram'"
      :api="api"
      :session-id="sessionId"
      :scope="scope"
      :dialect="dialect"
      :ready="ready"
      :active="visible && section === 'diagram'"
      :can-copy="canCopy"
      @object="emit('diagramObject', $event)"
    />
    <template v-if="section !== 'diagram'">
      <div v-if="!ready || stale || errorKey" class="shrink-0 space-y-1 px-3 py-2 text-xs" aria-live="polite">
        <p v-if="!ready || stale" class="text-warning">{{ t("Chen.GoOverviewStale") }}</p>
        <div v-if="errorKey" role="alert" class="flex items-center gap-2 text-error">
          <span>{{ t(`Chen.GoOverview${errorKey}`) }}</span>
          <UButton
            v-if="!unavailable"
            :label="t('Chen.Retry')"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="workspaceButtonClass"
            :disabled="!ready || loading"
            @click="refresh"
          />
        </div>
      </div>
      <div v-if="loading" class="grid min-h-0 flex-1 place-items-center text-sm text-muted" role="status">
        <span class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          {{ t(paged ? "Chen.LoadingCatalog" : "Chen.LoadingSchemaMetadata") }}
        </span>
      </div>
      <dl v-else-if="section === 'basic'" class="grid min-h-0 flex-1 gap-3 overflow-auto p-4 md:grid-cols-2">
        <div
          v-for="item in basicInfo"
          :key="item.label"
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
        >
          <dt class="mb-1 text-[11px] uppercase tracking-wide text-muted">{{ item.label }}</dt>
          <dd class="break-words text-sm">{{ item.value }}</dd>
        </div>
      </dl>
      <div v-else-if="paged" class="min-h-0 flex-1 overflow-auto p-3">
        <div
          v-if="data?.section === requestSection && catalogRows.length"
          class="overflow-x-auto rounded-lg border border-default"
          data-overview-catalog
        >
          <table class="w-full min-w-max text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th
                  v-for="key in catalogColumns"
                  :key="key"
                  class="px-3 py-2 font-medium"
                  :class="{ 'text-right': ['estimated_rows', 'total_bytes'].includes(key) }"
                  :title="key === 'estimated_rows' ? t('Chen.RowCountEstimateHint') : undefined"
                >
                  {{ t(`Chen.${catalogLabels[key]}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in catalogRows"
                :key="JSON.stringify([row.object.database, row.object.schema, row.object.name, row.name])"
                class="border-t border-default"
              >
                <td
                  v-for="key in catalogColumns"
                  :key="key"
                  class="px-3 py-2"
                  :class="[
                    key === 'name' ? '' : 'text-muted',
                    ['estimated_rows', 'total_bytes'].includes(key) ? 'text-right tabular-nums' : '',
                    key === 'comment' ? 'max-w-64 truncate' : ''
                  ]"
                  :title="catalogTitle(row, key)"
                >
                  <button
                    v-if="section === 'tables' && key === 'name'"
                    type="button"
                    class="text-left text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :disabled="!ready || stale"
                    @click="open(row.object)"
                  >
                    {{ row.object.name }}
                  </button>
                  <template v-else>{{ catalogValue(row, key) }}</template>
                  <UPopover v-if="section === 'indexes' && key === 'name' && row.fields.definition?.value">
                    <UButton
                      class="ml-1 !size-5 justify-center !p-0"
                      icon="i-lucide-code"
                      aria-label="SQL"
                      title="SQL"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :class="workspaceButtonClass"
                    />
                    <template #content>
                      <pre
                        class="max-h-80 max-w-[min(48rem,90vw)] overflow-auto p-3 font-ui-mono text-xs"
                        :class="{ 'select-none': !canCopy }"
                        @copy="
                          (event) => {
                            if (!canCopy) event.preventDefault();
                          }
                        "
                        @cut="
                          (event) => {
                            if (!canCopy) event.preventDefault();
                          }
                        "
                        >{{ row.fields.definition.value }}</pre>
                    </template>
                  </UPopover>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="!errorKey" class="grid h-full place-items-center text-sm text-muted">
          {{ t("Chen.NoCatalogItems", { type: sections.find((item) => item.id === section)?.label }) }}
        </div>
        <div v-if="data?.has_more" class="flex justify-center py-3">
          <UButton
            :label="t(data.items.length >= 10000 ? 'Chen.GoOverviewtruncated' : 'Chen.GoV1LoadMore')"
            size="xs"
            color="neutral"
            variant="ghost"
            :class="workspaceButtonClass"
            :disabled="!ready || stale || data.items.length >= 10000"
            @click="load(true)"
          />
        </div>
      </div>
      <div v-else-if="section === 'ddl'" class="min-h-0 flex-1 overflow-auto p-3" data-overview-ddl>
        <pre
          v-if="ddl?.value"
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]"
          >{{ ddl.value }}</pre>
        <div v-else-if="!errorKey" class="grid h-full place-items-center p-6 text-center text-sm text-muted">
          <div class="max-w-lg">
            <UIcon name="i-lucide-file-code-2" class="mx-auto mb-3 size-8" />
            <div class="font-medium text-[var(--app-fg)]">
              {{ t("Chen.DdlUnavailableTitle", { object: t("Chen.Schema") }) }}
            </div>
            <p class="mt-2 text-xs leading-5">
              {{ t(ddl?.state === "unsupported" ? "Chen.SchemaDdlNotSupported" : "Chen.NoSchemaDdl") }}
            </p>
          </div>
        </div>
        <p v-if="ddl?.state === 'truncated'" class="mt-2 text-xs text-warning">
          {{ t("Chen.GoOverviewDDLTruncated") }}
        </p>
        <p v-if="copyFailed" role="alert" class="mt-2 text-xs text-error">{{ t("Common.CopyFailed") }}</p>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto p-3">
        <dl v-if="data?.section === requestSection" class="divide-y divide-default text-xs">
          <div
            v-for="[key, value] in summary"
            :key="key"
            class="flex flex-wrap items-baseline justify-between gap-2 py-3"
            :title="value.source"
          >
            <dt class="text-muted">{{ label(key) }}</dt>
            <dd class="break-all text-right tabular-nums">{{ display(value, key) }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </section>
</template>
