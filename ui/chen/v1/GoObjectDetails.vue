<script setup lang="ts">
import type { ChenGoApi, GoCatalogInspect, GoCatalogObject, GoCatalogSection } from "./api";
import type { OverviewRow } from "./overview";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { workspaceButtonClass } from "~/shared/theme/workspaceButton";
import MonacoValueViewer from "./MonacoValueViewer.client.vue";
import { overviewNumber } from "./overview";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  object: GoCatalogObject;
  ready: boolean;
  visible?: boolean;
  canCopy: boolean;
  mode?: "structure" | "ddl";
  detailSection?: "basic" | "primary_key" | "foreign_keys" | "indexes" | "defaults" | "constraints";
}>();
const { t, locale } = useI18n();
const statistics = ref<OverviewRow>();
const statisticsLoaded = ref(false);
const statisticsPartial = ref(false);
const statisticLabels: Record<string, string> = {
  estimated_rows: "EstimatedRows",
  data_bytes: "DataBytes",
  index_bytes: "IndexBytes",
  total_bytes: "TotalBytes",
  last_analyzed: "LastAnalyzed",
  engine: "Engine",
  character_set: "CharacterSet",
  collation: "Collation",
  created: "Created",
  average_row_length: "AverageRowLength",
  tablespace: "Tablespace",
  status: "Status"
};
function statisticValue(key: string) {
  const field = statistics.value?.fields[key];
  if (!field || field.value === null) return field ? t(`Chen.GoOverview${field.state}`) : "—";
  const value = overviewNumber(field.value, locale.value) + (key.endsWith("_bytes") ? " B" : "");
  return field.state === "supported" ? value : `${value} · ${t(`Chen.GoOverview${field.state}`)}`;
}

