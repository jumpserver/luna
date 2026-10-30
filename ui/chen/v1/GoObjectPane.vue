<script setup lang="ts">
import type { ChenGoApi, GoCatalogColumn, GoCatalogObject } from "./api";
import type { ObjectWorkspaceSection } from "./workspace";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { diagramObjectId } from "./diagram";
import GoObjectDetails from "./GoObjectDetails.vue";
import GoObjectDiagram from "./GoObjectDiagram.vue";
const props = defineProps<{
  object: GoCatalogObject;
  section?: ObjectWorkspaceSection;
  active?: boolean;
  dialect: string;
  api: ChenGoApi;
  sessionId: string;
  ready: boolean;
  canCopy: boolean;
  canPaste: boolean;
}>();
const emit = defineEmits<{
  query: [];
  section: [section: ObjectWorkspaceSection];
  schemaEdit: [mode: "alter" | "index"];
}>();
const section = computed(() => props.section || "structure");
const view = ref<"columns" | "details">("columns");
const structureVisited = ref(false);
const ddlVisited = ref(false);
const detailsVisited = ref(false);
const diagramVisited = ref(false);
const identity = computed(() => diagramObjectId(props.sessionId, props.object));
const { t } = useI18n();
const columns = ref<GoCatalogColumn[]>([]);
const cursor = ref<string>();
const hasMore = ref(false);
const busy = ref(false);
const error = ref("");
const search = ref("");
const columnTable = ref<HTMLElement>();
const filteredColumns = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return columns.value
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column }) =>
        !query ||
        [column.name, column.data_type, column.comment || ""].some((value) => value.toLocaleLowerCase().includes(query))
    );
});
let controller: AbortController | undefined;
async function load(more = false) {
  if (!props.ready || busy.value) return;
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  busy.value = true;
  error.value = "";
  try {
    const page = await props.api.catalogColumns(
      props.sessionId,
      props.object.schema,
      props.object.name,
      more ? cursor.value : undefined,
      current.signal
    );
    if (current.signal.aborted) return;
    columns.value = more ? [...columns.value, ...page.items] : page.items;
    cursor.value = page.next_cursor;
    hasMore.value = page.has_more;
  } catch (cause) {
    if (!current.signal.aborted) error.value = chenErrorText(cause, t);
  } finally {
    if (!current.signal.aborted) busy.value = false;
  }
}
watch(
  () => [section.value, props.active, props.ready],
  () => {
    if (props.active === false) return;
    if (section.value === "structure" && !structureVisited.value && props.ready) {
      structureVisited.value = true;
      void load();
    }
    if (section.value === "ddl") ddlVisited.value = true;
    if (section.value === "diagram") diagramVisited.value = true;
  },
  { immediate: true }
);
watch(
  () => props.ready,
  (ready) => {
    if (!ready) {
      controller?.abort();
      busy.value = false;
    }
    if (ready && structureVisited.value && !columns.value.length && !busy.value) void load();
  }
);
watch(
  identity,
  () => {
    controller?.abort();
    busy.value = false;
    columns.value = [];
    cursor.value = undefined;
    hasMore.value = false;
    error.value = "";
    search.value = "";
    structureVisited.value = false;
    if (section.value === "structure") {
      structureVisited.value = true;
      void load();
    }
  },
  { flush: "sync" }
);
onBeforeUnmount(() => controller?.abort());
async function sectionKeydown(event: KeyboardEvent) {
  const keys: ObjectWorkspaceSection[] =
    props.object.kind === "table" ? ["data", "structure", "ddl", "diagram"] : ["data", "structure", "ddl"];
  const index = keys.indexOf(section.value);
  const key =
    event.key === "ArrowRight"
      ? keys[(index + 1) % keys.length]
      : event.key === "ArrowLeft"
        ? keys[(index + keys.length - 1) % keys.length]
        : event.key === "Home"
          ? keys[0]
          : event.key === "End"
            ? keys.at(-1)
            : undefined;
  if (!key) return;
  event.preventDefault();
  const list = event.currentTarget as HTMLElement;
  emit("section", key);
  await nextTick();
  list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
}
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
</script>

