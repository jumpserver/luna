<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject } from "./api";
import type { DiagramEdge, DiagramOptions, DiagramPage } from "./catalogDiagram";
import type { QueryContext } from "./workspace";
import type { ChenSchemaDiagramTable } from "~/chen/types/schemaOverview";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SchemaDiagram from "~/chen/components/SchemaDiagram.vue";
import { ChenGoError } from "./api";
import { catalogDiagramTables, diagramBudget, diagramEdgeId } from "./catalogDiagram";
import { diagramObjectId, inspectDiagram } from "./diagram";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  scope: QueryContext;
  dialect: string;
  target?: GoCatalogObject;
  ready: boolean;
  active: boolean;
  canCopy: boolean;
}>();
const emit = defineEmits<{ object: [object: GoCatalogObject] }>();
const { t } = useI18n();
const objects = ref<GoCatalogObject[]>([]);
const edges = ref<DiagramEdge[]>([]);
const pages = ref<Partial<Record<"nodes" | "edges", DiagramPage>>>({});
const busy = ref(false);
const stale = ref(false);
const error = ref("");
const unavailable = ref(false);
const capped = ref(false);
const partial = ref(false);
const nodeMetadata = ref(new Map<string, ChenSchemaDiagramTable>());
const metadataFailed = ref(false);
const tables = computed(() =>
  catalogDiagramTables(props.sessionId, objects.value, edges.value).map((table) => {
    const metadata = table.id ? nodeMetadata.value.get(table.id) : undefined;
    return metadata
      ? {
          ...table,
          columns: metadata.columns,
          primaryKey: metadata.primaryKey,
          metadataStatus: metadata.metadataStatus
        }
      : table;
  })
);
const more = computed(() => pages.value.nodes?.has_more || pages.value.edges?.has_more);
const identity = computed(() => JSON.stringify([props.sessionId, props.scope, props.target]));
let generation = 0;
let controller: AbortController | undefined;
function stop() {
  generation++;
  controller?.abort();
  if (busy.value || !props.ready) stale.value = !!Object.keys(pages.value).length;
  busy.value = false;
}
async function load(refresh = false) {
  if (!props.ready || !props.active || busy.value || unavailable.value) return;
  stop();
  const current = generation;
  const abort = new AbortController();
  controller = abort;
  busy.value = true;
  error.value = "";
  if (refresh) stale.value = !!Object.keys(pages.value).length;
  let nextObjects = refresh ? [] : [...objects.value];
  let nextEdges = refresh ? [] : [...edges.value];
  const nextPages = refresh ? {} : { ...pages.value };
  let nextPartial = refresh ? false : partial.value;
  try {
    capped.value = false;
    for (const section of ["nodes", "edges"] as const) {
      if (capped.value) break;
      if (!refresh && nextPages[section] && !nextPages[section]!.has_more) continue;
      const seen = new Set<string>();
      do {
        const options: DiagramOptions = {
          ...props.scope,
          direction: props.target ? "incoming" : "schema",
          table: props.target?.name,
          section,
          limit: 100,
          cursor: nextPages[section]?.next_cursor
        };
        const page = await props.api.catalogDiagram(props.sessionId, options, abort.signal);
        if (abort.signal.aborted || generation !== current) return;
        const objectMap = new Map(nextObjects.map((o) => [diagramObjectId(props.sessionId, o), o]));
        const edgeMap = new Map(nextEdges.map((e) => [diagramEdgeId(props.sessionId, e), e]));
        for (const item of page.items) {
          if (item.object) objectMap.set(diagramObjectId(props.sessionId, item.object), item.object);
          if (item.edge) edgeMap.set(diagramEdgeId(props.sessionId, item.edge), item.edge);
        }
        const os = [...objectMap.values()];
        const es = [...edgeMap.values()];
        if (
          catalogDiagramTables(props.sessionId, os, es).length > diagramBudget.nodes ||
          es.length > diagramBudget.edges ||
          es.reduce((n, e) => n + e.pairs.length, 0) > diagramBudget.pairs ||
          new TextEncoder().encode(JSON.stringify([os, es])).length > diagramBudget.bytes
        ) {
          capped.value = true;
          break;
        }
        nextObjects = os;
        nextEdges = es;
        nextPages[section] = page;
        nextPartial ||=
          page.state === "unsupported" ||
          (page.state === "partial" && (!page.has_more || !!page.reason)) ||
          page.items.some((i) => i.edge && i.edge.state !== "complete");
        if (!page.has_more) break;
        if (!page.next_cursor || seen.has(page.next_cursor)) throw new Error("Diagram cursor did not advance");
        seen.add(page.next_cursor);
      } while (true);
    }
    // Reuse the authorized inspection endpoint, sequentially: each session has
    // two catalog connections and other workspace metadata may use the second.
    const metadata = refresh ? new Map<string, ChenSchemaDiagramTable>() : new Map(nodeMetadata.value);
    let metadataBytes = new TextEncoder().encode(JSON.stringify([...metadata.values()])).byteLength;
    metadataFailed.value = false;
    for (const table of catalogDiagramTables(props.sessionId, nextObjects, nextEdges)) {
      if (abort.signal.aborted || generation !== current) return;
      if (!table.id || !table.object || table.object.database !== props.scope.database || metadata.has(table.id))
        continue;
      try {
        const info = await props.api.catalogInspect(
          props.sessionId,
          table.object.schema,
          table.object.name,
          abort.signal
        );
        if (abort.signal.aborted || generation !== current) return;
        const inspected = inspectDiagram(props.sessionId, table.object, props.dialect, info);
        const source = inspected.tables[0]!;
        if (inspected.statuses.columns !== "Complete") source.metadataStatus = "Unknown";
        metadataBytes += new TextEncoder().encode(JSON.stringify(source)).byteLength;
        if (metadataBytes > diagramBudget.bytes) {
          capped.value = true;
          break;
        }
        metadata.set(table.id, source);
      } catch {
        if (abort.signal.aborted || generation !== current) return;
        metadataFailed.value = true;
      }
    }
    nodeMetadata.value = metadata;
    objects.value = nextObjects;
    edges.value = nextEdges;
    pages.value = nextPages;
    partial.value = nextPartial;
    stale.value = false;
  } catch (cause) {
    if (abort.signal.aborted || generation !== current) return;
    stale.value = !!Object.keys(pages.value).length;
    unavailable.value =
      cause instanceof ChenGoError && [404, 405, 501].includes(cause.status) && cause.code !== "catalog_not_found";
    error.value = unavailable.value
      ? "OldBackend"
      : cause instanceof ChenGoError && cause.status === 403
        ? "Restricted"
        : cause instanceof ChenGoError && cause.code === "diagram_contract_changed"
          ? "ContractChanged"
          : "LoadError";
  } finally {
    if (generation === current) busy.value = false;
  }
}
watch([identity, () => props.api], () => {
  stop();
  objects.value = [];
  nodeMetadata.value = new Map();
  metadataFailed.value = false;
  edges.value = [];
  pages.value = {};
  unavailable.value = false;
  capped.value = false;
  error.value = "";
  partial.value = false;
  stale.value = false;
  void load(true);
});
watch(
  [() => props.ready, () => props.active],
  ([ready, active]) => {
    if (!ready || !active) stop();
    else if (!pages.value.nodes || stale.value) void load(true);
  },
  { immediate: true }
);
onBeforeUnmount(stop);
function open(object: GoCatalogObject) {
  if (props.ready && props.active && !stale.value && object.database === props.scope.database) emit("object", object);
}
function copy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
</script>
<template>
  <section
    class="flex min-h-0 min-w-0 flex-1 flex-col"
    data-chen-catalog-diagram
    :class="{ 'select-none': !canCopy }"
    @copy="copy"
    @cut="copy"
  >
    <div
      v-if="
        error ||
        capped ||
        stale ||
        !ready ||
        metadataFailed ||
        pages.edges?.state === 'unsupported' ||
        pages.edges?.reason ||
        pages.nodes?.reason
      "
      class="shrink-0 space-y-1 border-b border-default px-3 py-2 text-xs"
      aria-live="polite"
    >
      <p v-if="pages.edges?.state === 'unsupported'">{{ t("Chen.GoDiagramUnsupported") }}</p>
      <p v-if="pages.edges?.reason || pages.nodes?.reason" class="break-words text-muted">
        {{ pages.edges?.reason || pages.nodes?.reason }}
      </p>
      <p v-if="capped" class="text-warning">{{ t("Chen.GoDiagramBudget") }}</p>
      <p v-if="metadataFailed" class="text-warning">{{ t("Chen.GoV1MetadataPartial") }}</p>
      <p v-if="stale || !ready" class="text-warning">{{ t("Chen.GoDiagramStale") }}</p>
      <div v-if="error" role="alert" class="flex items-center gap-2 text-error">
        <span>{{ t(`Chen.GoDiagram${error}`) }}</span>
        <UButton
          v-if="!unavailable"
          :label="t('Chen.Retry')"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready || busy"
          @click="load(true)"
        />
      </div>
    </div>
    <div v-if="busy" class="grid min-h-0 flex-1 place-items-center text-sm text-muted" role="status">
      <span class="flex items-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t("Chen.LoadingSchemaDiagram") }}
      </span>
    </div>
    <SchemaDiagram
      v-else-if="tables.length"
      :key="identity"
      class="min-h-0 flex-1"
      :tables="tables"
      :relationships-supported="pages.edges?.state !== 'unsupported'"
      :title="target ? t('Chen.GoDiagramIncoming') : t('Chen.SchemaDiagram')"
      :openable="ready && !stale"
      @open-object="open"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          :aria-label="t('Chen.GoV1Refresh')"
          :title="t('Chen.GoV1Refresh')"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!ready || busy || unavailable"
          @click="load(true)"
        />
        <UButton
          v-if="more && !capped"
          :label="t('Chen.GoV1LoadMore')"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!ready || stale || unavailable"
          @click="load()"
        />
      </template>
    </SchemaDiagram>
    <div v-else-if="!error" class="grid min-h-0 flex-1 place-items-center text-sm text-muted">
      {{ t("Chen.NoTablesInSchema") }}
    </div>
  </section>
</template>
