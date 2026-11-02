<script setup lang="ts">
import type { ChenGoApi, GoCatalogObject } from "./api";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SchemaDiagram from "~/chen/components/SchemaDiagram.vue";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { diagramObjectId, inspectDiagram } from "./diagram";
const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  object: GoCatalogObject;
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
const identity = computed(() => diagramObjectId(props.sessionId, props.object));
let controller: AbortController | undefined;
function cancel() {
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
    const value = await api.catalogInspect(sessionId, object.schema, object.name, current.signal);
    if (current.signal.aborted || controller !== current) return;
    data.value = inspectDiagram(sessionId, object, dialect, value);
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
    <div class="shrink-0 border-b border-default px-3 py-2 text-xs">
      <div class="flex items-start gap-2">
        <p class="min-w-0 flex-1 text-muted">{{ t("Chen.GoDiagramScope") }}</p>
        <UButton
          :label="t(error ? 'Chen.GoV1Retry' : 'Chen.GoV1Refresh')"
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready || busy"
          @click="load"
        />
      </div>
      <div v-if="data" class="mt-1 flex flex-wrap gap-x-4 gap-y-1" role="status">
        <span v-for="(status, section) in data.statuses" :key="section" :data-diagram-section="section">
          {{ t(`Chen.GoDiagramSection_${section}`) }}: {{ t(`Chen.GoDiagram${status}`) }}
        </span>
      </div>
      <p v-if="!ready || stale" class="mt-1 text-warning">{{ t("Chen.GoDiagramStale") }}</p>
      <p v-if="busy" role="status" class="mt-1 text-muted">{{ t("Chen.GoV1Loading") }}</p>
      <p v-if="error" role="alert" class="mt-1 text-error">{{ error }}</p>
      <p v-if="data && data.tables[0]?.foreignKeys.length === 0" class="mt-1 text-muted">
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
    />
  </div>
</template>
