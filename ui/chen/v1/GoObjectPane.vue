<script setup lang="ts">
import type { ChenGoApi, GoCatalogColumn, GoCatalogObject } from "./api";
import type { ObjectWorkspaceSection } from "./workspace";
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { workspaceButtonClass } from "~/shared/theme/workspaceButton";
import { diagramObjectId } from "./diagram";
import GoCatalogDiagram from "./GoCatalogDiagram.vue";
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
  diagramReady?: boolean;
  canCopy: boolean;
  canPaste: boolean;
}>();
const emit = defineEmits<{
  object: [object: GoCatalogObject];
  query: [];
  section: [section: ObjectWorkspaceSection];
  schemaEdit: [mode: "alter" | "index"];
}>();
const { t } = useI18n();
const section = computed(() => (props.section === "structure" ? "columns" : props.section || "columns"));
const structureVisited = ref(false);
const ddlVisited = ref(false);
const detailsVisited = ref(false);
const detailSection = computed(() =>
  ["basic", "primary_key", "indexes", "foreign_keys", "defaults", "constraints"].includes(section.value)
    ? (section.value as "basic" | "primary_key" | "indexes" | "foreign_keys" | "defaults" | "constraints")
    : "basic"
);
const propertySection = computed(() =>
  ["basic", "primary_key", "indexes", "foreign_keys", "defaults", "constraints"].includes(section.value)
);
const tabs = computed(() => [
  { key: "data", label: t("Chen.GoTableWorkspaceData") },
  { key: "basic", label: t("Chen.BasicInfo") },
  { key: "columns", label: t("Chen.Columns") },
  { key: "indexes", label: t("Chen.Indexes") },
  { key: "foreign_keys", label: t("Chen.ForeignKeys") },
  { key: "constraints", label: t("Chen.Constraints") },
  { key: "ddl", label: "DDL" },
  ...(props.object.kind === "table" ? [{ key: "diagram", label: t("Chen.GoDiagramTitle") }] : [])
]);
const diagramVisited = ref(false);
const diagramDirection = ref<"outgoing" | "incoming">("outgoing");
const details = useTemplateRef<InstanceType<typeof GoObjectDetails>>("details");
const ddlDetails = useTemplateRef<InstanceType<typeof GoObjectDetails>>("ddlDetails");
const outgoingDiagram = useTemplateRef<InstanceType<typeof GoObjectDiagram>>("outgoingDiagram");
const incomingDiagram = useTemplateRef<InstanceType<typeof GoCatalogDiagram>>("incomingDiagram");
const refreshTarget = computed(() => {
  if (propertySection.value) return details.value;
  if (section.value === "ddl") return ddlDetails.value;
  if (section.value === "diagram") {
    return diagramDirection.value === "outgoing" ? outgoingDiagram.value : incomingDiagram.value;
  }
  return null;
});
const identity = computed(() => diagramObjectId(props.sessionId, props.object));
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
function refresh() {
  if (section.value === "columns") return load();
  return refreshTarget.value?.refresh();
}
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
      current.signal,
      props.object.database
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
    if (section.value === "columns" && !structureVisited.value && props.ready) {
      structureVisited.value = true;
      void load();
    }
    if (propertySection.value) detailsVisited.value = true;
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
    if (ready && props.active !== false && section.value === "columns" && !columns.value.length && !busy.value)
      void load();
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
    if (props.active !== false && props.ready && section.value === "columns") {
      structureVisited.value = true;
      void load();
    }
  },
  { flush: "sync" }
);
onBeforeUnmount(() => controller?.abort());
async function sectionKeydown(event: KeyboardEvent) {
  const keys: ObjectWorkspaceSection[] = tabs.value.map((tab) => tab.key as ObjectWorkspaceSection);
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
    <div class="flex h-(--workspace-sub-tab-height) min-w-0 shrink-0 items-center gap-1 border-b border-default px-2">
      <div
        role="tablist"
        :aria-label="t('Chen.GoTableWorkspaceSections')"
        class="flex min-w-0 flex-1 items-center gap-px overflow-x-auto whitespace-nowrap"
        @keydown="sectionKeydown"
      >
        <UButton
          v-for="item in tabs"
          :key="item.key"
          role="tab"
          size="xs"
          variant="ghost"
          class="shrink-0 aria-selected:bg-(--app-selected-soft)"
          :class="section === item.key ? undefined : workspaceButtonClass"
          :tabindex="section === item.key ? 0 : -1"
          :label="item.label"
          :aria-selected="section === item.key"
          :color="section === item.key ? 'primary' : 'neutral'"
          @click="emit('section', item.key as ObjectWorkspaceSection)"
        />
      </div>
      <UButton
        v-if="section === 'columns' || refreshTarget"
        icon="i-lucide-refresh-cw"
        :aria-label="t('Chen.GoV1Refresh')"
        :title="t('Chen.GoV1Refresh')"
        size="xs"
        color="neutral"
        variant="ghost"
        class="shrink-0"
        :class="workspaceButtonClass"
        :disabled="section === 'columns' ? !ready || busy : refreshTarget?.refreshDisabled"
        @click="refresh"
      />
      <UDropdownMenu
        :items="[
          {
            label: t('Chen.GoV1GenerateSelect'),
            icon: 'i-lucide-file-code-2',
            disabled: !canPaste || !ready,
            onSelect: () => emit('query')
          },
          { label: t('RightPanel.SQLAIMetadataCategory.primary_keys'), onSelect: () => emit('section', 'primary_key') },
          { label: t('RightPanel.SQLAIMetadataCategory.default_values'), onSelect: () => emit('section', 'defaults') },
          ...(object.kind === 'table'
            ? [
                {
                  label: t('Chen.GoWriteAlter'),
                  icon: 'i-lucide-table-properties',
                  disabled: !ready,
                  onSelect: () => emit('schemaEdit', 'alter')
                },
                {
                  label: t('Chen.Indexes'),
                  icon: 'i-lucide-list-filter',
                  disabled: !ready,
                  onSelect: () => emit('schemaEdit', 'index')
                }
              ]
            : [])
        ]"
      >
        <UButton
          icon="i-lucide-ellipsis"
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0 aria-expanded:bg-(--app-selected-soft) aria-expanded:text-(--app-fg)"
          :class="workspaceButtonClass"
          :aria-label="t('Chen.GoTableObjectMenu')"
          :title="`${object.database}.${object.schema}.${object.name}`"
        />
        <template #item-leading="{ item, active: itemActive, ui }">
          <UIcon v-if="item.icon" :name="item.icon" :class="ui.itemLeadingIcon({ active: itemActive })" />
          <span v-else aria-hidden="true" :class="ui.itemLeadingIcon()" />
        </template>
      </UDropdownMenu>
    </div>
    <nav
      v-if="
        diagramVisited &&
        section === 'diagram' &&
        [
          'postgresql',
          'mysql',
          'mariadb',
          'oceanbase-mysql',
          'sqlserver',
          'oracle',
          'dameng',
          'oceanbase-oracle',
          'db2',
          'clickhouse'
        ].includes(dialect)
      "
      class="flex shrink-0 flex-wrap gap-1 border-b border-default px-3 py-1"
    >
      <UButton
        v-for="direction in ['outgoing', 'incoming'] as const"
        :key="direction"
        :label="t(direction === 'outgoing' ? 'Chen.GoDiagramOutgoing' : 'Chen.GoDiagramIncoming')"
        :aria-pressed="diagramDirection === direction"
        :color="diagramDirection === direction ? 'primary' : 'neutral'"
        variant="ghost"
        class="aria-pressed:bg-(--app-selected-soft)"
        :class="diagramDirection === direction ? undefined : workspaceButtonClass"
        size="xs"
        @click="diagramDirection = direction"
      />
    </nav>
    <GoCatalogDiagram
      v-if="diagramVisited && diagramDirection === 'incoming'"
      v-show="section === 'diagram'"
      ref="incomingDiagram"
      :api="api"
      :session-id="sessionId"
      :dialect="dialect"
      :scope="{ database: object.database, schema: object.schema }"
      :target="object"
      :ready="ready && diagramReady !== false"
      :active="active !== false && section === 'diagram'"
      :can-copy="canCopy"
      @object="emit('object', $event)"
    />
    <GoObjectDiagram
      v-if="diagramVisited && object.kind === 'table' && diagramDirection === 'outgoing'"
      v-show="section === 'diagram'"
      ref="outgoingDiagram"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :dialect="dialect"
      :ready="ready && diagramReady !== false"
      :active="active !== false && section === 'diagram'"
      :can-copy="canCopy"
    />
    <GoObjectDetails
      v-if="detailsVisited"
      v-show="propertySection"
      :key="identity"
      ref="details"
      :visible="active !== false && propertySection"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :ready="ready"
      :can-copy="canCopy"
      :detail-section="detailSection"
    />
    <GoObjectDetails
      v-if="ddlVisited"
      v-show="section === 'ddl'"
      :key="`${identity}:ddl`"
      ref="ddlDetails"
      :visible="active !== false && section === 'ddl'"
      mode="ddl"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :ready="ready"
      :can-copy="canCopy"
    />
    <div
      v-show="section === 'columns'"
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
      v-if="error && section === 'columns'"
      role="alert"
      class="flex items-center gap-2 px-4 py-2 text-xs text-error"
    >
      {{ error }}
      <UButton
        :label="t('Chen.GoV1Retry')"
        size="xs"
        color="neutral"
        variant="ghost"
        :class="workspaceButtonClass"
        :disabled="!ready || busy"
        @click="load()"
      />
    </div>
    <div
      v-show="section === 'columns'"
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
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 font-normal"
              :title="column.name"
            >
              {{ column.name }}
            </th>
            <td
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 text-muted"
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
        variant="ghost"
        :class="workspaceButtonClass"
        :disabled="busy || !ready"
        @click="load(true)"
      />
    </div>
  </div>
</template>
