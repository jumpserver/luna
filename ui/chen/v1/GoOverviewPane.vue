<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject } from "./api";
import type { GoOverview, OverviewSection, OverviewValue } from "./overview";
import type { QueryContext } from "./workspace";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChenGoError } from "./api";
import { overviewNumber, overviewPageTotal, overviewSections } from "./overview";

const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  scope: QueryContext;
  dialect: string;
  ready: boolean;
  visible: boolean;
  canCopy: boolean;
}>();
const emit = defineEmits<{ object: [object: GoCatalogObject] }>();
const { t, locale } = useI18n();
const section = ref<OverviewSection>("tables");
const search = ref("");
const appliedSearch = ref("");
const sort = ref<"name_asc" | "name_desc">("name_asc");
const limit = ref(50);
const page = ref(0);
const loadedPage = ref(0);
const cursors = ref([""]);
const data = ref<GoOverview | null>(null);
const loading = ref(false);
const stale = ref(false);
const errorKey = ref("");
const unavailable = ref(false);
let controller: AbortController | undefined;
let generation = 0;
const paged = computed(() => ["tables", "views", "indexes"].includes(section.value));
const columns = computed(() =>
  section.value === "indexes"
    ? ["unique", "method", "definition", "column", "expression", "position", "direction", "prefix_length"]
    : [
        "estimated_rows",
        "data_bytes",
        "index_bytes",
        "total_bytes",
        "last_analyzed",
        "engine",
        "character_set",
        "collation",
        "comment"
      ]
);
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
  unique: "Unique",
  method: "Method",
  definition: "Definition",
  column: "Column",
  expression: "Expression",
  position: "Position",
  direction: "Direction",
  prefix_length: "PrefixLength"
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
const summary = computed(() => Object.entries(data.value?.fields || {}).filter(([key]) => !key.endsWith("_unknown")));
function stop() {
  generation++;
  controller?.abort();
  loading.value = false;
  if (data.value) stale.value = true;
}
async function load() {
  stop();
  if (!props.ready || !props.visible || unavailable.value) return;
  const current = generation;
  const abort = new AbortController();
  controller = abort;
  const scope = { ...props.scope };
  const requestedSection = section.value;
  loading.value = true;
  errorKey.value = "";
  try {
    const value = await props.api.catalogOverview(
      props.sessionId,
      {
        ...scope,
        section: requestedSection,
        q: paged.value ? appliedSearch.value : undefined,
        sort: sort.value,
        limit: limit.value,
        cursor: paged.value ? cursors.value[page.value] : undefined
      },
      abort.signal
    );
    if (abort.signal.aborted || generation !== current) return;
    if (value.database !== scope.database || value.schema !== scope.schema || value.section !== requestedSection)
      throw new Error("Catalog scope changed");
    data.value = value;
    loadedPage.value = page.value;
    stale.value = false;
    if (value.next_cursor) cursors.value[page.value + 1] = value.next_cursor;
  } catch (cause) {
    if (abort.signal.aborted || generation !== current) return;
    if (cause instanceof ChenGoError && [404, 405, 501].includes(cause.status) && cause.code !== "catalog_not_found") {
      unavailable.value = true;
      errorKey.value = "OldBackend";
    } else
      errorKey.value =
        cause instanceof ChenGoError && cause.status === 403
          ? "restricted"
          : cause instanceof ChenGoError && cause.code === "catalog_timeout"
            ? "Timeout"
            : "query_error";
  } finally {
    if (generation === current) loading.value = false;
  }
}
function resetPage() {
  page.value = 0;
  cursors.value = [""];
}
function applySearch() {
  appliedSearch.value = search.value.trim();
  resetPage();
  void load();
}
function refresh() {
  resetPage();
  void load();
}
function open(object: GoCatalogObject) {
  if (props.ready && props.visible && !stale.value) emit("object", { ...object });
}
watch([section, sort, limit], refresh);
watch(
  () => [props.api, props.sessionId, props.scope.database, props.scope.schema],
  () => {
    stop();
    data.value = null;
    unavailable.value = false;
    resetPage();
    void load();
  }
);
watch(
  () => [props.ready, props.visible],
  () => {
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
  >
    <header class="shrink-0 space-y-2 border-b border-default p-3">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <h2 class="min-w-0 truncate text-sm font-semibold" :title="`${scope.database} / ${scope.schema}`">
          {{ t("Chen.GoOverviewTitle") }} · {{ scope.database }}
          <span v-if="scope.schema && scope.schema !== scope.database">/ {{ scope.schema }}</span>
        </h2>
        <UButton
          :label="t('Chen.GoV1Refresh')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!ready || loading || unavailable"
          @click="refresh"
        />
      </div>
      <p class="text-xs text-muted">{{ t("Chen.GoOverviewScope") }}</p>
      <nav class="flex flex-wrap gap-1" :aria-label="t('Chen.GoOverviewTitle')">
        <UButton
          v-for="item in overviewSections"
          :key="item"
          :label="label(item)"
          :variant="section === item ? 'soft' : 'ghost'"
          :aria-pressed="section === item"
          color="neutral"
          size="xs"
          @click="section = item"
        />
      </nav>
      <form v-if="paged" class="flex flex-wrap items-center gap-2" @submit.prevent="applySearch">
        <UInput
          v-model="search"
          :aria-label="t('Chen.GoOverviewSearch')"
          :placeholder="t('Chen.GoOverviewSearch')"
          icon="i-lucide-search"
          class="min-w-32 flex-1"
          size="xs"
          :maxlength="256"
        />
        <UButton
          type="submit"
          :label="t('Chen.GoOverviewSearch')"
          size="xs"
          color="neutral"
          variant="soft"
          :disabled="!ready || unavailable"
        />
        <USelect
          v-model="sort"
          :items="[
            { label: t('Chen.GoOverviewAscending'), value: 'name_asc' },
            { label: t('Chen.GoOverviewDescending'), value: 'name_desc' }
          ]"
          :aria-label="t('Chen.GoOverviewSort')"
          size="xs"
        />
        <USelect v-model="limit" :items="[25, 50, 100, 200]" :aria-label="t('Chen.GoOverviewPageSize')" size="xs" />
      </form>
    </header>
    <div class="shrink-0 space-y-1 px-3 pt-2 text-xs" aria-live="polite">
      <p v-if="!ready || stale" class="text-warning">{{ t("Chen.GoOverviewStale") }}</p>
      <p v-if="loading" role="status" class="text-muted">{{ t("Chen.GoV1Loading") }}</p>
      <div v-if="errorKey" role="alert" class="flex items-center gap-2 text-error">
        <span>{{ t(`Chen.GoOverview${errorKey}`) }}</span>
        <UButton
          v-if="!unavailable"
          :label="t('Chen.GoV1Retry')"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!ready || loading"
          @click="load"
        />
      </div>
      <p v-if="data && data.state !== 'supported'" class="text-warning">{{ t(`Chen.GoOverview${data.state}`) }}</p>
    </div>
    <div class="min-h-0 flex-1 overflow-auto p-3">
      <template v-if="data && data.section === section">
        <table v-if="paged && data.items.length" class="w-full border-collapse text-left text-xs tabular-nums">
          <thead class="border-b border-default text-muted">
            <tr>
              <th class="p-2 font-medium">{{ t("Chen.GoOverviewObject") }}</th>
              <th v-if="section === 'indexes'" class="p-2 font-medium">{{ t("Chen.GoOverviewName") }}</th>
              <th v-for="key in columns" :key="key" class="whitespace-nowrap p-2 font-medium">{{ label(key) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.items"
              :key="JSON.stringify([row.object.database, row.object.schema, row.object.name, row.name, row.ordinal])"
              class="border-b border-default hover:bg-[var(--workspace-surface-sub-tab-active)]"
            >
              <td class="p-2 align-top">
                <UButton
                  :label="`${row.object.schema}.${row.object.name}`"
                  color="neutral"
                  variant="link"
                  size="xs"
                  class="max-w-72 break-all whitespace-normal text-left"
                  :disabled="!ready || stale"
                  @click="open(row.object)"
                />
                <p class="px-2 text-muted">{{ row.object.object_type || row.object.kind }}</p>
              </td>
              <td v-if="section === 'indexes'" class="p-2 align-top">{{ row.name }}</td>
              <td
                v-for="key in columns"
                :key="key"
                class="max-w-96 min-w-28 p-2 align-top break-words whitespace-pre-wrap"
                :title="row.fields[key]?.source"
                :class="{ 'text-muted': row.fields[key]?.value === null }"
              >
                {{ display(row.fields[key], key) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="paged && data.state === 'supported'" class="py-8 text-center text-sm text-muted">
          {{ t("Chen.GoOverviewEmpty") }}
        </p>
        <dl v-if="!paged" class="divide-y divide-default text-xs">
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
      </template>
    </div>
    <footer class="shrink-0 space-y-2 border-t border-default p-3 text-xs text-muted">
      <div v-if="paged && data?.section === section" class="flex flex-wrap items-center gap-2">
        <span>{{ t("Chen.GoOverviewPage", { page: loadedPage + 1, count: data.items.length }) }}</span>
        <UButton
          :label="t('Chen.GoOverviewPrevious')"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready || loading || page === 0 || unavailable"
          @click="
            page--;
            load();
          "
        />
        <UButton
          :label="t('Chen.GoOverviewNext')"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready || loading || stale || !data.has_more || unavailable"
          @click="
            page++;
            load();
          "
        />
        <span v-if="section === 'tables' || section === 'views'">
          {{ t("Chen.GoOverviewPageTotal") }}:
          {{ display(overviewPageTotal(data.items, "total_bytes"), "total_bytes") }}
        </span>
      </div>
      <p>
        {{
          t(
            dialect === "postgresql"
              ? "Chen.GoOverviewPGSource"
              : dialect === "mysql"
                ? "Chen.GoOverviewMySource"
                : "Chen.GoOverviewOtherSource"
          )
        }}
      </p>
      <p>
        {{ t("Chen.GoOverviewNonSnapshot") }}
        <span v-if="data">· {{ data.sampled_at }}</span>
      </p>
    </footer>
  </section>
</template>
