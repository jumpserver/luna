<script setup lang="ts">
import type { ChenGoApi, GoCatalogInspect, GoCatalogObject, GoCatalogSection } from "./api";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import MonacoValueViewer from "./MonacoValueViewer.client.vue";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  object: GoCatalogObject;
  ready: boolean;
  canCopy: boolean;
}>();
const { t } = useI18n();
const data = ref<GoCatalogInspect>();
const active = ref<keyof GoCatalogInspect["sections"]>("primary_key");
const busy = ref(false);
const ddlBusy = ref(false);
const ddl = ref<GoCatalogSection>();
const ddlError = ref("");
const error = ref("");
const viewer = ref<{ find: () => void } | null>(null);
const sections = computed(() => [
  {
    key: "primary_key" as const,
    label: t("RightPanel.SQLAIMetadataCategory.primary_keys"),
    columns: ["name", "column", "ordinal"]
  },
  {
    key: "foreign_keys" as const,
    label: t("Chen.ForeignKeys"),
    columns: ["name", "column", "referenced_schema", "referenced_table", "referenced_column", "ordinal"]
  },
  { key: "indexes" as const, label: t("Chen.Indexes"), columns: ["name", "column", "ordinal", "unique"] },
  {
    key: "defaults" as const,
    label: t("RightPanel.SQLAIMetadataCategory.default_values"),
    columns: ["column", "expression"]
  },
  {
    key: "ddl" as const,
    label:
      (ddl.value || data.value?.sections.ddl)?.source === "native_view_query"
        ? t("Chen.GoV1ViewQueryDefinition")
        : "DDL",
    columns: []
  }
]);
const current = computed(() =>
  active.value === "ddl" ? ddl.value || data.value?.sections.ddl : data.value?.sections[active.value]
);
const columns = computed(() => sections.value.find((item) => item.key === active.value)?.columns || []);
const sectionError = computed(() =>
  typeof current.value?.error === "string" ? current.value.error : current.value?.error?.message
);
const labels: Record<string, string> = {
  name: "Chen.Name",
  column: "Chen.Column",
  ordinal: "Chen.GoV1Position",
  unique: "Chen.Unique",
  referenced_schema: "Chen.Schema",
  referenced_table: "Chen.References",
  referenced_column: "Chen.GoV1ReferencedColumn",
  expression: "Chen.Definition"
};
let controller: AbortController | undefined;
let ddlController: AbortController | undefined;
async function load() {
  if (!props.ready || busy.value) return;
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
      current.signal
    );
    if (!current.signal.aborted) data.value = value;
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!current.signal.aborted) busy.value = false;
  }
}
async function loadDdl() {
  if (!props.ready || ddlBusy.value) return;
  ddlController?.abort();
  ddlController = new AbortController();
  const current = ddlController;
  ddlBusy.value = true;
  ddlError.value = "";
  try {
    const value = await props.api.catalogDdl(props.sessionId, props.object.schema, props.object.name, current.signal);
    if (!current.signal.aborted) ddl.value = value;
  } catch (cause) {
    if (!current.signal.aborted) ddlError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!current.signal.aborted) ddlBusy.value = false;
  }
}
watch(
  () => [active.value, props.ready],
  () => {
    if (active.value === "ddl" && props.ready && !ddl.value && !ddlError.value) void loadDdl();
  }
);
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
onMounted(() => load());
watch(
  () => props.ready,
  (ready) => {
    if (ready && !data.value && !error.value) void load();
  }
);
onBeforeUnmount(() => {
  controller?.abort();
  ddlController?.abort();
});
</script>
<template>
  <div class="flex min-h-0 flex-1 flex-col" data-chen-object-details @copy="preventCopy">
    <div class="flex shrink-0 flex-wrap items-center gap-1 border-b border-default px-3 py-2">
      <UButton
        v-for="item in sections"
        :key="item.key"
        :label="item.label"
        size="xs"
        :color="active === item.key ? 'primary' : 'neutral'"
        :variant="active === item.key ? 'soft' : 'ghost'"
        :aria-pressed="active === item.key"
        @click="active = item.key"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        :label="t('Chen.GoV1Refresh')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!ready || (active === 'ddl' ? ddlBusy : busy)"
        @click="active === 'ddl' ? loadDdl() : load()"
      />
      <UButton
        v-if="active === 'ddl' && current?.text"
        icon="i-lucide-search"
        :label="t('Chen.GoV1ValueFind')"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="viewer?.find()"
      />
    </div>
    <p v-if="!ready" class="px-3 py-2 text-xs text-warning">{{ t("Chen.GoV1CatalogStale") }}</p>
    <p v-if="busy || (active === 'ddl' && ddlBusy)" role="status" class="px-3 py-2 text-xs text-muted">
      {{ t("Chen.GoV1Loading") }}
    </p>
    <p v-if="error" role="alert" class="px-3 py-2 text-xs text-error">{{ error }}</p>
    <p v-if="active === 'ddl' && ddlError" role="alert" class="px-3 py-2 text-xs text-error">{{ ddlError }}</p>
    <p v-if="sectionError" role="status" class="px-3 py-2 text-xs text-warning">{{ sectionError }}</p>
    <p v-if="current && !current.supported" class="px-3 py-2 text-xs text-muted">{{ t("Chen.NotSupported") }}</p>
    <p v-if="data?.truncated || current?.truncated" class="px-3 py-2 text-xs text-warning">
      {{ t("Chen.GoV1MetadataPartial") }}
    </p>
    <template v-if="current?.supported">
      <template v-if="active === 'ddl'">
        <p v-if="current.source" class="border-b border-default px-3 py-1 text-xs text-muted">
          {{ t("Chen.GoV1DdlSource") }}: {{ current.source }}
        </p>
        <MonacoValueViewer
          v-if="current.text"
          ref="viewer"
          class="min-h-0 flex-1"
          :value="current.text"
          :json="false"
          :wrap="true"
          :can-copy="canCopy"
          :label="current.source === 'native_view_query' ? t('Chen.GoV1ViewQueryDefinition') : 'DDL'"
        />
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
                  typeof row[column] === "boolean"
                    ? t(row[column] ? "Chen.GoV1Yes" : "Chen.GoV1No")
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
