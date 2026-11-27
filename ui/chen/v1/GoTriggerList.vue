<script setup lang="ts">
import type { ChenGoApi, GoProgramSummary } from "./api";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { objectKey } from "./catalogIdentity";

const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  database: string;
  schema?: string;
  table?: string;
  functionOid?: number;
  ready: boolean;
  revision?: number;
}>();
const emit = defineEmits<{ program: [object: GoProgramSummary] }>();
const { t } = useI18n();
const items = ref<GoProgramSummary[]>([]);
const cursor = ref<string>();
const busy = ref(false);
const error = ref("");
let controller: AbortController;
async function load(append = false) {
  if (busy.value || !props.ready) return;
  const signal = controller.signal;
  busy.value = true;
  error.value = "";
  try {
    const page = await props.api.catalogPrograms(
      props.sessionId,
      {
        database: props.database,
        schema: props.schema,
        table: props.table,
        function_oid: props.functionOid,
        collection: "trigger",
        cursor: append ? cursor.value : undefined
      },
      signal
    );
    if (signal.aborted) return;
    const unique = new Map((append ? items.value : []).map((item) => [objectKey(item), item]));
    for (const item of page.items) unique.set(objectKey(item), item);
    items.value = [...unique.values()];
    cursor.value = page.has_more ? page.next_cursor : undefined;
  } catch (cause) {
    if (!signal.aborted) error.value = chenErrorText(cause, t);
  } finally {
    if (!signal.aborted) busy.value = false;
  }
}
watch(
  () => [props.sessionId, props.database, props.schema, props.table, props.functionOid, props.ready, props.revision],
  (_, __, onCleanup) => {
    controller = new AbortController();
    onCleanup(() => controller.abort());
    items.value = [];
    cursor.value = undefined;
    busy.value = false;
    error.value = "";
    void load();
  },
  { immediate: true }
);
</script>

<template>
  <div class="space-y-1 px-3 py-2 text-xs">
    <UButton
      v-for="item in items"
      :key="objectKey(item)"
      class="flex"
      size="xs"
      variant="link"
      color="neutral"
      icon="i-lucide-zap"
      :label="[item.ref.schema, item.ref.table, item.ref.name].filter(Boolean).join(' · ')"
      @click="emit('program', item)"
    />
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <p v-else-if="busy" role="status" class="text-muted">{{ t("Chen.GoV1Loading") }}</p>
    <p v-else-if="!items.length && ready" class="text-muted">{{ t("Chen.GoV1EmptyCatalog") }}</p>
    <UButton
      v-if="cursor || error"
      size="xs"
      variant="ghost"
      color="neutral"
      :disabled="busy || !ready"
      :label="t(error ? 'Chen.GoV1Retry' : 'Chen.GoV1LoadMore')"
      @click="load(!!cursor)"
    />
  </div>
</template>