<template>
  <div class="flex min-w-0 flex-col" :class="section === 'data' ? 'shrink-0' : 'min-h-0 flex-1'" data-chen-structure>
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <UIcon :name="object.kind === 'view' ? 'i-lucide-eye' : 'i-lucide-table-2'" class="size-4" />
      <h2
        class="min-w-0 flex-1 truncate text-sm font-medium"
        :title="`${object.database}.${object.schema}.${object.name}`"
      >
        {{ object.database }}
        <template v-if="object.schema && object.schema !== object.database">/ {{ object.schema }}</template>
        / {{ object.name }}
      </h2>
      <UDropdownMenu
        v-if="object.kind === 'table'"
        :items="[
          {
            label: t('Chen.GoWriteAlter'),
            icon: 'i-lucide-table-properties',
            onSelect: () => emit('schemaEdit', 'alter')
          },
          { label: t('Chen.Indexes'), icon: 'i-lucide-list-filter', onSelect: () => emit('schemaEdit', 'index') }
        ]"
      >
        <UButton
          :label="t('Chen.GoWriteStructureActions')"
          icon="i-lucide-settings-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready"
        />
      </UDropdownMenu>
      <UButton
        v-if="section === 'structure' && view === 'columns'"
        icon="i-lucide-refresh-cw"
        :label="t('Chen.GoV1Refresh')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="busy || !ready"
        @click="load()"
      />
      <UButton
        :label="t('Chen.GoV1GenerateSelect')"
        icon="i-lucide-file-code-2"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="!canPaste || !ready"
        @click="emit('query')"
      />
    </div>
    <div
      role="tablist"
      :aria-label="t('Chen.GoTableWorkspaceSections')"
      class="flex shrink-0 flex-wrap items-center gap-1 border-b border-default px-3 py-1"
      @keydown="sectionKeydown"
    >
      <UButton
        v-for="item in [
          { key: 'data', label: t('Chen.GoTableWorkspaceData') },
          { key: 'structure', label: t('Chen.GoV1Structure') },
          { key: 'ddl', label: 'DDL' },
          { key: 'diagram', label: t('Chen.GoDiagramTitle') }
        ]"
        :key="item.key"
        role="tab"
        size="xs"
        variant="ghost"
        :tabindex="section === item.key ? 0 : -1"
        :label="item.label"
        :aria-selected="section === item.key"
        :color="section === item.key ? 'primary' : 'neutral'"
        :disabled="item.key === 'diagram' && object.kind !== 'table'"
        :title="item.key === 'diagram' && object.kind !== 'table' ? t('Chen.NotSupported') : undefined"
        @click="emit('section', item.key as ObjectWorkspaceSection)"
      />
    </div>
    <div v-show="section === 'structure'" class="flex shrink-0 items-center gap-1 border-b border-default px-3 py-1">
      <UButton
        :label="t('Chen.Columns')"
        size="xs"
        :color="view === 'columns' ? 'primary' : 'neutral'"
        variant="ghost"
        :aria-pressed="view === 'columns'"
        @click="view = 'columns'"
      />
      <UButton
        :label="t('Chen.GoV1ObjectDetails')"
        size="xs"
        :color="view === 'details' ? 'primary' : 'neutral'"
        variant="ghost"
        :aria-pressed="view === 'details'"
        @click="
          view = 'details';
          detailsVisited = true;
        "
      />
    </div>
    <GoObjectDiagram
      v-if="diagramVisited && object.kind === 'table'"
      v-show="section === 'diagram'"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :dialect="dialect"
      :ready="ready"
      :active="active !== false && section === 'diagram'"
      :can-copy="canCopy"
    />
    <GoObjectDetails
      v-if="detailsVisited"
      v-show="section === 'structure' && view === 'details'"
      :key="identity"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :ready="ready"
      :can-copy="canCopy"
    />
    <GoObjectDetails
      v-if="ddlVisited"
      v-show="section === 'ddl'"
      :key="`${identity}:ddl`"
      mode="ddl"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :ready="ready"
      :can-copy="canCopy"
    />
    <div
      v-show="section === 'structure' && view === 'columns'"
      class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-3 py-2"
    >
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('Chen.GoV1FindColumn')"
        :aria-label="t('Chen.GoV1FindColumn')"
        size="xs"
        class="w-64 max-w-full"
        @keydown.esc="search = ''"
        @keydown.down.prevent="columnTable?.focus()"
      >
        <template v-if="search" #trailing>
          <UButton
            icon="i-lucide-x"
            :aria-label="t('Chen.GoV1ClearSearch')"
            color="neutral"
            variant="link"
            size="xs"
            @click="search = ''"
          />
        </template>
      </UInput>
      <span role="status" class="text-xs text-muted">
        {{
          search.trim()
            ? t("Chen.GoV1ColumnsFiltered", { count: filteredColumns.length, loaded: columns.length })
            : t("Chen.GoV1ColumnsLoaded", { count: columns.length })
        }}
        <span v-if="hasMore">· {{ t("Chen.GoV1ColumnsPartial") }}</span>
      </span>
      <p v-if="object.comment" class="w-full break-words text-xs text-muted">{{ object.comment }}</p>
      <p v-if="!ready" class="w-full text-xs text-warning">{{ t("Chen.GoV1CatalogStale") }}</p>
    </div>
    <div
      v-if="error && section === 'structure' && view === 'columns'"
      role="alert"
      class="flex items-center gap-2 px-4 py-2 text-xs text-error"
    >
      {{ error }}
      <UButton
        :label="t('Chen.GoV1Retry')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!ready || busy"
        @click="load()"
      />
    </div>
    <div
      v-show="section === 'structure' && view === 'columns'"
      ref="columnTable"
      role="region"
      :aria-label="t('Chen.GoV1Structure')"
      :aria-busy="busy"
      tabindex="0"
      class="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
      :class="{ 'select-none': !canCopy }"
      @copy="preventCopy"
    >
      <table class="min-w-full border-collapse text-left text-xs">
        <thead class="sticky top-0 z-10 bg-[var(--data-grid-header-background)]">
          <tr>
            <th scope="col" class="w-12 border-b border-r border-default px-3 py-2 text-right font-normal text-muted">
              #
            </th>
            <th
              v-for="label in ['GoV1Column', 'GoV1DataType', 'GoV1Nullable', 'GoV1Comment']"
              :key="label"
              scope="col"
              class="border-b border-r border-default px-3 py-2 font-medium"
            >
              {{ t(`Chen.${label}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ column, index } in filteredColumns"
            :key="column.name"
            class="hover:bg-[var(--data-grid-row-hover)]"
          >
            <td class="border-b border-r border-default px-3 py-1.5 text-right tabular-nums text-muted">
              {{ index + 1 }}
            </td>
            <th
              scope="row"
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 font-ui-mono font-normal"
              :title="column.name"
            >
              {{ column.name }}
            </th>
            <td
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 font-ui-mono"
              :title="column.data_type"
            >
              {{ column.data_type }}
            </td>
            <td class="border-b border-r border-default px-3 py-1.5">
              {{ t(column.nullable ? "Chen.GoV1Yes" : "Chen.GoV1No") }}
            </td>
            <td class="min-w-40 max-w-lg break-words border-b border-default px-3 py-1.5" :title="column.comment">
              {{ column.comment || "—" }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="busy" role="status" class="flex items-center gap-2 p-4 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t("Chen.GoV1Loading") }}
      </div>
      <p v-else-if="!columns.length && !error" class="p-4 text-xs text-muted">{{ t("Chen.GoV1EmptyCatalog") }}</p>
      <p v-else-if="!filteredColumns.length && !error" class="p-4 text-xs text-muted">
        {{ t("Chen.GoV1NoMatchingColumns") }}
      </p>
      <UButton
        v-if="hasMore"
        class="m-3"
        :label="t('Chen.GoV1LoadMore')"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="busy || !ready"
        @click="load(true)"
      />
    </div>
  </div>
</template>