const data = ref<GoCatalogInspect>();
const active = ref<keyof GoCatalogInspect["sections"] | "basic">(
  props.mode === "ddl" ? "ddl" : props.detailSection || "basic"
);
watch(
  () => props.detailSection,
  (value) => {
    if (value) active.value = value;
  }
);
const busy = ref(false);
const ddlBusy = ref(false);
const ddl = ref<GoCatalogSection>();
const ddlError = ref("");
const error = ref("");
const viewer = ref<{ find: () => void } | null>(null);
const sectionColumns: Partial<Record<typeof active.value, string[]>> = {
  primary_key: ["name", "column", "ordinal"],
  foreign_keys: ["name", "column", "referenced_schema", "referenced_table", "referenced_column", "ordinal"],
  indexes: ["name", "column", "ordinal", "unique", "method", "sort_order", "included", "expression", "definition"],
  constraints: ["name", "type", "definition"],
  defaults: ["column", "expression"]
};
const current = computed(() =>
  active.value === "ddl"
    ? ddl.value || data.value?.sections.ddl
    : active.value === "basic"
      ? undefined
      : data.value?.sections[active.value]
);
const columns = computed(() => sectionColumns[active.value] || []);
const sectionError = computed(() =>
  current.value?.error ? chenErrorText(current.value.error, t, "catalog_failed") : ""
);
const labels: Record<string, string> = {
  name: "Chen.Name",
  column: "Chen.Column",
  ordinal: "Chen.GoV1Position",
  unique: "Chen.Unique",
  method: "Chen.Method",
  sort_order: "Chen.GoOverviewDirection",
  included: "Chen.GoOverviewIncluded",
  referenced_schema: "Chen.Schema",
  referenced_table: "Chen.References",
  referenced_column: "Chen.GoV1ReferencedColumn",
  expression: "Chen.Definition",
  type: "Chen.Type",
  definition: "Chen.Definition"
};
const refreshDisabled = computed(() => !props.ready || (active.value === "ddl" ? ddlBusy.value : busy.value));
function refresh() {
  if (active.value === "ddl") return loadDdl();
  if (active.value === "basic") return loadStatistics();
  return load();
}
defineExpose({ refresh, refreshDisabled });
let controller: AbortController | undefined;
let ddlController: AbortController | undefined;
async function load() {
  if (!props.ready || props.visible === false || active.value === "basic" || busy.value) return;
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  busy.value = true;
  error.value = "";
  try {
    const value = await props.api.catalogInspect(
      props.sessionId,
      props.object.schema,
      props.object.name,
      current.signal,
      props.object.database
    );
    if (!current.signal.aborted) data.value = value;
  } catch (cause) {
    if (!current.signal.aborted) {
      data.value = undefined;
      error.value = chenErrorText(cause, t);
    }
  } finally {
    if (!current.signal.aborted) busy.value = false;
  }
}
async function loadStatistics() {
  if (!props.ready || props.visible === false || busy.value) return;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  busy.value = true;
  error.value = "";
  statisticsPartial.value = false;
  try {
    let cursor: string | undefined;
    do {
      const page = await props.api.catalogOverview(
        props.sessionId,
        {
          database: props.object.database,
          schema: props.object.schema,
          section: props.object.kind === "view" ? "views" : "tables",
          q: props.object.name,
          limit: 200,
          cursor
        },
        current.signal
      );
      if (current.signal.aborted) return;
      if (page.database !== props.object.database || page.schema !== props.object.schema)
        throw new Error("Catalog scope changed");
      statisticsPartial.value = page.state !== "supported";
      statistics.value = page.items.find(
        (row) =>
          row.object.database === props.object.database &&
          row.object.schema === props.object.schema &&
          row.object.name === props.object.name &&
          row.object.kind === props.object.kind
      );
      cursor = page.next_cursor;
      if (statistics.value || !page.has_more) break;
    } while (cursor);
    statisticsLoaded.value = true;
  } catch (cause) {
    if (!current.signal.aborted) {
      statisticsLoaded.value = false;
      error.value = chenErrorText(cause, t);
    }
  } finally {
    if (!current.signal.aborted) busy.value = false;
  }
}
async function loadDdl() {
  if (!props.ready || props.visible === false || ddlBusy.value) return;
  ddlController?.abort();
  ddlController = new AbortController();
  const current = ddlController;
  ddlBusy.value = true;
  ddlError.value = "";
  try {
    const value = await props.api.catalogDdl(
      props.sessionId,
      props.object.schema,
      props.object.name,
      current.signal,
      props.object.database
    );
    if (!current.signal.aborted) ddl.value = value;
  } catch (cause) {
    if (!current.signal.aborted) {
      ddl.value = undefined;
      ddlError.value = chenErrorText(cause, t);
    }
  } finally {
    if (!current.signal.aborted) ddlBusy.value = false;
  }
}
watch(
  () => [active.value, props.ready, props.visible],
  () => {
    controller?.abort();
    ddlController?.abort();
    busy.value = false;
    ddlBusy.value = false;
    if (!props.ready || props.visible === false) return;
    error.value = "";
    ddlError.value = "";
    if (active.value === "basic" && !statisticsLoaded.value) void loadStatistics();
    else if (active.value === "ddl" && !ddl.value) void loadDdl();
    else if (active.value !== "ddl" && active.value !== "basic" && !data.value) void load();
  },
  { immediate: true }
);
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
onBeforeUnmount(() => {
  controller?.abort();
  ddlController?.abort();
});
</script>
<template>
  <div class="flex min-h-0 flex-1 flex-col" data-chen-object-details @copy="preventCopy">
    <p v-if="!ready" class="px-3 py-2 text-xs text-warning">{{ t("Chen.GoV1CatalogStale") }}</p>
    <p v-if="busy || (active === 'ddl' && ddlBusy)" role="status" class="px-3 py-2 text-xs text-muted">
      {{ t("Chen.GoV1Loading") }}
    </p>
    <p v-if="error" role="alert" class="px-3 py-2 text-xs text-error">{{ error }}</p>
    <p v-if="active === 'ddl' && ddlError" role="alert" class="px-3 py-2 text-xs text-error">{{ ddlError }}</p>
    <p v-if="sectionError" role="status" class="px-3 py-2 text-xs text-warning">{{ sectionError }}</p>
    <p
      v-if="(current && !current.supported) || (data && active !== 'basic' && active !== 'ddl' && !current)"
      class="px-3 py-2 text-xs text-muted"
    >
      {{ t("Chen.NotSupported") }}
    </p>
    <p v-if="data?.truncated || current?.truncated" class="px-3 py-2 text-xs text-warning">
      {{ t("Chen.GoV1MetadataPartial") }}
    </p>
    <div v-if="active === 'basic'" class="min-h-0 flex-1 overflow-auto p-3">
      <dl class="grid content-start gap-3 md:grid-cols-2" data-chen-basic-info>
        <div
          v-for="item in [
            { label: t('Chen.Name'), value: object.name },
            { label: t('Chen.GoV1Database'), value: object.database },
            { label: t('Chen.Schema'), value: object.schema },
            { label: t('Chen.ObjectType'), value: t(object.kind === 'view' ? 'Chen.Views' : 'Chen.Tables') },
            { label: t('Chen.Comment'), value: statistics?.fields.comment?.value ?? object.comment }
          ]"
          :key="item.label"
          class="rounded border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
        >
          <dt class="mb-1 text-xs text-muted">{{ item.label }}</dt>
          <dd class="break-words text-sm">{{ item.value || "—" }}</dd>
        </div>
        <div
          v-for="(label, key) in statisticLabels"
          :key="key"
          class="rounded border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
          :title="statistics?.fields[key]?.source"
        >
          <dt class="mb-1 text-xs text-muted">{{ t(`Chen.GoOverview${label}`) }}</dt>
          <dd class="break-words text-sm tabular-nums">{{ statisticValue(key) }}</dd>
        </div>
      </dl>
      <p v-if="statisticsPartial" class="mt-2 text-xs text-warning">{{ t("Chen.GoV1MetadataPartial") }}</p>
    </div>
    <template v-if="current?.supported">
      <template v-if="active === 'ddl'">
        <div v-if="current.text" class="group relative min-h-0 flex-1">
          <MonacoValueViewer
            ref="viewer"
            :value="current.text"
            :json="false"
            :wrap="true"
            :can-copy="canCopy"
            :label="current.source === 'native_view_query' ? t('Chen.GoV1ViewQueryDefinition') : 'DDL'"
            floating-find
          />
          <UButton
            icon="i-lucide-search"
            :aria-label="t('Chen.GoV1ValueFind')"
            :title="t('Chen.GoV1ValueFind')"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute top-1 right-6 z-10 bg-(--app-surface-overlay) shadow-sm ring ring-default group-has-[.find-widget.visible]:hidden"
            :class="workspaceButtonClass"
            @click="viewer?.find()"
          />
        </div>
        <p v-else-if="!ddlBusy && !ddlError" class="p-3 text-xs text-muted">{{ t("Chen.DefinitionUnavailable") }}</p>
      </template>
      <div v-else class="min-h-0 flex-1 overflow-auto" :class="{ 'select-none': !canCopy }">
        <table v-if="current.items?.length" class="min-w-full border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-[var(--data-grid-header-background)]">
            <tr>
              <th
                v-for="column in columns"
                :key="column"
                class="border-b border-r border-default px-3 py-2 font-medium"
              >
                {{ t(labels[column] || "Chen.Name") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in current.items" :key="index" class="hover:bg-[var(--data-grid-row-hover)]">
              <td
                v-for="column in columns"
                :key="column"
                class="border-b border-r border-default px-3 py-2 font-ui-mono whitespace-pre-wrap break-words"
              >
                {{
                  typeof row[column] === "boolean" || (["unique", "included"].includes(column) && row[column] != null)
                    ? t(
                        row[column] === true || row[column] === 1 || row[column] === "1"
                          ? "Chen.GoV1Yes"
                          : "Chen.GoV1No"
                      )
                    : (row[column] ?? "—")
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="p-3 text-xs text-muted">{{ t("Chen.NoItems") }}</p>
      </div>
    </template>
  </div>
</template>
