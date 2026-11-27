<script setup lang="ts">
import type { ChenGoApi, GoCatalogRelation } from "./api";
import type { ChenSchemaDiagramTable } from "~/chen/types/schemaOverview";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SchemaDiagram from "~/chen/components/SchemaDiagram.vue";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { diagramObjectId, inspectDiagram } from "./diagram";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  object: GoCatalogRelation;
  dialect: string;
  ready: boolean;
  active: boolean;
  canCopy: boolean;
}>();
const { t } = useI18n();
const data = ref<ReturnType<typeof inspectDiagram>>();
const busy = ref(false);
const stale = ref(false);
const error = ref("");
const refreshDisabled = computed(() => !props.ready || busy.value);
defineExpose({ refresh: load, refreshDisabled });
const identity = computed(() => diagramObjectId(props.sessionId, props.object));
let controller: AbortController | undefined;
const targetCursors = reactive(new Map<string, string>());
const targetBusy = ref("");
let targetController: AbortController | undefined;
function cancel() {
  targetController?.abort();
  targetController = undefined;
  targetBusy.value = "";
  controller?.abort();
  controller = undefined;
  busy.value = false;
}
async function load() {
  if (!props.ready || !props.active) return;
  cancel();
  const current = new AbortController();
  controller = current;
  busy.value = true;
  error.value = "";
  stale.value = !!data.value;
  const { sessionId, object, dialect, api } = props;
  try {
    const value = await api.catalogInspect(sessionId, object.schema, object.name, current.signal, object.database);
    if (current.signal.aborted || controller !== current) return;
    data.value = inspectDiagram(sessionId, object, dialect, value);
    targetCursors.clear();
    stale.value = false;
  } catch (cause) {
    if (!current.signal.aborted && controller === current) error.value = chenErrorText(cause, t, "catalog_failed");
  } finally {
    if (controller === current) {
      busy.value = false;
      controller = undefined;
    }
  }
}
function canLoadTarget(table: ChenSchemaDiagramTable) {
  return (
    table.database === props.object.database &&
    (table.metadataStatus === "NotLoaded" ||
      (table.metadataStatus === "Partial" && !!table.id && targetCursors.has(table.id)))
  );
}
async function loadTarget(id: string) {
  const target = data.value?.tables.find((table) => table.id === id);
  if (
    !target ||
    !canLoadTarget(target) ||
    !props.ready ||
    !props.active ||
    busy.value ||
    stale.value ||
    targetBusy.value
  )
    return;
  const current = new AbortController();
  targetController = current;
  targetBusy.value = id;
  error.value = "";
  try {
    const cursor = targetCursors.get(id);
    const page = await props.api.catalogColumns(
      props.sessionId,
      target.schema,
      target.name,
      cursor,
      current.signal,
      target.database
    );
    if (current.signal.aborted) return;
    if (page.has_more && (!page.next_cursor || page.next_cursor === cursor)) throw new Error("catalog_failed");
    const columns = new Map(
      target.columns.filter((column) => column.nativeType !== null).map((column) => [column.name, column])
    );
    for (const column of page.items) {
      columns.set(column.name, {
        name: column.name,
        nativeType: column.data_type,
        nullable: column.nullable,
        ordinal: null
      });
    }
    const referencesOnly = target.columns.filter((column) => !columns.has(column.name));
    for (const reference of referencesOnly) columns.set(reference.name, reference);
    target.columns = [...columns.values()];
    target.metadataStatus = page.has_more || referencesOnly.length > 0 ? "Partial" : "Complete";
    if (page.has_more && page.next_cursor) targetCursors.set(id, page.next_cursor);
    else targetCursors.delete(id);
  } catch (cause) {
    if (!current.signal.aborted) error.value = chenErrorText(cause, t, "catalog_failed");
  } finally {
    if (targetController === current) {
      targetController = undefined;
      targetBusy.value = "";
    }
  }
}
watch(
  [identity, () => props.api, () => props.dialect],
  () => {
    cancel();
    data.value = undefined;
    error.value = "";
    stale.value = false;
    if (props.active) void load();
  },
  { flush: "sync" }
);
watch(
  [() => props.active, () => props.ready],
  ([active, ready]) => {
    if (!ready || !active) {
      if (!ready || busy.value) stale.value = !!data.value;
      cancel();
    } else if (!data.value && !error.value) void load();
  },
  { immediate: true, flush: "sync" }
);
onBeforeUnmount(cancel);
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
</script>
<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-chen-object-diagram
    :class="{ 'select-none': !canCopy }"
    @copy="preventCopy"
    @cut="preventCopy"
  >
    <div
      v-if="!ready || stale || busy || error || data?.tables[0]?.foreignKeys.length === 0"
      class="shrink-0 space-y-1 border-b border-default px-3 py-2 text-xs"
    >
      <p v-if="!ready || stale" class="text-warning">{{ t("Chen.GoDiagramStale") }}</p>
      <p v-if="busy" role="status" class="text-muted">{{ t("Chen.GoV1Loading") }}</p>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <p v-if="data && data.tables[0]?.foreignKeys.length === 0" class="text-muted">
        {{
          t(
            data.statuses.foreignKeys === "Complete"
              ? "Chen.GoDiagramNoVisibleRelations"
              : "Chen.GoDiagramRelationsUnavailable"
          )
        }}
      </p>
    </div>
    <SchemaDiagram
      v-if="data"
      :key="identity"
      class="min-h-0 flex-1"
      :tables="data.tables"
      :relationships-supported="data.statuses.foreignKeys !== 'Unsupported'"
      :title="t('Chen.GoDiagramOutgoing')"
      :openable="false"
      :show-details="true"
    >
      <template #column-action="{ table }">
        <UButton
          v-if="canLoadTarget(table)"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t(table.metadataStatus === 'Partial' ? 'Chen.GoV1LoadMore' : 'Chen.GoDiagramLoadColumns')"
          :loading="targetBusy === table.id"
          :disabled="!ready || !active || busy || stale || !!targetBusy"
          @click.stop="loadTarget(table.id)"
        />
      </template>
    </SchemaDiagram>
  </div>
</template>
