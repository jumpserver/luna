<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject } from "./api";
import type { DiagramEdge, DiagramOptions, DiagramPage } from "./catalogDiagram";
import type { QueryContext } from "./workspace";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SchemaDiagram from "~/chen/components/SchemaDiagram.vue";
import { ChenGoError } from "./api";
import { catalogDiagramTables, diagramBudget, diagramEdgeId } from "./catalogDiagram";
import { diagramObjectId } from "./diagram";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  scope: QueryContext;
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
const tables = computed(() => catalogDiagramTables(props.sessionId, objects.value, edges.value));
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
    const sections: ("nodes" | "edges")[] =
      refresh || !pages.value.nodes ? ["nodes", "edges"] : pages.value.nodes.has_more ? ["nodes"] : ["edges"];
    for (const section of sections) {
      const options: DiagramOptions = {
        ...props.scope,
        direction: props.target ? "incoming" : "schema",
        table: props.target?.name,
        section,
        limit: 50,
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
        return;
      }
      nextObjects = os;
      nextEdges = es;
      nextPages[section] = page;
      nextPartial ||= page.state === "unsupported" || page.items.some((i) => i.edge && i.edge.state !== "complete");
    }
    objects.value = nextObjects;
    edges.value = nextEdges;
    pages.value = nextPages;
    partial.value = nextPartial;
    stale.value = false;
    capped.value = false;
  } catch (cause) {
    if (abort.signal.aborted || generation !== current) return;
    stale.value = !!Object.keys(pages.value).length;
    unavailable.value =
      cause instanceof ChenGoError && [404, 405, 501].includes(cause.status) && cause.code !== "catalog_not_found";
    error.value = unavailable.value
      ? "OldBackend"
      : cause instanceof ChenGoError && cause.status === 403
        ? "Restricted"
        : "LoadError";
  } finally {
    if (generation === current) busy.value = false;
  }
}
watch([identity, () => props.api], () => {
  stop();
  objects.value = [];
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
    <div class="shrink-0 space-y-1 border-b border-default p-3 text-xs" aria-live="polite">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 break-words">
          {{ t(target ? "Chen.GoDiagramIncomingScope" : "Chen.GoDiagramSchemaScope") }} · {{ scope.database }}
          <span v-if="!target && scope.schema">/ {{ scope.schema }}</span>
        </span>
        <UButton
          :label="t('Chen.GoV1Refresh')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!ready || busy || unavailable"
          @click="load(true)"
        />
        <UButton
          v-if="more"
          :label="t('Chen.GoV1LoadMore')"
          color="neutral"
          variant="soft"
          size="xs"
          :disabled="!ready || busy || stale || capped || unavailable"
          @click="load()"
        />
      </div>
      <p>
        {{ t("Chen.GoDiagramLoaded", { nodes: tables.length, edges: edges.length }) }} ·
        {{ t(more || partial || capped || !pages.edges ? "Chen.GoDiagramPartial" : "Chen.GoDiagramComplete") }}
      </p>
      <p class="text-muted">{{ t("Chen.GoDiagramNonSnapshot") }}</p>
      <p v-if="pages.edges?.state === 'unsupported'">{{ t("Chen.GoDiagramUnsupported") }}</p>
      <p v-if="edges.some((edge) => edge.state === 'restricted')" class="text-warning">
        {{ t("Chen.GoDiagramRestricted") }}
      </p>
      <p v-if="capped" class="text-warning">{{ t("Chen.GoDiagramBudget") }}</p>
      <p v-if="stale || !ready" class="text-warning">{{ t("Chen.GoDiagramStale") }}</p>
      <p v-if="busy" role="status">{{ t("Chen.GoV1Loading") }}</p>
      <div v-if="error" role="alert" class="flex items-center gap-2 text-error">
        <span>{{ t(`Chen.GoDiagram${error}`) }}</span>
        <UButton
          v-if="!unavailable"
          :label="t('Chen.GoV1Retry')"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready || busy"
          @click="load(true)"
        />
      </div>
      <p v-if="pages.edges && !more && !partial && !edges.length">{{ t("Chen.GoDiagramNoVisibleRelations") }}</p>
    </div>
    <SchemaDiagram
      v-if="tables.length"
      :key="identity"
      class="min-h-0 flex-1"
      :tables="tables"
      :relationships-supported="pages.edges?.state !== 'unsupported'"
      :title="t(target ? 'Chen.GoDiagramIncoming' : 'Chen.GoDiagramTitle')"
      :openable="ready && !stale"
      :show-details="true"
      @open-object="open"
    />
  </section>
</template>
